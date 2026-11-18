# words.json / word-offsets.json

Two files carry word-level time. `voice` writes the first; `remotion-build`'s
`chapters` phase (via `align-words`) writes the second.

## `topics/<topic>/timing/words.json` — GLOBAL

Source-agnostic: both TTS (character-level) and STT (word-level) normalize to it.
Coordinates are **global** — milliseconds from the start of the whole video.

```json
{
  "source": "tts",
  "audio": "audio/full.mp3",
  "durationMs": 912340,
  "words": [
    { "text": "轉", "startMs": 2310, "endMs": 2410 },
    { "text": "錄", "startMs": 2410, "endMs": 2560 }
  ]
}
```

- `source`: `"tts"` | `"stt"`.
- `audio`: the topic-relative continuous track, always `audio/full.mp3`.
- `words`: ordered, monotonic; `startMs <= endMs`; whitespace-only characters are
  dropped. Granularity follows the provider (per character for TTS, per word for
  Scribe). `voice` groups these entries into timed display captions for shot-based video. The storyboard uses contiguous phrases as visual anchors.

`outline-write` can use resolved beat durations for estimates. `storyboard` chooses
contiguous anchor phrases from the approved narration. For shots, see [the editing format](../../storyboard/editing-format.md) for repeat disambiguation and caption output.

## `topics/<topic>/timing/word-offsets.json` — LOCAL

Written by `align-words` (remotion-build `chapters` phase), derived from
`words.json` + the authored `narrations.ts`. This is the **only** table the agent
copies from when authoring a reveal: every offset is **local** to its step.

```json
{
  "mode": "words",
  "audio": "audio/full.mp3",
  "durationMs": 912340,
  "chapters": [
    {
      "id": "01-concept",
      "startMs": 0,
      "endMs": 15400,
      "steps": [
        {
          "step": 1,
          "startMs": 0,
          "endMs": 7700,
          "offsetMs": 0,
          "words": [
            { "text": "轉", "offsetMs": 2310 },
            { "text": "錄", "offsetMs": 2410 }
          ]
        }
      ]
    }
  ]
}
```

- `step`: 1-indexed, matching the chapter's `<N>` audio/step numbering.
- `offsetMs`: `word.startMs − step.startMs` — pass it straight to a primitive's
  `delayMs`. Never compute global minus local by hand; copy the value.
- The track's global playhead is owned by the composition (see `timing.json`'s
  `mode:"words"`), so chapter code never sees a global number.

## Conversion rule

`offset = word.startMs − step.startMs`, computed once in `align-words`. Chapter
code contains **no global ms literal**; to 卡點, look up the word in the offsets
table. Shifting the whole track then invalidates only the steps whose narration
changed.
