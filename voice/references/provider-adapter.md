# Provider adapter

`voice` talks to **ElevenLabs**: `with-timestamps` TTS for mode `generate`, and
Scribe speech-to-text for mode `ingest`. All secrets come from the environment.
The adapter is the only code that knows the provider; everything downstream reads
the provider-agnostic `words.json`.

## Environment

```bash
VOICE_PROVIDER=elevenlabs
VOICE_API_KEY=sk-…                       # never commit / never log
VOICE_BASE_URL=https://api.elevenlabs.io # no trailing slash
VOICE_ID=…                               # mode generate only
VOICE_TTS_MODEL=eleven_multilingual_v2   # 10 000-char limit
VOICE_STT_MODEL=scribe_v1                # mode ingest only
```

Put these in a gitignored `.env` (copy `.env.example`). `voice.mjs` auto-loads
`.env` from the repo root and the current directory via `process.loadEnvFile`,
then reads `process.env` only; it never writes a secret to disk.

## Mode `generate` — TTS with timestamps

`POST {VOICE_BASE_URL}/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128`

```json
{
  "text": "<chunk>",
  "model_id": "eleven_multilingual_v2",
  "previous_text": "<previous chunk tail>",
  "next_text": "<next chunk head>"
}
```

- Header `xi-api-key: <VOICE_API_KEY>`.
- Response: `{ audio_base64, alignment, normalized_alignment }`. `alignment` is
  per **character** (`characters[]`, `character_start_times_seconds[]`,
  `character_end_times_seconds[]`) and corresponds to the input text; use it (not
  `normalized_alignment`, which follows the normalized text and drifts from the
  script when numbers/abbreviations expand).
- `previous_text` / `next_text` carry prosody across chunks. The script is split
  on paragraph then sentence boundaries under the model's character limit
  (`eleven_multilingual_v2` 10 000, Flash v2.5 40 000); each chunk is synthesized
  with its neighbours' text.
- Chunks are stitched by concatenating their MP3 bytes; each chunk's exact
  duration is measured by walking its MPEG frames, so the next chunk's alignment
  is offset by the true decoded length and the global timeline stays monotonic.
- One continuous track lands at `audio/full.mp3` (whole-video, Q5).

## Mode `ingest` — Scribe speech-to-text

`POST {VOICE_BASE_URL}/v1/speech-to-text` (multipart)

- `file` = the user's audio (`sources/<topic>/audio/*`), `model_id=scribe_v1`.
- Response: `{ text, words: [{ text, start, end, type }] }`. Entries typed
  `word` become `words.json`; `spacing` / `audio_event` are skipped.
- The transcript is authoritative: it backs up the original `script.md` to
  `script.reference.md`, writes `timing/script-diff.md`, and stops for review.
  `--commit` rewrites `script.md` from the transcript.

## Failure handling

- Retry network/5xx with exponential backoff (3 attempts).
- On permanent failure, report and exit — never silently drop a chunk or write a
  partial `words.json`.

## Adding a provider

The runner keeps every provider behind one registry (`PROVIDERS` in
`scripts/voice.mjs`); downstream only ever reads `words.json`. An adapter
implements:

```js
{
  ttsCharLimit(model) -> number,
  synthesize({ text, prevText, nextText, voiceId }) -> { audio: Buffer, alignment },
  transcribe({ audio, filename }) -> { text, words }   // raw provider response
}
```

Register it under `VOICE_PROVIDER`; no other file changes. The `alignment` from
`synthesize` is normalized by `normalizeTtsAlignment` (character level), and the
`words[]` from `transcribe` by `normalizeScribeWords` (word level), so a provider
that returns those shapes drops in without touching `align-words` or chapters.
