# Public audio renderer

Optional build tool only: Python 3.13, Piper and LAME. The web app has no Python dependency.
Piper/ONNX are needed to render redistributable Polish speech ahead of time; models stay
in `.cache/`, never Git. Versions are pinned in `uv.lock`.

```sh
uv sync --project tools/audio --locked
mkdir -p .cache/models/gosia
```

Download `pl_PL-gosia-medium.onnx` and its `.json` config from the
[pinned model directory](https://huggingface.co/rhasspy/piper-voices/tree/e7229f7d33a10e145e109b886d661984201ac3c4/pl/pl_PL/gosia/medium)
into `.cache/models/gosia/`. The renderer checks the model's SHA-256 before use.

From `tools/audio/`:

```sh
uv run python render.py --model ../../.cache/models/gosia/pl_PL-gosia-medium.onnx
uv run pytest -q
uv run ruff check .
```

Existing MP3s are reused only when text/config/file hashes match. Changed files are
never overwritten automatically. Native review stays separate in `content/reviews.json`.
