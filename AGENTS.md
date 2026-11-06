# Working agreements

- Read `PRD.md`; follow the commands in `BUILD.md`. Keep docs concrete and short.
- Use browser ES modules and Node built-ins. No runtime dependencies or frameworks.
- Keep pure catalogue/round logic in `src/`; filesystem operations in `scripts/`.
- Use explicit imports, small functions and JSDoc for public contracts. Two-space indentation.
- Add deterministic `node:test` cases for new behavior and fixes. Run the changed test file, then `npm run check` for logic or IO changes. This is the project's pytest-equivalent suite.
- Check UI at 320 px, tablet and desktop. Test keyboard, failed audio and interrupted playback.
- Edit vocabulary only in `word-catalogue.json`. Never invent editorial or audio approvals.
- Release requires 200–500 approved words, reviewed MP3 hashes and both 5/5/2 pools. Preview assets never go into `dist/`.
- Keep round state in memory. No microphone, analytics, external speech, accounts or persistence.
- Never read secrets, overwrite source data, force-push, rebase, delete branches or modify CI without explicit approval.
- Use coherent commits and normal pushes when Git access permits. Do not commit generated output or large recordings without project approval.
- Record catalogue/review hashes, build mode and Git SHA in generated build metadata.
