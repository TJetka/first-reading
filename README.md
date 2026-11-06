# Czytam po kawałku

Polish syllable-reading practice: 12 words, two levels, tap-to-listen help.
Vanilla HTML/CSS/JS; no runtime dependencies, accounts or system speech.

```sh
npm ci
npm run check
npm run audio:generate  # macOS; skip when draft clips already exist
npm run dev
```

Open `http://localhost:8000/first-reading/`. Node 25.9.0 is pinned; Node 22+ works.
The catalogue has 500 draft words and 1,300 audio paths. Generate the clips locally;
pronunciation review is pending and the system voice is for private use.
This is not a child-ready release.
Without a server, run `npm run build:preview` and open
`preview/first-reading/local-preview.html` directly in Chrome.

- `src/`: interface, catalogue validation, round state and audio controller.
- `scripts/`: validation, review manifests, static builds and local server.
- `tests/`: deterministic draw, flow, audio and build checks.
- `content/reviews.json`, `audio/`: release approvals and MP3s; drafts stay in `.cache/`.
- [BUILD.md](BUILD.md): commands and recording/release procedure.
- [docs/stories.md](docs/stories.md): implementation status and remaining gates.
- [PRD.md](PRD.md): product requirements; [word-catalogue.json](word-catalogue.json): 500 candidate words.

`npm run build` fails until release gates pass. GitHub Pages target:
`https://tjetka.github.io/first-reading/`.
