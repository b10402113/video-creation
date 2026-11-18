#!/usr/bin/env node
// voice — normalize narration audio + word timestamps for Talkcraft.
//
// Requires Node.js 22+ and FFmpeg for ingesting non-MP3 recordings.
//
// Usage:
//   node voice.mjs <topicDir> [--mode ingest|generate] [--commit]
//                  [--voice <voiceId>] [--max-chars <N>]
//
//   generate  TTS the frozen script.md via the provider, stitch one continuous
//             `audio/full.mp3`, and write `audio/words.json`. Requires VOICE_ID.
//   ingest    Transcribe `<topicDir>/source/audio/*` (Scribe), write words.json,
//             back up script.md, and write timing/script-diff.md. Pass --commit
//             to rewrite script.md from the transcript after the review gate.
//
// Mode defaults to `ingest` when local audio exists, else `generate`.
//
// Env (gitignored .env, never logged):
//   VOICE_PROVIDER=elevenlabs  VOICE_API_KEY=  VOICE_BASE_URL=https://api.elevenlabs.io
//   VOICE_ID=  VOICE_TTS_MODEL=eleven_multilingual_v2  VOICE_STT_MODEL=scribe_v1

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, readdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chunkText,
  diffTokens,
  mp3DurationMs,
  normalizeScribeWords,
  normalizeTtsAlignment,
  parseFrontmatter,
  splitIntoBeats,
  tokenize,
} from "./lib.mjs";

const runCommand = promisify(execFile);
const REQUEST_TIMEOUT_MS = 300_000;
const AUDIO_EXT = /\.(mp3|m4a|wav|flac|ogg|opus|webm)$/i;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

try {
  process.loadEnvFile(join(REPO_ROOT, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

function env(name, fallback) {
  const v = process.env[name];
  return v && v.length ? v : fallback;
}

function fail(msg) {
  console.error(`voice: ${msg}`);
  process.exit(1);
}

async function withRetry(label, fn, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
      lastErr = err;
      if (i < attempts) {
        const wait = 500 * 2 ** (i - 1);
        console.error(`voice: ${label} failed (${i}/${attempts}): ${err.message}; retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

/**
 * Provider adapters. Downstream only sees `words.json`; a new TTS/STT provider
 * is added by registering one object here. Every adapter implements:
 *   ttsCharLimit(model) -> number
 *   synthesize({ text, prevText?, nextText?, voiceId }) -> { audio: Buffer, alignment }
 *   transcribe({ audio: Buffer, filename }) -> raw provider JSON ({ text, words })
 */
const PROVIDERS = {
  elevenlabs: {
    creds() {
      const key = env("VOICE_API_KEY");
      if (!key) fail("VOICE_API_KEY is not set (put it in the gitignored .env)");
      return { base: env("VOICE_BASE_URL", "https://api.elevenlabs.io").replace(/\/$/, ""), key };
    },
    ttsCharLimit(model) {
      return model.includes("flash") ? 40_000 : 10_000;
    },
    async synthesize({ text, prevText, nextText, voiceId }) {
      const { base, key } = this.creds();
      const model = env("VOICE_TTS_MODEL", "eleven_multilingual_v2");
      const url = `${base}/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`;
      const body = { text, model_id: model };
      if (prevText) body.previous_text = prevText.slice(-1000);
      if (nextText) body.next_text = nextText.slice(0, 1000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw Object.assign(new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status });
      const json = await res.json();
      const audio = Buffer.from(json.audio_base64 ?? "", "base64");
      if (!audio.length) throw new Error("TTS response had no audio_base64");
      return { audio, alignment: json.alignment ?? json.normalized_alignment };
    },
    async transcribe({ audio, filename }) {
      const { base, key } = this.creds();
      const model = env("VOICE_STT_MODEL", "scribe_v1");
      const form = new FormData();
      form.append("file", new Blob([audio], { type: "audio/mpeg" }), filename);
      form.append("model_id", model);
      const res = await fetch(`${base}/v1/speech-to-text`, {
        method: "POST",
        headers: { "xi-api-key": key },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw Object.assign(new Error(`STT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status });
      return res.json();
    },
  },
};

function adapter() {
  const name = env("VOICE_PROVIDER", "elevenlabs");
  const found = PROVIDERS[name];
  if (!found) fail(`VOICE_PROVIDER '${name}' is not supported (known: ${Object.keys(PROVIDERS).join(", ")})`);
  return found;
}

/** Strip markdown beat separators so they are not spoken. */
function spokenText(body) {
  return body
    .split("\n")
    .filter((line) => line.trim() !== "---")
    .join("\n")
    .trim();
}

async function runGenerate(topicDir, opts) {
  const scriptPath = join(topicDir, "script.md");
  if (!existsSync(scriptPath)) fail(`script.md not found at ${scriptPath}`);
  const voiceId = opts.voiceId || env("VOICE_ID");
  if (!voiceId) fail("generate mode needs a voice id (--voice or VOICE_ID in .env)");

  const model = env("VOICE_TTS_MODEL", "eleven_multilingual_v2");
  const tts = adapter();
  const maxChars = opts.maxChars || tts.ttsCharLimit(model);
  const body = parseFrontmatter(await readFile(scriptPath, "utf8")).body;
  const text = spokenText(body);
  if (!text) fail("script.md body is empty");

  const chunks = chunkText(text, maxChars);
  console.error(`voice: synthesizing ${chunks.length} chunk(s) with ${model}…`);

  const buffers = [];
  const words = [];
  let offsetMs = 0;
  for (let i = 0; i < chunks.length; i++) {
    const { audio, alignment } = await withRetry(`chunk ${i + 1}/${chunks.length}`, () =>
      tts.synthesize({ text: chunks[i], prevText: chunks[i - 1], nextText: chunks[i + 1], voiceId }),
    );
    const local = normalizeTtsAlignment(alignment);
    const duration = mp3DurationMs(audio);
    if (!duration || !local.length) throw new Error(`chunk ${i + 1} has no MP3 frames or timestamps`);
    for (const w of local) words.push({ text: w.text, startMs: w.startMs + offsetMs, endMs: w.endMs + offsetMs });
    buffers.push(audio);
    offsetMs += duration;
  }

  const full = Buffer.concat(buffers);
  const audioDir = join(topicDir, "audio");
  await mkdir(audioDir, { recursive: true });
  await writeFile(join(audioDir, "full.mp3"), full);

  const durationMs = Math.max(offsetMs, words.length ? words[words.length - 1].endMs : 0);
  const wordsFile = { source: "tts", audio: "audio/full.mp3", durationMs, words };
  await writeFile(join(audioDir, "words.json"), JSON.stringify(wordsFile, null, 2) + "\n", "utf8");

  console.error(`✓ ${words.length} word timestamps / ${(durationMs / 1000).toFixed(1)}s → ${join(audioDir, "words.json")}`);
  console.error(`✓ audio → ${join(audioDir, "full.mp3")}`);
}

async function findSourceAudio(topicDir) {
  const dir = join(topicDir, "source", "audio");
  if (!existsSync(dir)) return null;
  const files = (await readdir(dir)).filter((f) => AUDIO_EXT.test(f)).sort();
  return files.length ? join(dir, files[0]) : null;
}

async function runIngest(topicDir, opts) {
  const scriptPath = join(topicDir, "script.md");
  if (!existsSync(scriptPath)) fail(`script.md not found at ${scriptPath}`);
  const audioDir = join(topicDir, "audio");
  const timingDir = join(topicDir, "timing");
  const referencePath = join(topicDir, "script.reference.md");
  const transcriptPath = join(timingDir, "transcript.txt");

  // On --commit, reuse the transcript written at the review gate (no second
  // provider call); otherwise transcribe the user's audio.
  let transcript;
  let words;
  if (opts.commit) {
    if (!existsSync(transcriptPath)) fail("run ingest before committing a transcript");
    transcript = (await readFile(transcriptPath, "utf8")).trim();
    const timing = JSON.parse(await readFile(join(audioDir, "words.json"), "utf8"));
    if (timing.source !== "stt") fail("run ingest again before committing a transcript");
    words = timing.words;
  } else {
    const source = await findSourceAudio(topicDir);
    if (!source) fail(`no audio found in ${join(topicDir, "source", "audio")}`);
    console.error(`voice: transcribing ${source}…`);
    const raw = await readFile(source);
    const json = await withRetry("transcribe", () => adapter().transcribe({ audio: raw, filename: basename(source) }));
    transcript = String(json.text ?? "").trim();
    if (!transcript) fail("STT returned an empty transcript");
    words = normalizeScribeWords(json.words);
    if (!words.length) fail("STT returned no word timestamps");

    await mkdir(audioDir, { recursive: true });
    await mkdir(timingDir, { recursive: true });
    const audioPath = join(audioDir, "full.mp3");
    if (/\.mp3$/i.test(source)) {
      await copyFile(source, audioPath);
    } else {
      await runCommand("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", source, "-vn", "-c:a", "libmp3lame", audioPath]);
    }

    const durationMs = words.length ? words[words.length - 1].endMs : 0;
    await writeFile(
      join(audioDir, "words.json"),
      JSON.stringify({ source: "stt", audio: "audio/full.mp3", durationMs, words }, null, 2) + "\n",
      "utf8",
    );
    await writeFile(transcriptPath, transcript + "\n", "utf8");

    // Preserve the pre-voice script once (the review-gate backup).
    const original = await readFile(scriptPath, "utf8");
    if (!existsSync(referencePath)) await writeFile(referencePath, original, "utf8");

    const originalBody = parseFrontmatter(original).body.trim();
    const ops = diffTokens(tokenize(originalBody), tokenize(transcript));
    const changed = ops.filter((o) => o.op !== "=").length;
    await writeFile(
      join(timingDir, "script-diff.md"),
      renderDiff({ originalBody, transcript, ops, changed, words }),
      "utf8",
    );
  }

  if (opts.commit) {
    const reference = existsSync(referencePath) ? await readFile(referencePath, "utf8") : await readFile(scriptPath, "utf8");
    const frontmatter = parseFrontmatter(reference).frontmatter.trimEnd();
    const finalBody = transcriptionBody(transcript);
    await writeFile(scriptPath, `${frontmatter}\n\n${finalBody}\n`, "utf8");
    console.error(`✓ script.md rewritten from the transcript (${words.length} word timestamps)`);
  } else {
    console.error(`✓ ${words.length} word timestamps → ${join(audioDir, "words.json")}`);
    console.error(`⚠ STOP: review ${join(timingDir, "script-diff.md")}, then re-run with --commit to`);
    console.error(`  rewrite script.md from the transcript (MP3 is authoritative).`);
  }
}

function transcriptionBody(transcript) {
  const beats = splitIntoBeats(transcript);
  return beats.join("\n\n---\n\n");
}

function renderDiff({ originalBody, transcript, ops, changed, words }) {
  const inline = ops
    .map((o) => (o.op === "=" ? o.value : o.op === "-" ? `【-${o.value}-】` : `【+${o.value}+】`))
    .join("");
  return [
    "# voice — script diff (mode 1: MP3 is authoritative)",
    "",
    `- 原文 (script.reference.md)：${originalBody.length} 字`,
    `- 轉錄 (transcript)：${transcript.length} 字`,
    `- 差異詞數：${changed}`,
    `- 字級時間碼：${words.length} 筆`,
    "",
    "> 轉錄文字將在 `--commit` 後覆蓋 `script.md`。若差異可接受，請確認後重跑 `--commit`；",
    "> 不接受則直接編輯 `script.md`，並改用 mode `generate` 或自行提供對齊檔。",
    "",
    "## 逐詞差異",
    "",
    inline,
    "",
    "## 轉錄全文",
    "",
    transcript,
    "",
  ].join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const topicArg = argv[0];
  if (!topicArg || topicArg.startsWith("--")) {
    fail("usage: node voice.mjs <topicDir> [--mode ingest|generate] [--commit] [--voice <id>] [--max-chars N]");
  }
  const topicDir = resolve(topicArg);
  const getFlag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  const opts = {
    commit: argv.includes("--commit"),
    voiceId: getFlag("--voice"),
    maxChars: getFlag("--max-chars") ? Number(getFlag("--max-chars")) : null,
  };

  const requested = getFlag("--mode");
  const mode = requested || ((await findSourceAudio(topicDir)) ? "ingest" : "generate");
  if (mode !== "ingest" && mode !== "generate") fail(`unknown mode '${mode}'`);

  if (opts.commit && mode !== "ingest") fail("--commit is only supported in ingest mode");
  if (mode === "ingest") await runIngest(topicDir, opts);
  else await runGenerate(topicDir, opts);

}

main().catch((err) => fail(err.stack || String(err)));
