import {mkdir, readFile, stat, rename, rm} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {imageGenerator, resolveImageModel, resolveImageProvider, writeWebp} from '../../../../src/image-provider.mjs';
import {withRetry, isRetryable, httpStatus} from '../../../../src/llm.mjs';
import {optionalJson, readLibraryImage, recordImage, validateClassification, writeAtomic} from './image-library.mjs';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const [project, ...flags] = process.argv.slice(2);
if (!project || flags.some(x => x !== '--force')) {
  console.error('Usage: node .agents/skills/video-talkcraft/tools/generate-assets.mjs <talkcraft-project> [--force]');
  process.exit(2);
}
try { process.loadEnvFile(join(workspace, '.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const root = resolve(project);
const assetFile = join(root, 'assets.json');
const {style, images} = JSON.parse(await readFile(assetFile, 'utf8'));
if (typeof style !== 'string' || !style.trim() || !Array.isArray(images) || !images.length) throw new Error('assets.json needs style and images');
const valid = new Set();
for (const asset of images) {
  const {id, prompt, libraryId} = asset;
  validateClassification(asset);
  if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || valid.has(id) || (!libraryId && (typeof prompt !== 'string' || !prompt.trim()))) {
    throw new Error('Each image needs a unique kebab-case id and either prompt or libraryId');
  }
  if (libraryId !== undefined && (typeof libraryId !== 'string' || !/^[a-f0-9]{64}$/.test(libraryId))) {
    throw new Error(id + ' 的 libraryId 必須是圖片庫中的完整 ID');
  }
  valid.add(id);
}
const out = join(root, 'remotion/public/assets/generated');
const model = resolveImageModel();
const provider = resolveImageProvider();
const generate = imageGenerator();
const ledgerFile = join(root, 'asset-ledger.json');
const ledger = await optionalJson(ledgerFile, {});
const design = await optionalJson(join(root, 'remotion/src/design.json'), {});
for (const asset of images) {
  const {id, prompt, libraryId} = asset;
  const file = join(out, id + '.webp');
  const path = 'remotion/public/assets/generated/' + id + '.webp';
  const existing = !flags.includes('--force') && await stat(file).then(s => s.size > 0, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  if (existing) {
    if (libraryId && ledger[id]?.libraryId !== libraryId) {
      throw new Error(id + ' 已有不同素材，請換 id 或明確使用 --force');
    }
    if (ledger[id]) await recordImage(root, asset, file, ledger[id], ledger[id].design || design.id);
    else console.warn(id + ' 缺少生圖紀錄，沿用專案圖片，未加入共用庫。');
    console.log('Reusing ' + id);
    continue;
  }
  if (libraryId) {
    const {entry, bytes} = await readLibraryImage(libraryId);
    await mkdir(out, {recursive: true});
    await writeAtomic(file, bytes);
    ledger[id] = {provider: entry.provider, model: entry.model, prompt: entry.prompt,
      category: entry.category, tags: entry.tags, libraryId, path, design: design.id || entry.design,
      ...(entry.provenance ? {provenance:entry.provenance} : {}),
      ...(entry.sourceFile ? {sourceFile:entry.sourceFile} : {})};
    await writeAtomic(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
    await recordImage(root, asset, file, ledger[id], ledger[id].design);
    console.log('Copied from library: ' + id);
    continue;
  }
  const request = {model, prompt: style + '\n\n' + prompt, size: process.env.IMAGE_SIZE || '4:3',
    resolution: process.env.IMAGE_RESOLUTION || '1K', quality: process.env.IMAGE_QUALITY || 'medium'};
  const bytes = await withRetry(() => generate(request), {
    attempts: 3, baseDelayMs: 5000,
    retryOn: error => isRetryable(error) && !httpStatus(error),
  });
  const temp = file + '.' + process.pid + '.tmp';
  try {
    await writeWebp(temp, bytes);
    await rename(temp, file);
  } finally { await rm(temp, {force: true}); }
  ledger[id] = {provider, ...request, path, design: design.id};
  await writeAtomic(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
  await recordImage(root, asset, file, ledger[id], design.id);
  console.log('Generated ' + id + ' (' + provider + '/' + model + ')');
}

await import('./build-library.mjs');
