# Delivery stories

| Step | Story / acceptance | Status |
| --- | --- | --- |
| 1 | Reproduce setup with pinned Node, lockfile, no runtime dependencies and concise agent rules. | Implemented |
| 2 | Validate all 500 candidates; reject unsafe paths, duplicate words, bad splits and incorrect levels. | Tested |
| 3 | Draw 5/5/2 words at either level; retry preserves the card; double advance is ignored. | Tested: 2,000 draws |
| 4 | Read, listen, check, retry, finish and confirm exit using an accessible Polish UI. | Verified in Chrome; 320/768 px layouts checked |
| 5 | Latest sound wins; failures preserve position; cancelled/stale playback cannot unlock advance. | Tested |
| 6 | Build only reviewed text and exact reviewed audio; preserve source provenance; exercise integration tests. | Tested |
| 7 | Record and review prototype clips, then 200–500 words; observe child use; test real devices. | 1,300 redistributable MP3s generated; review/mobile gates pending |
| 8 | Publish the app at the Pages root and verify online; complete real mobile checks. | Public app live; 1,310 files verified; real mobile checks pending |

No CI files are added: repository instructions require explicit approval for CI changes.

Reviewed-release gates: native pronunciation/editorial review,
iPhone/Android and child observation. Source is published to GitHub on `main`.
