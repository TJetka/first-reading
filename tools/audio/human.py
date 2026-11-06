"""Decode pinned human recordings to unfiltered mono PCM for the offline cut editor."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import sys
import wave
from array import array
from pathlib import Path

import miniaudio

SAMPLE_RATE = 44100


def pcm_wav(samples: array, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Encode signed 16-bit samples as little-endian mono WAV, without filtering."""
    if samples.typecode != "h" or not samples or sample_rate <= 0:
        raise ValueError("Expected non-empty PCM16 and positive sample rate")
    little_endian = array("h", samples)
    if sys.byteorder != "little":
        little_endian.byteswap()
    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        stream.writeframes(little_endian.tobytes())
    return output.getvalue()


def prepare_clip(path: Path, expected_hash: str) -> dict[str, str | float | int]:
    """Verify downloaded bytes before decoding; retain the original file untouched."""
    if not path.is_file() or path.stat().st_size > 5_000_000:
        raise ValueError(f"Missing or oversized recording: {path.name}")
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
        raise ValueError(f"Source hash mismatch: {path.name}")
    decoded = miniaudio.decode_file(str(path), nchannels=1, sample_rate=SAMPLE_RATE)
    if not 0 < len(decoded.samples) <= SAMPLE_RATE * 15:
        raise ValueError(f"Recording must be between 0 and 15 seconds: {path.name}")
    wav_bytes = pcm_wav(decoded.samples)
    return {
        "duration": len(decoded.samples) / SAMPLE_RATE,
        "sampleRate": SAMPLE_RATE,
        "frames": len(decoded.samples),
        "pcmSHA256": hashlib.sha256(wav_bytes).hexdigest(),
        "dataURL": "data:audio/wav;base64," + base64.b64encode(wav_bytes).decode("ascii"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    sources = json.loads(args.manifest.read_text())["sources"]
    result = {}
    for source in sources:
        filename = source["file"]
        if Path(filename).name != filename or Path(filename).suffix not in {".mp3", ".wav"}:
            raise ValueError("Unsafe source filename")
        path = (args.cache / filename).resolve()
        if path.parent != args.cache.resolve():
            raise ValueError("Source escapes cache directory")
        result[filename] = prepare_clip(path, source["sha256"])
    print(json.dumps(result))


if __name__ == "__main__":
    main()
