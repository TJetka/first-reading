# Build and release

Use Node 25.9.0 (`.node-version` / `.nvmrc`) and npm 11.12.1. No installed dependencies
are needed at runtime or for the Node test suite. `npm ci` verifies the lockfile offline.

## Develop

```sh
npm ci --offline
npm run audio:generate          # macOS: render 1,300 draft WAVs with Polish Zosia
npm run check                   # catalogue validation + all deterministic tests
npm run dev                     # http://localhost:8000/first-reading/
```

Restart `dev` after source edits. If sockets are unavailable, run `npm run build:preview`
and open `preview/first-reading/local-preview.html` directly in Chrome.

| Command | Result |
| --- | --- |
| `node --test tests/round.test.mjs` | Focused logic tests; 1,000 draws per level. |
| `npm run test:coverage` | Node coverage report; no external services. |
| `node tests/browser-fixtures.mjs` | After preview build: longest-word and missing-audio HTML fixtures. |
| `npm run review` | Approved counts and pending reasons. |
| `npm run review -- w0001` | Pending record template; never changes approvals. |
| `npm run build:preview` | All draft words/audio in `preview/`; never deploy. |
| `npm run build:prototype` | Exactly 12 approved words in `dist/first-reading/`. |
| `npm run build` | 200–500 approved words, both 5/5/2 pools, seven digraphs. |

## Audio preparation

`audio:generate` uses installed macOS `say`, voice Zosia, 145 words/minute, mono
22,050 Hz WAV. Add `-- prototype` for just kot, dom, las, sok, rak, mama, ryba,
woda, rower, balon, malina and papuga. Matching clips are reused on reruns.
Generated files live in `.cache/draft-audio/`; its manifest records settings,
source catalogue hash and individual file hashes. Source MP3 paths stay unchanged.

These clips are **unreviewed, private previews**. Apple system voices cannot be
publicly redistributed under [macOS Sequoia §2F](https://www.apple.com/legal/sla/docs/macOSSequoia.pdf).
For release, record or render a Polish voice whose terms permit redistribution;
place real MP3s at the exact paths in `word-catalogue.json`. No system voice is
needed on the learner's device. Review isolated syllables for added vowels and
letter names; review complete words for natural stress and continuous speech.

## Review recordings

1. A Polish early-years reviewer checks familiarity, level and explicit syllable boundaries.
2. A native speaker listens to **every exact clip** in its word context, including whole words.
3. Copy the `npm run review -- <id>` JSON record into `content/reviews.json` → `words`.
   Fill `editorial` and `audio`: `approved: true`, reviewer name and `YYYY-MM-DD` date.
   Keep the generated `contentHash` and SHA-256 `clips` values from the reviewed files.
4. Set `audioSet` to a key in `audioSets`. That entry needs `source`, `voice`,
   `redistributionPermission` (terms URL or written permission) and `redistributionApproved: true`.
5. Regenerate/review the record after changing text, level, split, paths or audio bytes.
   Draft WAVs cannot satisfy the release gate. Builds check MP3 signatures/hashes;
   successful decoding and correct pronunciation still need playback review.

## Release

Run `npm run check`, then `npm run build`. A failed release removes stale generated
`dist/first-reading/`. Successful output includes source/review hashes, Node version,
mode, counts and Git SHA (null outside a Git checkout) in `build-info.json`.
Preview metadata also hashes the draft-audio manifest.

On iPhone Safari, Android Chrome and desktop: finish a round at both levels; retry;
interrupt sound; simulate a missing clip; confirm exit; reload; check the longest word
at 320 px and with reduced motion. Observe the child after one demonstrated word.

Publish only the **contents** of `dist/first-reading/` to the target repository's
GitHub Pages site. Verify `/first-reading/` asset URLs and refresh in a fresh browser.
CI/workflow changes require explicit approval under this repo's instructions.
