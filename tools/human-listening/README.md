# Human voice prototype

Five words, 13 editable syllables: **mama, domino, torebka, malina, szafa**.
Human recordings from Wikimedia Commons/Lingua Libre; exact source links, licenses
and SHA-256 hashes are pinned in [sources.json](sources.json). Four speakers are used.

```sh
uv sync --project tools/audio --locked
npm run human:fetch     # download missing pinned sources; preserve existing files
npm run human:build     # standalone offline page
npm run human           # optional server: http://127.0.0.1:8002/human/
```

Open `.cache/listening-lab/human/index.html` directly in Safari or Chrome.
Audio is embedded; playback, edits and exports need no network or microphone.
The small miniaudio decoder is pinned in the optional Python environment; no model is needed.

1. Play **Human word**, then **Original recording** to check the proposed word cut.
2. Select a syllable; move its start/end by sliders, seconds or ±10 ms. Replay and compare with Piper.
3. Judge the source and cut separately. Editing a cut resets its verdict. Overlaps are allowed.
4. Export the review JSON to preserve bounds, notes, hashes and credits. Import it to resume.
   **WAV + credits** exports the selected frames with source/license metadata in RIFF INFO/ICMT.

Boundaries are rough manual suggestions, not forced alignment or reviewed pronunciation.
“Szafa” is excerpted from “szafa trzydrzwiowa”; its whole-word boundary is also editable.
Decoding uses 44.1 kHz mono PCM16, without filtering, normalization or speed changes.
Natural speech can still produce incomplete syllables when cut; reject those examples.
CC BY-SA clips and adaptations retain the source license; credits travel with exports.

Browser storage is best-effort, especially for `file://`; export before moving/rebuilding the page.
Generated pages/audio/reviews stay in `.cache/`. This tool never changes the app or release approvals.
Checks: `node --test tests/human.test.mjs`, `npm run check`, and pytest/ruff in `tools/audio/`.
