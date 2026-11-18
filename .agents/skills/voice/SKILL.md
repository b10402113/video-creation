---
name: voice
description: Generate an MP3 narration and aligned words.json from a Talkcraft project's script.md, or transcribe existing narration. Use for 配音、生成音訊、音訊字級時間碼 or voice.
---

# voice

Read the saved `script.md` in `projects/<topic>/` (or the supplied project directory). When only source material exists and the user requests a script plus audio, start with [script-write](../script-write/SKILL.md).

Run from the workspace root. Node.js 22+ loads the root `.env` with `VOICE_PROVIDER`, `VOICE_API_KEY`, `VOICE_BASE_URL`, `VOICE_ID`, `VOICE_TTS_MODEL` and `VOICE_STT_MODEL`. See [provider settings](references/provider-adapter.md) for required values and defaults.

## Generate narration

Use `generate` for new audio even if a recording already exists.

```bash
node .agents/skills/voice/scripts/voice.mjs "projects/<topic>" --mode generate
```

The runner sends the spoken paragraphs to ElevenLabs and writes `audio/full.mp3` and `audio/words.json` under the project directory. [The timing format](references/words-format.md) uses milliseconds from the beginning of the audio. Verify the MP3 decodes and that the timestamp array covers the narration and is ordered and within the track duration. Report both paths and the measured runtime. Talkcraft can read these files directly.

## Transcribe a recording

Place the recording in the project's `source/audio/` directory and run the same command with `--mode ingest`. The runner saves the transcript and the review diff under `timing/` alongside the existing script, and writes the audio and timestamps under `audio/`. Use `--mode ingest --commit` only if the user asks to replace `script.md` with the transcribed narration. The replacement uses the saved transcription without making another STT request.
