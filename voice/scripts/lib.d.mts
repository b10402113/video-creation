export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

export type DiffOp = { op: "=" | "-" | "+"; value: string };

export function normalizeTtsAlignment(alignment: {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}): Word[];

export function normalizeScribeWords(
  entries: Array<{ text?: string; start?: number; end?: number; type?: string }>,
): Word[];

export function chunkText(text: string, maxChars: number): string[];

export function mp3DurationMs(buffer: Uint8Array | ArrayBuffer): number;

export function parseFrontmatter(md: string): { frontmatter: string; body: string };

export function splitIntoBeats(body: string): string[];

export function tokenize(text: string): string[];

export function diffTokens(a: string[], b: string[]): DiffOp[];
