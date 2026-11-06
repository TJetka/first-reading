"""Comparison transforms use tiny fixtures without model inference or network calls."""

import importlib.util
import sys
from pathlib import Path

import pytest

DIRECTORY = Path(__file__).parents[1]
sys.path.insert(0, str(DIRECTORY))
SPEC = importlib.util.spec_from_file_location("comparison", DIRECTORY / "compare.py")
assert SPEC and SPEC.loader
comparison = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(comparison)


@pytest.mark.parametrize("phones", [["m", "i"], ["m", "ˈ", "i", "."], ["ˌ", "m", "i"]])
def test_stress_is_explicit_and_does_not_duplicate(phones: list[str]) -> None:
    assert comparison.stressed_phonemes(phones) == ["ˈ", "m", "i", "."]
    assert comparison.stressed_phonemes(phones) == comparison.stressed_phonemes(phones)


def test_empty_phonemes_are_rejected() -> None:
    with pytest.raises(ValueError, match="Empty"):
        comparison.stressed_phonemes([" ", "."])


def test_cases_preserve_word_and_position() -> None:
    words = []
    for word, position in comparison.CASES:
        if any(item["word"] == word for item in words):
            continue
        words.append(
            {
                "id": f"w{len(words):04}",
                "word": word,
                "wordAudio": "audio/word.mp3",
                "syllables": [{"text": f"s{n}", "audio": f"audio/{n}.mp3"} for n in range(3)],
            }
        )
    cases = comparison.select_cases({"words": words})
    assert len(cases) == len({item["id"] for item in cases}) == 20
    assert all(item["text"] == item["syllables"][item["position"]] for item in cases)
    assert len(comparison.VARIANTS) == 4
