"""Render redistributable Polish MP3s offline; never create editorial approvals."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import re
import struct
import subprocess
from pathlib import Path
from typing import TypedDict, cast

MODEL_REVISION = "e7229f7d33a10e145e109b886d661984201ac3c4"
MODEL_SHA256 = "38f66464240ed74f186e6b7dc13c6e3b22e023426299f25c2b3cc9dfa9373fbc"
MODEL_URL = (
    "https://huggingface.co/rhasspy/piper-voices/blob/"
    f"{MODEL_REVISION}/pl/pl_PL/gosia/medium/MODEL_CARD"
)
AUDIO_PATH = re.compile(r"audio/w\d{4}/(?:word|[1-3])\.mp3\Z")
WORD_FIELDS = ("id", "word", "category", "level", "difficultyFeatures", "syllables", "wordAudio")


class Syllable(TypedDict):
    text: str
    audio: str


class Word(TypedDict):
    id: str
    word: str
    category: str
    level: int
    difficultyFeatures: list[str]
    syllables: list[Syllable]
    wordAudio: str


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def word_hash(word: Word) -> str:
    """Match scripts/content.mjs canonical field order and UTF-8 encoding."""
    snapshot = {key: word[key] for key in WORD_FIELDS}
    return digest(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode())


def clip_jobs(word: Word) -> list[tuple[str, str]]:
    """Return unique (project-relative MP3 path, spoken text) jobs for one word."""
    jobs = {word["wordAudio"]: word["word"]}
    for syllable in word["syllables"]:
        path, text = syllable["audio"], syllable["text"]
        if path in jobs and jobs[path] != text:
            raise ValueError(f"Conflicting audio text for {word['id']}")
        jobs[path] = text
    if any(not AUDIO_PATH.fullmatch(path) for path in jobs):
        raise ValueError(f"Unsafe audio path for {word['id']}")
    return list(jobs.items())


def pcm_stats(pcm: bytes, sample_rate: int) -> tuple[float, float]:
    """Duration in seconds and normalized RMS for signed 16-bit mono little-endian PCM."""
    if not pcm or len(pcm) % 2 or sample_rate <= 0:
        raise ValueError("Invalid PCM buffer")
    samples = [value[0] for value in struct.iter_unpack("<h", pcm)]
    duration = len(samples) / sample_rate
    rms = math.sqrt(sum(value * value for value in samples) / len(samples)) / 32768
    if not 0.05 <= duration <= 8 or rms < 0.002:
        raise ValueError(f"Unusable synthesized clip: duration={duration:.3f}s, RMS={rms:.4f}")
    return duration, rms


def encode_mp3(pcm: bytes, sample_rate: int) -> bytes:
    """Encode mono PCM at 64 kb/s; no encoder is needed in the deployed app."""
    import lameenc

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(64)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(2)
    return bytes(encoder.encode(pcm) + encoder.flush())


def render(root: Path, model: Path) -> None:
    """Render missing clips with a pinned model and per-path seeds; preserve existing audio."""
    import onnxruntime
    from piper import PiperVoice, SynthesisConfig

    root, model = root.resolve(), model.resolve()
    subprocess.run(["node", str(root / "scripts/validate.mjs")], cwd=root, check=True)
    if digest(model.read_bytes()) != MODEL_SHA256:
        raise ValueError("Voice model hash does not match the pinned upstream model")
    catalogue_bytes = (root / "word-catalogue.json").read_bytes()
    words = cast(list[Word], json.loads(catalogue_bytes)["words"])
    settings = {
        "engine": f"piper-tts {importlib.metadata.version('piper-tts')}",
        "encoder": f"lameenc {importlib.metadata.version('lameenc')}",
        "voice": "pl_PL-gosia-medium",
        "modelRevision": MODEL_REVISION,
        "modelHash": MODEL_SHA256,
        "modelConfigHash": digest(Path(f"{model}.json").read_bytes()),
        "lengthScale": 1.1,
        "volume": 0.8,
        "bitrateKbps": 64,
        "seed": "first 8 SHA-256 hex digits of each clip path, modulo 2^31",
    }
    configuration_hash = digest(json.dumps(settings, sort_keys=True).encode())
    manifest_path = root / "content/public-audio.json"
    manifest = {
        "schemaVersion": 1,
        "purpose": "public-preview",
        "license": "MIT",
        "datasetLicense": "CC0-1.0",
        "source": MODEL_URL,
        "redistributionPermission": MODEL_URL,
        "settings": settings,
        "configurationHash": configuration_hash,
        "catalogueHash": digest(catalogue_bytes),
        "editorialApproved": False,
        "audioApproved": False,
        "clips": {},
    }
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())
        if previous["configurationHash"] != configuration_hash:
            raise ValueError("Existing audio uses different settings; refusing to overwrite")
        manifest["clips"] = previous["clips"]
    try:
        manifest["gitSHA"] = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, check=True, capture_output=True, text=True
        ).stdout.strip()
    except subprocess.CalledProcessError:
        manifest["gitSHA"] = None
    voice = PiperVoice.load(model)
    synthesis = SynthesisConfig(length_scale=1.1, volume=0.8, normalize_audio=True)
    count = 0
    for word in words:
        content_hash = word_hash(word)
        for relative, text in clip_jobs(word):
            target = (root / relative).resolve()
            if not target.is_relative_to(root / "audio"):
                raise ValueError(f"Audio path escapes project: {relative}")
            previous = manifest["clips"].get(relative)
            if target.exists():
                if (
                    not previous
                    or previous["wordHash"] != content_hash
                    or previous["sha256"] != digest(target.read_bytes())
                ):
                    raise ValueError(f"Existing audio changed or lacks provenance: {relative}")
            else:
                onnxruntime.set_seed(int(digest(relative.encode())[:8], 16) % (2**31))
                chunks = list(voice.synthesize(text, syn_config=synthesis))
                if not chunks or any(c.sample_channels != 1 or c.sample_width != 2 for c in chunks):
                    raise ValueError(f"Unsupported synthesized format: {relative}")
                sample_rate = chunks[0].sample_rate
                pcm = b"".join(chunk.audio_int16_bytes for chunk in chunks)
                duration, rms = pcm_stats(pcm, sample_rate)
                encoded = encode_mp3(pcm, sample_rate)
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("xb") as output:
                    output.write(encoded)
                manifest["clips"][relative] = {
                    "wordHash": content_hash,
                    "sha256": digest(encoded),
                    "durationSeconds": round(duration, 4),
                    "rms": round(rms, 5),
                    "sampleRate": sample_rate,
                }
            count += 1
            temporary = manifest_path.with_suffix(".tmp")
            temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
            temporary.replace(manifest_path)
            if count % 100 == 0:
                print(f"{count} public-preview MP3s ready", flush=True)
    print(f"Completed {count} clips; native-speaker review remains pending.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--model", type=Path, required=True)
    arguments = parser.parse_args()
    render(arguments.root, arguments.model)
