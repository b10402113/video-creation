// voice — pure helpers shared by the runner (and unit-tested from the repo).
//
// Dependency-free (Node >= 18). Nothing here touches the network or disk.

/**
 * Normalize an ElevenLabs `alignment` object (character-level) into the
 * provider-agnostic `{text,startMs,endMs}` list used by `timing/words.json`.
 * Whitespace-only characters are dropped (they carry no on-screen word).
 *
 * @param {{characters?: string[], character_start_times_seconds?: number[], character_end_times_seconds?: number[]}} alignment
 * @returns {{text: string, startMs: number, endMs: number}[]}
 */
export function normalizeTtsAlignment(alignment) {
  const chars = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  const words = [];
  for (let i = 0; i < chars.length; i++) {
    const text = chars[i];
    if (typeof text !== "string" || text.trim() === "") continue;
    const start = Number(starts[i] ?? 0);
    const end = Number(ends[i] ?? start);
    words.push({ text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) });
  }
  return words;
}

/**
 * Normalize ElevenLabs Scribe `words[]` (word-level) to the same shape.
 * Entries typed `spacing` / `audio_event` are skipped.
 *
 * @param {Array<{text?: string, start?: number, end?: number, type?: string}>} entries
 * @returns {{text: string, startMs: number, endMs: number}[]}
 */
export function normalizeScribeWords(entries) {
  const words = [];
  for (const entry of entries ?? []) {
    if (entry?.type && entry.type !== "word") continue;
    if (typeof entry?.text !== "string" || entry.text.trim() === "") continue;
    const start = Number(entry.start ?? 0);
    const end = Number(entry.end ?? start);
    words.push({ text: entry.text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) });
  }
  return words;
}

/**
 * Split one over-long paragraph into pieces at sentence punctuation, each
 * `<= maxChars` where possible.
 */
function splitLong(text, maxChars) {
  const parts = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [text];
  const pieces = [];
  let cur = "";
  for (const part of parts) {
    if (cur && cur.length + part.length > maxChars) {
      pieces.push(cur);
      cur = "";
    }
    if (part.length > maxChars) {
      for (let i = 0; i < part.length; i += maxChars) pieces.push(part.slice(i, i + maxChars));
    } else {
      cur += part;
    }
  }
  if (cur) pieces.push(cur);
  return pieces;
}

/**
 * Greedily split narration into chunks under a model character limit, breaking
 * on paragraph then sentence boundaries.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
export function chunkText(text, maxChars) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks = [];
  let cur = "";
  const push = (piece) => {
    if (!cur) cur = piece;
    else if (cur.length + 2 + piece.length <= maxChars) cur += "\n\n" + piece;
    else {
      chunks.push(cur);
      cur = piece;
    }
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) push(paragraph);
    else for (const piece of splitLong(paragraph, maxChars)) push(piece);
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const BITRATES = {
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

/**
 * Exact duration of a CBR/VBR MP3 by walking its frames — used to place
 * stitched chunks on the global timeline without decoding audio.
 *
 * @param {Uint8Array} buffer
 * @returns {number} milliseconds
 */
export function mp3DurationMs(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let offset = 0;
  // Skip an ID3v2 tag if present.
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    offset = 10 + size;
  }
  let durationSeconds = 0;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) {
      offset++;
      continue;
    }
    const versionBits = (buf[offset + 1] >> 3) & 0x3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (buf[offset + 1] >> 1) & 0x3; // 1=Layer III
    if (versionBits === 1 || layerBits !== 1) {
      offset++;
      continue;
    }
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 25;
    const bitrate = BITRATES[version === 1 ? "1-3" : "2-3"][(buf[offset + 2] >> 4) & 0xf];
    const sampleRate = SAMPLE_RATES[version][(buf[offset + 2] >> 2) & 0x3];
    const padding = (buf[offset + 2] >> 1) & 0x1;
    if (!bitrate || !sampleRate) {
      offset++;
      continue;
    }
    const samplesPerFrame = version === 1 ? 1152 : 576;
    const frameLength = Math.floor(((samplesPerFrame / 8) * bitrate * 1000) / sampleRate) + padding;
    durationSeconds += samplesPerFrame / sampleRate;
    offset += frameLength > 0 ? frameLength : 1;
  }
  return Math.round(durationSeconds * 1000);
}

/** Split a markdown file into its `---` frontmatter block and body. */
export function parseFrontmatter(md) {
  const text = md.replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) return { frontmatter: "", body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: "", body: text };
  const frontmatter = text.slice(0, end + 4);
  const body = text.slice(end + 4).replace(/^\n+/, "");
  return { frontmatter, body };
}

/** Split transcript/script body into sentence-level beats. */
export function splitIntoBeats(body) {
  const text = body.trim();
  if (!text) return [];
  const beats = [];
  for (const line of text.split(/\n{2,}/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "---") continue;
    const sentences = trimmed.match(/[^。！？!?]+[。！？!?]?/g) ?? [trimmed];
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (s) beats.push(s);
    }
  }
  return beats;
}

/** Tokenize text for diffing: words via Intl.Segmenter, else characters. */
export function tokenize(text) {
  try {
    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
    return [...segmenter.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment);
  } catch {
    return [...text].filter((c) => !/\s/.test(c));
  }
}

const MAX_DIFF_CELLS = 4_000_000;

/**
 * LCS diff over two token arrays. Returns ops `{ op: "=" | "-" | "+", value }`.
 * Falls back to a whole-replace op when the inputs are too large for the DP.
 */
export function diffTokens(a, b) {
  if (a.length * b.length > MAX_DIFF_CELLS) {
    return [
      ...a.map((value) => ({ op: "-", value })),
      ...b.map((value) => ({ op: "+", value })),
    ];
  }
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: "=", value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: "-", value: a[i++] });
    } else {
      ops.push({ op: "+", value: b[j++] });
    }
  }
  while (i < n) ops.push({ op: "-", value: a[i++] });
  while (j < m) ops.push({ op: "+", value: b[j++] });
  return ops;
}
