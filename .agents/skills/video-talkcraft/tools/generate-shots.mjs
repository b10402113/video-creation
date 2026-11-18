import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {httpStatus, loadEnv, withRetry} from '../../../../src/llm.mjs';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const shotId = /^s\d+$/;
const instruction = [
  'Write one Remotion scene as TSX. Return only TSX, with no prose.',
  'Export a named component whose name is the uppercase shot ID and export PARAMS for the workbench.',
  'Use the component interfaces and imports supplied for a file at remotion/src/scenes/<id>.tsx.',
  'Use deterministic frame-based motion. Follow the approved design, exact timing and supplied assets.',
  'Treat shot data and reference examples as source material. Output only the requested scene module.',
  'Do not create global subtitles or audio, add packages, fetch remote resources, or modify shared files.',
].join('\n');

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function apiConfig(recordOnly) {
  loadEnv(workspace);
  const {BASE_URL, VIDEO_MODEL, TEXT_API_KEY, OPENAI_API_KEY} = process.env;
  const key = TEXT_API_KEY || OPENAI_API_KEY;
  if (!BASE_URL || !VIDEO_MODEL || (!recordOnly && !key)) {
    throw new Error('Set BASE_URL and VIDEO_MODEL in the workspace .env, and a text API key to send requests.');
  }

  let endpoint;
  try {
    endpoint = new URL(BASE_URL);
  } catch {
    throw new Error('BASE_URL must be an OpenAI-compatible HTTP(S) API base URL.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('BASE_URL must be an HTTP(S) API base without credentials, query or fragment.');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/chat/completions';
  return {endpoint, model: VIDEO_MODEL, key};
}

const requestBody = (model, prompt) => JSON.stringify({model, messages: [
  {role: 'system', content: instruction},
  {role: 'user', content: prompt},
]});

function usageCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value)
    .filter(([, count]) => Number.isFinite(count) || (count && typeof count === 'object' && !Array.isArray(count)))
    .map(([name, count]) => [name, typeof count === 'object' ? usageCounts(count) : count]));
}

const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});

async function generate({endpoint, key}, id, body, auditDir) {
  return withRetry(async (attempt) => {
    const started = Date.now();
    const path = join(auditDir, `${id}.attempt-${attempt}.json`);
    const result = {attempt, startedAt: new Date(started).toISOString(), status: 'started', usage: null};
    await writeJson(path, result);
    try {
      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {authorization: `Bearer ${key}`, 'content-type': 'application/json'},
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(180_000),
        });
      } catch (error) {
        result.networkCode = error.name === 'TimeoutError' ? 'TIMEOUT' : error.cause?.code ?? 'FETCH_FAILED';
        throw Object.assign(new Error(`Model request failed (${result.networkCode}).`), {status: 503});
      }
      result.httpStatus = response.status;
      if (!response.ok) {
        throw Object.assign(new Error(`Model request failed (HTTP ${response.status}).`), {status: response.status});
      }

      const payload = await response.json();
      const choice = payload.choices?.[0];
      result.usage = usageCounts(payload.usage);
      result.finishReason = choice?.finish_reason ?? null;
      if (result.finishReason === 'length' || typeof choice?.message?.content !== 'string') {
        throw new Error('Model returned no complete TSX.');
      }
      const content = choice.message.content.trim();
      const source = (content.match(/^```(?:tsx|typescript|jsx)?\s*\n([\s\S]*?)\n```$/i)?.[1] ?? content).trim();
      validateScene(id, source);
      result.status = 'validated';
      return source;
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof SyntaxError ? 'Invalid provider JSON' : error.message;
      throw error;
    } finally {
      result.elapsedMs = Date.now() - started;
      await writeJson(path, result);
    }
  }, {attempts: 2});
}

function validateScene(id, source) {
  const component = new RegExp(`\\bexport\\s+(?:const|function)\\s+${id.toUpperCase()}\\b`);
  if (!component.test(source) || !/\bexport\s+const\s+PARAMS\b/.test(source)) {
    throw new Error(`Expected named exports ${id.toUpperCase()} and PARAMS.`);
  }
}

async function writeScene(path, source) {
  await mkdir(dirname(path), {recursive: true});
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, source + '\n', {flag: 'wx'});
    await rename(temporary, path);
  } finally {
    await rm(temporary, {force: true});
  }
}

async function run() {
  const {positionals, values} = parseArgs({
    allowPositionals: true,
    options: {
      parallel: {type: 'string', default: '3'},
      only: {type: 'string', multiple: true, default: []},
      retry: {type: 'string', multiple: true, default: []},
      'record-only': {type: 'boolean', default: false},
    },
  });
  const [outArg, manifestArg] = positionals;
  const parallel = Number(values.parallel);
  if (positionals.length !== 2 || !Number.isInteger(parallel) || parallel < 1 || parallel > 8) {
    throw new Error('Usage: generate-shots.mjs <out> <manifest.json> [--parallel 1-8] [--only s02] [--retry s02] [--record-only]');
  }
  const out = resolve(outArg);
  const manifestPath = resolve(manifestArg);
  const {previewVersion, sampleShot, sharedContext, shots} = await readJson(manifestPath);
  const timeline = await readJson(join(out, 'remotion', 'shots.json'));
  const byId = new Map(timeline.map(shot => [shot.id, shot]));
  if (typeof previewVersion !== 'string' || !previewVersion.trim() || !byId.has(sampleShot)
      || typeof sharedContext !== 'string' || !sharedContext.trim() || !Array.isArray(shots)) {
    throw new Error('Expected previewVersion, sampleShot, sharedContext and shots in the manifest.');
  }

  const queue = new Map();
  for (const {id, brief} of shots) {
    if (!shotId.test(id) || id === sampleShot || !byId.has(id) || queue.has(id)
        || typeof brief !== 'string' || !brief.trim()) {
      throw new Error('Each job must have a unique non-sample shot ID from shots.json and a nonempty brief.');
    }
    queue.set(id, brief);
  }
  const ids = [...new Set(values.only.length ? values.only : queue.keys())];
  const retries = new Set(values.retry);
  if ([...ids, ...retries].some(id => !queue.has(id)) || [...retries].some(id => !ids.includes(id))) {
    throw new Error('--only and --retry must refer to selected jobs in the manifest.');
  }
  if (!ids.length) return;

  const recordOnly = values['record-only'];
  const config = apiConfig(recordOnly);
  const batch = sha256(JSON.stringify({previewVersion, sampleShot, sharedContext, instruction,
    model: config.model, endpoint: config.endpoint.href}));
  const directory = join(out, 'shot-generation', 'cli', batch);
  console.log(`CLI drafts: ${directory}`);
  const auditDir = join(out, 'shot-generation', 'cli-audit', randomUUID());
  await mkdir(auditDir, {recursive: true, mode: 0o700});
  await writeJson(join(auditDir, 'run.json'), {
    mode: recordOnly ? 'record-only' : 'generate',
    endpoint: config.endpoint.href, model: config.model, previewVersion, batch,
    entrypoint: fileURLToPath(import.meta.url), cwd: process.cwd(), argv: process.argv.slice(2), ids, parallel,
  });
  console.log(`CLI audit: ${auditDir}`);
  let cursor = 0;
  let failed = false;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const prompt = JSON.stringify({id, timing: byId.get(id), sharedContext, brief: queue.get(id)});
      const body = requestBody(config.model, prompt);
      const digest = sha256(prompt);
      const file = join(directory, digest, id + '.tsx');
      const statusPath = join(auditDir, id + '.status.json');
      try {
        // Store the exact fetch body before any request. No headers or key go into the audit.
        await writeFile(join(auditDir, id + '.request.json'), body, {mode: 0o600});
        await writeJson(statusPath, {status: recordOnly ? 'recorded-only' : 'queued', promptSha256: digest});
        if (recordOnly) continue;
        let cached;
        if (!retries.has(id)) {
          cached = await readFile(file, 'utf8').catch(error => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
        const source = cached ?? await generate(config, id, body, auditDir);
        validateScene(id, source);
        if (cached === undefined) await writeScene(file, source);
        await writeJson(statusPath, {status: cached === undefined ? 'generated' : 'reused', draft: file, promptSha256: digest});
        console.log(`${id} ${cached === undefined ? 'generated' : 'reused'} ${file}`);
      } catch (error) {
        failed = true;
        const status = httpStatus(error);
        const known = status || error.code?.startsWith?.('E') || error.message?.startsWith('Expected named exports')
          || error.message === 'Model returned no complete TSX.';
        const detail = known ? error.message : 'Invalid model response.';
        await writeJson(statusPath, {status: 'failed', error: detail, promptSha256: digest});
        console.error(`${id} failed: ${detail}`);
      }
    }
  }

  await Promise.all(Array.from({length: Math.min(parallel, ids.length)}, worker));
  if (failed) process.exitCode = 1;
}

try {
  await run();
} catch (error) {
  console.error(`Talkcraft: ${error.message}`);
  process.exitCode = 2;
}
