# Verification · 2026-11-06

- Node 25.9.0 / npm 11.12.1: catalogue validation and **49 tests pass**.
- Optional Python 3.13 audio tool: **7 pytest tests pass**; ruff checks/format pass.
- Draws: 1,000 seeds per level; unique IDs, level isolation and 5/5/2 ordering.
- Builds reject stale approvals, changed clips, path escapes and missing public audio.
  Release/prototype integration tests use synthetic fixtures, never invented approvals.
- Public audio: 1,300 Gosia MP3s, 4.74 MB; every source PCM clip passed non-silence
  and duration checks. These checks do not establish correct pronunciation.
- [Live Pages app](https://tjetka.github.io/first-reading/) deployed from
  [db2b2b5](https://github.com/TJetka/first-reading/commit/db2b2b53).
  Downloaded all 1,310 runtime files, including all MP3s: every SHA-256 matches Git.
- Live Chrome: app home replaces README; syllable playback, same-card retry,
  complete 12-word easy round and return home pass.
- Earlier local Chrome: both levels, restart/reload, exit confirmation and missing-audio
  recovery pass; 320/768 px layouts fit `szcze · nia · czek` on one line.

Pending reviewed-release checks: native pronunciation/editorial review, actual iPhone
Safari / Android Chrome, screen reader, reduced motion and child observation.
The public preview remains available while these reviews are pending.
