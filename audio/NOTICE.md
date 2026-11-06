# Public preview voice

The committed MP3s use **Gosia (pl_PL-gosia-medium)** from the MIT-licensed
[Piper voice collection](https://huggingface.co/rhasspy/piper-voices).
Its [model card](https://huggingface.co/rhasspy/piper-voices/blob/e7229f7d33a10e145e109b886d661984201ac3c4/pl/pl_PL/gosia/medium/MODEL_CARD)
identifies the recording dataset as **CC0**.

Rendered offline with Piper 1.8.0 and LAME 1.8.1. Neither the model nor the speech
software runs in the browser. `content/public-audio.json` records the source,
model hash, synthesis settings, per-clip hashes and pending review status.

These are synthesized preview recordings, not native-speaker-approved teaching audio.
The private macOS Zosia recordings remain excluded from Git and deployment.
