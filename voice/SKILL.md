---
name: voice
disable-model-invocation: true
description: >
  Normalize narration audio and word-level timestamps for the Remotion path.
  Two modes: ingest a user MP3 (Scribe STT) or generate the track (ElevenLabs
  TTS), both converging on one continuous audio/full.mp3 + timing/words.json.
  Use for 配音, 生成語音, 語音時間碼, 對齊逐字稿, voice timing, or when the
  Remotion path needs real word times before outline-write.
---

# voice

Turn narration into one continuous track plus word-level time, so the storyboard
and every reveal can land on the spoken word (卡點) instead of a guessed delay.
This stage runs **after `script-write`'s checkpoint and before `outline-write`**,
and is **optional**: with no voice artifacts, the Remotion path keeps its legacy
`~Ts` / per-step-MP3 behavior.

Scope: **Remotion path only.** The Vite path, `topic-init`, and `chapter-build`
are untouched.

## Trigger

User says "配音", "生成語音", "voice", "做旁白", "對齊時間碼", or runs the
Remotion path and supplies narration audio.

`$voice <topic> mp3+word` explicitly requests ElevenLabs TTS for the whole
approved script. Use `--mode generate` even if `sources/<topic>/audio/` already
contains an MP3. Read the API key, voice ID, and model from the repo root `.env`.
After the command succeeds, report `audio/full.mp3` and `timing/words.json`.

## Inputs

| Input | Role |
| --- | --- |
| `topics/<topic>/script.md` | Required; the frozen script (mode 2 input; mode 1 is rewritten from the transcript, after review). |
| `sources/<topic>/audio/*.{mp3,m4a,wav,flac,ogg,opus,webm}` | Mode 1 only; the user's recording. |
| `.env` (`VOICE_*`) | Required; provider key + voice id. Never committed. |

## Outputs

```
topics/<topic>/
├── audio/full.mp3              # one continuous whole-video track (Q5)
├── timing/words.json           # GLOBAL char/word timing (ms), source-agnostic
├── timing/transcript.txt       # mode 1 only
├── timing/script-diff.md       # mode 1 only; transcript vs original script.md
├── script.reference.md         # mode 1 only; pre-voice script.md backup
└── script.md                   # mode 2: unchanged; mode 1: rewritten on --commit
```

`voice` does **not** emit `timing/word-offsets.json` — that needs step boundaries
and is produced later by `align-words` in `remotion-build`'s `chapters` phase.
See [`references/words-format.md`](references/words-format.md).

## Mode selection

- `mp3+word` or an explicit request to synthesize new narration → **`generate`**.
- Explicitly asked to use an existing audio file → **`ingest`**.
- If no mode is requested, use **`ingest`** when source audio exists and **`generate`** otherwise.
- Neither possible → report and stop; `outline-write` falls back to `~Ts`.

Run from the repo root:

```bash
node --env-file=.env .agents/skills/voice/scripts/voice.mjs "topics/<topic>" --mode generate
node --env-file=.env .agents/skills/voice/scripts/voice.mjs "topics/<topic>" --mode ingest
```

Use the first command for `mp3+word`. Replace `<topic>` with the supplied topic
name. Add `--voice <id>` only when the user requests a different voice. If TTS
fails, report the error. A successful generation replaces the topic's previous
MP3 and timeline as a pair.

## Phase: generate (TTS)

1. Read the frozen `script.md` body; split into chunks under the model character
   limit (paragraph → sentence boundaries).
2. For each chunk call `with-timestamps` with `previous_text`/`next_text` for
   prosody continuity.
3. Stitch the MP3 bytes into `audio/full.mp3`; measure each chunk's true duration
   and offset its character alignment into one **global** timeline.
4. Write `timing/words.json` (`source:"tts"`). `script.md` is unchanged.

Done when `audio/full.mp3` is non-empty and every spoken character has a
monotonic `{startMs,endMs}` within `durationMs`.

## Phase: ingest (STT)

1. Transcribe `sources/<topic>/audio/*` with Scribe → transcript + word times.
2. Copy the audio to `audio/full.mp3`; write `timing/words.json` (`source:"stt"`)
   and `timing/transcript.txt`.
3. Back up `script.md` → `script.reference.md` (once) and write
   `timing/script-diff.md` (token-level diff of original vs transcript).
4. 🔴 **STOP for the review gate.** `script.md` is a frozen, user-approved
   artifact and the transcript is about to overwrite it. Present the diff and
   wait. To accept, re-run with `--commit`; otherwise the user edits `script.md`
   directly. Do not require re-recording.

Done when the timeline is valid and, on `--commit`, `script.md` reflects the
transcript.

## Shared normalization

For shot-based editing, prefer the user's clean continuous narration when supplied. Complete any retake or silence cuts before alignment so the final audio and timestamps describe the same track. Check acronyms, terms, numbers and repeated phrases against the approved narration.

After the word timeline is ready, use it to write `timing/captions.json` and `timing/captions.srt` as specified in [the editing format](../storyboard/editing-format.md). Keep captions as short spoken phrases. Preserve their time ranges when fixing spelling or converting to Traditional Chinese. Resolve repeated shot anchors by occurrence within the beat. Regenerate caption timing after audio edits. The existing voice command generates the audio and word data; caption authoring is a separate step in this skill.

Both modes converge on the `words.json` schema in
[`references/words-format.md`](references/words-format.md). Nothing downstream
knows whether the track came from TTS or STT.

## Provider adapter

ElevenLabs is the first adapter; the runner isolates it so another provider can
drop in without touching downstream. See
[`references/provider-adapter.md`](references/provider-adapter.md) for env vars,
request shapes, chunking/stitching, and failure handling.

## Self-check

Run the 「跨階段硬性自檢協議」 from `quality-check/SKILL.md` (independent reviewer
or strict self-review). Checklist:

- [ ] `audio/full.mp3` exists and is non-empty.
- [ ] `timing/words.json` is monotonic (`startMs <= endMs <= next.startMs`) and
      every time is within `durationMs`.
- [ ] Every script beat maps to at least one word.
- [ ] Mode 1: `script.reference.md`, `timing/script-diff.md`, and
      `timing/transcript.txt` exist; `script.md` is untouched before `--commit`.
- [ ] No key is written to any file; `script.md` was not modified in mode 2.

Then hand off to `outline-write` (which reads `words.json` to choose 卡點詞
spans). Do not run `align-words` here.
