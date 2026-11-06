# Build and publish

Use Node 25.9.0 and npm 11.12.1 (pinned); Node 22+ works. No web runtime dependencies.

```sh
npm ci --offline
npm run check
npm run dev                     # http://localhost:8000/first-reading/
```

Restart `dev` after source edits. Bundled Polish MP3s work on a clean checkout.
Without sockets, run `npm run build:preview` and open
`preview/first-reading/local-preview.html` in Chrome.

## GitHub Pages

Pages publishes **main / (root)**. The root `index.html` opens the app; `.nojekyll`
prevents Jekyll from turning README into the site. After changing the app or catalogue:

```sh
npm run check
npm run build:pages
git add index.html build-info.json .nojekyll src scripts content audio
git commit -m "Update Pages app"
git push origin main
```

Commit source changes with the generated entry. `build:pages` validates all 500 words,
1,300 MP3 signatures/hashes and voice provenance before writing the entry. It records
source/catalogue/audio hashes and Git SHA. Verify the [live app](https://tjetka.github.io/first-reading/)
after Pages deploys. Keep the visible preview notice until native review passes.

## Audio and review

Public MP3s use Piper Gosia; see [source/license](audio/NOTICE.md) and the optional
[locked renderer](tools/audio/README.md). Models stay in `.cache/`. Legacy macOS
`npm run audio:generate` creates private WAVs only; never publish those files.

1. A Polish early-years reviewer checks word familiarity, level and syllable boundaries.
2. A native speaker listens to every syllable and whole-word clip in context.
3. Run `npm run review -- <id>`; copy its record into `content/reviews.json` → `words`.
   Set editorial/audio approval, reviewer/date, and preserve reviewed content/clip hashes.
4. Reference an `audioSets` entry with source, voice, redistribution terms and permission.
   Changes to text, levels, splits, paths or bytes require fresh review.

`npm run build:prototype` requires 12 approved words. `npm run build` requires 200–500,
both 5/5/2 pools and seven digraphs; output goes to `dist/first-reading/`. A failed
release removes stale output. Preview builds never imply editorial approval.

## Verification

Run focused `node --test tests/<name>.test.mjs`, then `npm run check` for logic/IO.
`npm run test:coverage` reports coverage. Renderer changes also require pytest and ruff
in `tools/audio/`. All automated tests use fixtures without network calls.

In Chrome, iPhone Safari and Android Chrome: finish each level, retry, interrupt sound,
check missing-audio recovery, exit/reload and the longest word at 320 px. Check keyboard,
reduced motion and screen-reader output; observe child use after one demonstration.
