"""Small deterministic tests; never load a model or access the network."""

import importlib.util
import struct
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location("render", Path(__file__).parents[1] / "render.py")
assert SPEC and SPEC.loader
render = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(render)


def word() -> dict:
    return {
        "id": "w0001",
        "word": "kot",
        "category": "Zwierzęta",
        "level": 1,
        "difficultyFeatures": [],
        "syllables": [{"text": "kot", "audio": "audio/w0001/word.mp3"}],
        "wordAudio": "audio/w0001/word.mp3",
    }


def test_monosyllable_has_one_job() -> None:
    assert render.clip_jobs(word()) == [("audio/w0001/word.mp3", "kot")]


def test_conflicting_text_or_traversal_is_rejected() -> None:
    record = word()
    record["syllables"][0]["text"] = "ko"
    with pytest.raises(ValueError, match="Conflicting"):
        render.clip_jobs(record)
    record = word()
    record["wordAudio"] = "../word.mp3"
    with pytest.raises(ValueError, match="Unsafe"):
        render.clip_jobs(record)


def test_pcm_duration_and_normalized_rms() -> None:
    pcm = struct.pack("<2205h", *([8192] * 2205))
    assert render.pcm_stats(pcm, 22050) == (0.1, 0.25)
    encoded = render.encode_mp3(pcm, 22050)
    assert len(encoded) > 100
    assert encoded[0] == 0xFF and encoded[1] & 0xE0 == 0xE0


@pytest.mark.parametrize("pcm", [b"", b"x", bytes(4410)])
def test_silent_or_malformed_audio_is_rejected(pcm: bytes) -> None:
    with pytest.raises(ValueError):
        render.pcm_stats(pcm, 22050)


def test_content_hash_changes_with_text_or_syllables() -> None:
    record = word()
    initial = render.word_hash(record)
    assert len(initial) == 64
    record["syllables"][0]["text"] = "ko"
    assert render.word_hash(record) != initial
