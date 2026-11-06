# Local listening lab

```sh
npm run compare          # http://127.0.0.1:8001/compare/
npm run compare:build    # build the standalone offline page only
```

Open `.cache/listening-lab/compare/index.html` directly in Safari or Chrome when
a server is unavailable. All 100 audio clips are embedded; no network is used.
Setup on another machine: install the [audio renderer and pinned model](../audio/README.md).

- Twenty word-specific trials, focusing on short syllables and Polish consonant groups.
- Four variants: published MP3, slower text with punctuation, explicit stress, stress plus slower.
- Hide/reveal method names; play the full word; rate clarity, tag problems and choose a preference.
- Scores are optional; “None are good enough” counts as a reviewed trial.
- Reviews save in this browser. Export JSON to resume elsewhere; CSV for analysis.
- Import an external MP3/WAV per trial, or batch filenames such as `w0369-2.mp3`.
  Download the sample list for all filenames. Imported audio stays in the current tab;
  reimport it after reopening. Reviews bind to exact file hashes, not filenames.
- Keys 1–4 play samples, arrows change trials, Esc stops audio (outside form controls).

Generated audio and reviews are local experiments, not pronunciation approvals.
The stress variants use Piper's inferred phonemes, not educator-reviewed transcriptions.
Alternatives are WAVs with 80 ms padding at each end; the baseline is the exact published MP3.
Waveforms use each clip's own time axis. Synthesis settings, seeds, source/model/script hashes
and Git revision are recorded under `.cache/audio-comparison/`; source audio is preserved.

Checks: `node --test tests/comparison.test.mjs`, `npm run check`, and pytest/ruff
in `tools/audio/`. Generated HTML/audio and personal reviews stay out of Git and Pages.
