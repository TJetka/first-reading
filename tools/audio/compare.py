"""Generate a small, reproducible listening experiment without changing published audio."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import subprocess
import wave
from pathlib import Path

from render import MODEL_SHA256, digest, pcm_stats

# Word and zero-based position preserve the pronunciation context being judged.
CASES = [
    ("domino", 1),
    ("torebka", 0),
    ("spódnica", 1),
    ("aparat", 0),
    ("rowerek", 1),
    ("pole", 1),
    ("farba", 1),
    ("malina", 0),
    ("papuga", 1),
    ("ryba", 0),
    ("woda", 1),
    ("balon", 0),
    ("szafa", 1),
    ("szafa", 0),
    ("ślimaczek", 0),
    ("szczeniaczek", 1),
    ("cebula", 2),
    ("ananas", 1),
    ("orzechy", 2),
    ("szczeniaczek", 0),
]
VARIANTS = [
    {"id": "original", "label": "Published", "description": "The exact MP3 used in the app."},
    {
        "id": "slower",
        "label": "Slower + punctuation",
        "lengthScale": 1.65,
        "description": "Text with a final full stop; synthesis length scale 1.65.",
    },
    {
        "id": "stress",
        "label": "Explicit stress",
        "lengthScale": 1.1,
        "description": "Piper phonemes with primary stress; length scale 1.10.",
    },
    {
        "id": "stress-slower",
        "label": "Stress + slower",
        "lengthScale": 1.65,
        "description": "Primary stress with length scale 1.65.",
    },
]


def stressed_phonemes(phonemes: list[str]) -> list[str]:
    """Emphasize an isolated syllable; this is an experiment, not reviewed Polish IPA."""
    phones = [p for p in phonemes if p not in {"ˈ", "ˌ", ".", ",", "!", "?", " "}]
    if not phones:
        raise ValueError("Empty phoneme sequence")
    return ["ˈ", *phones, "."]


def select_cases(catalogue: dict) -> list[dict]:
    """Resolve the fixed trial against catalogue IDs; fail if source content moved."""
    words = {word["word"]: word for word in catalogue["words"]}
    result = []
    for text, position in CASES:
        word = words[text]
        syllable = word["syllables"][position]
        result.append(
            {
                "id": f"{word['id']}-{position + 1}",
                "wordId": word["id"],
                "word": text,
                "syllables": [s["text"] for s in word["syllables"]],
                "position": position,
                "text": syllable["text"],
                "originalPath": syllable["audio"],
                "wordPath": word["wordAudio"],
            }
        )
    return result


def render_experiment(root: Path, model: Path, output: Path) -> Path:
    """Write generated WAVs and a hash-bound manifest under an ignored local directory."""
    import numpy as np
    import onnxruntime
    from piper import PiperVoice, SynthesisConfig

    root, model, output = root.resolve(), model.resolve(), output.resolve()
    if not output.is_relative_to(root / ".cache"):
        raise ValueError("Comparison output must stay under the project's .cache directory")
    if digest(model.read_bytes()) != MODEL_SHA256:
        raise ValueError("Pinned Gosia model hash mismatch")
    catalogue_bytes = (root / "word-catalogue.json").read_bytes()
    cases = select_cases(json.loads(catalogue_bytes))
    settings = {
        "modelHash": MODEL_SHA256,
        "configHash": digest(Path(f"{model}.json").read_bytes()),
        "engine": importlib.metadata.version("piper-tts"),
        "variants": VARIANTS,
        "scriptHash": digest(Path(__file__).read_bytes()),
        "paddingSeconds": 0.08,
        "peakAmplitude": 0.8,
        "seed": "SHA-256(case ID + variant ID), first 8 hex modulo 2^31",
    }
    fingerprint = digest(json.dumps(settings, sort_keys=True).encode() + catalogue_bytes)
    destination = output / fingerprint[:16]
    destination.mkdir(parents=True, exist_ok=True)
    manifest_path = destination / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if all(
            digest((root / clip["path"]).read_bytes()) == clip["sha256"]
            for case in manifest["cases"]
            for clip in [case["wordClip"], *case["clips"].values()]
        ):
            print(manifest_path, flush=True)
            return manifest_path
        raise ValueError("A comparison file changed; refusing to overwrite it")
    public = json.loads((root / "content/public-audio.json").read_text())
    voice = PiperVoice.load(model)
    for case in cases:
        case["wordClip"] = {"path": case.pop("wordPath")}
        case["wordClip"]["sha256"] = digest((root / case["wordClip"]["path"]).read_bytes())
        original = case.pop("originalPath")
        case["clips"] = {
            "original": {
                "path": original,
                "sha256": digest((root / original).read_bytes()),
                "durationSeconds": public["clips"][original]["durationSeconds"],
            }
        }
        for variant in VARIANTS[1:]:
            seed = int(digest(f"{case['id']}:{variant['id']}".encode())[:8], 16) % (2**31)
            onnxruntime.set_seed(seed)
            config = SynthesisConfig(
                length_scale=variant["lengthScale"], normalize_audio=True, volume=0.8
            )
            if variant["id"] == "slower":
                phones = voice.phonemize(f"{case['text']}.")[0]
            else:
                phones = stressed_phonemes(voice.phonemize(case["text"])[0])
            audio = voice.phoneme_ids_to_audio(voice.phonemes_to_ids(phones), config)
            peak = float(np.max(np.abs(audio)))
            if peak < 1e-8:
                raise ValueError(f"Silent synthesis: {case['id']}")
            pcm = (np.clip(audio / peak * 0.8, -1, 1) * 32767).astype("<i2").tobytes()
            duration, rms = pcm_stats(pcm, voice.config.sample_rate)
            padding = bytes(round(voice.config.sample_rate * 0.08) * 2)
            target = destination / f"{case['id']}-{variant['id']}.wav"
            if target.exists():
                raise ValueError(
                    f"Partial experiment file exists: {target.name}; use a new output directory"
                )
            with wave.open(str(target), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(voice.config.sample_rate)
                wav.writeframes(padding + pcm + padding)
            case["clips"][variant["id"]] = {
                "path": str(target.relative_to(root)),
                "sha256": digest(target.read_bytes()),
                "durationSeconds": round(duration, 4),
                "paddingSeconds": 0.16,
                "rms": round(rms, 5),
                "phonemes": "".join(phones),
                "seed": seed,
            }
        print(f"Ready: {case['text']} in {case['word']}", flush=True)
    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True
    )
    manifest = {
        "schemaVersion": 1,
        "id": fingerprint,
        "catalogueHash": digest(catalogue_bytes),
        "gitSHA": revision.stdout.strip() or None,
        "settings": settings,
        "variants": VARIANTS,
        "cases": cases,
        "purpose": "local-listening-experiment",
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(manifest_path, flush=True)
    return manifest_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--model", type=Path, required=True)
    args = parser.parse_args()
    render_experiment(args.root, args.model, args.root / ".cache/audio-comparison")
