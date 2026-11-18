# words.json

Both generation and transcription write `audio/words.json` beside `audio/full.mp3`.

```json
{
  "source": "tts",
  "audio": "audio/full.mp3",
  "durationMs": 2000,
  "words": [
    { "text": "股", "startMs": 310, "endMs": 410 },
    { "text": "票", "startMs": 410, "endMs": 560 }
  ]
}
```

- `source` is `"tts"` or `"stt"`.
- `audio` is relative to the project.
- Times are integer milliseconds from the start of the audio. Entries are ordered and each satisfies `0 <= startMs <= endMs <= durationMs`.
- TTS alignment uses provider characters. Scribe uses provider words. Whitespace-only entries are dropped.
