"""Human recordings are decoded deterministically; tests never download audio."""

import hashlib
import io
import sys
import wave
from array import array
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from human import pcm_wav, prepare_clip  # noqa: E402


def test_pcm_preserves_samples_and_units() -> None:
    samples = array("h", [-32768, -100, 0, 100, 32767] * 200)
    encoded = pcm_wav(samples)
    with wave.open(io.BytesIO(encoded), "rb") as stream:
        assert (stream.getnchannels(), stream.getsampwidth(), stream.getframerate()) == (
            1,
            2,
            44100,
        )
        assert stream.getnframes() == len(samples)
        actual = array("h", stream.readframes(len(samples)))
        if sys.byteorder != "little":
            actual.byteswap()
        assert actual == samples
    assert pcm_wav(samples) == encoded


def test_decode_smoke_retains_original_and_checks_hash(tmp_path: Path) -> None:
    source = pcm_wav(array("h", [0, 1000, -1000, 0] * 441))
    path = tmp_path / "human.wav"
    path.write_bytes(source)
    digest = hashlib.sha256(source).hexdigest()
    clip = prepare_clip(path, digest)
    assert clip["sampleRate"] == 44100
    assert clip["frames"] == 1764
    assert clip["duration"] == pytest.approx(0.04)
    assert clip["pcmSHA256"] == digest
    assert str(clip["dataURL"]).startswith("data:audio/wav;base64,")
    assert path.read_bytes() == source
    assert prepare_clip(path, digest) == clip
    with pytest.raises(ValueError, match="hash mismatch"):
        prepare_clip(path, "0" * 64)
    assert path.read_bytes() == source


def test_missing_and_empty_recordings_are_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Missing"):
        prepare_clip(tmp_path / "absent.wav", "0" * 64)
    with pytest.raises(ValueError, match="non-empty"):
        pcm_wav(array("h"))
