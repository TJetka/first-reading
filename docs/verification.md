# Verification · 2026-11-06

- Node 25.9.0 / npm 11.12.1: offline clean setup, catalogue validation and 47 tests pass.
- Draws: 1,000 seeds per level; distinct IDs, level isolation, 5/5/2 order and variation.
- Build: missing/stale approvals, changed clips, path escapes and stale output rejected.
  Complete release/prototype builds tested with synthetic fixtures, never real approvals.
- Initial audio bank: 650 mono 22,050 Hz WAVs; durations 0.249–1.307 s; all non-silent.
  Signal checks do not establish correct pronunciation.
- Chrome: complete rounds at both levels (advanced level uses a 12-word QA fixture),
  repeat syllable, same-card retry, rapid double advance, finish, restart and reload.
- Chrome responsive mode: 320 × 740 and 768 × 740; `szcze · nia · czek` fits one line.
  Exit/continue preserves the card. Missing audio offers retry without unlocking Super.
- Fixed during QA: compressed instruction spacing and keyboard focus after playback.

Pending: actual iPhone Safari / Android Chrome playback, screen-reader and reduced-motion
device checks, native-speaker review, child observation, public Pages-path smoke test.
Catalogue expanded to 500 words / 1,300 paths; inventory assertions updated accordingly.
GitHub repository is reachable. Pages currently returns HTTP 404; no deployment exists.
