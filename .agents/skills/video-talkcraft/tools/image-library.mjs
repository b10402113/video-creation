import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {basename, dirname, isAbsolute, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const library = fileURLToPath(new URL('../image-library/', import.meta.url));
const entries = join(library, 'entries');
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = /^[a-f0-9]{64}$/;
export const imageCategories = ['開場意象', '概念插畫', '介面示意', '圖表與流程', '場景與背景', '其他插畫', '圖示與標誌'];

export async function optionalJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeAtomic(path, contents) {
  const temp = join(dirname(path), '.' + basename(path) + '.' + randomUUID() + '.tmp');
  try {
    await writeFile(temp, contents, {flag: 'wx'});
    await rename(temp, path);
  } finally {
    await rm(temp, {force: true});
  }
}

export function validateClassification({category, tags}) {
  if (category !== undefined && !imageCategories.includes(category)) {
    throw new Error('分類須為：' + imageCategories.join('、'));
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string' || !tag.trim()))) {
    throw new Error('tags 必須是非空字串組成的陣列');
  }
}

export async function recordImage(project, asset, file, evidence, design) {
  validateClassification(asset);
  const bytes = await readFile(file);
  if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WEBP') {
    throw new Error(file + ' 不是 WebP');
  }
  const inside = relative(workspace, project);
  const external = isAbsolute(inside) || inside.split(sep).includes('..');
  const projectName = external && basename(project) === 'talkcraft-remake' ?
    basename(dirname(project)) + '/talkcraft-remake' : external ? basename(project) : inside;
  const sha256 = digest(bytes);
  const id = digest(JSON.stringify([external ? project : projectName, asset.id, sha256]));
  const image = 'image-library/objects/' + sha256 + '.webp';
  const metadata = {
    id, image, sha256, name: asset.id, project: projectName, design: design || evidence.design || '未指定',
    category: asset.category || evidence.category || '其他插畫',
    tags: [...new Set((asset.tags || evidence.tags || []).map(tag => tag.trim()))],
    provider: evidence.provider, model: evidence.model, prompt: evidence.prompt,
    ...(evidence.libraryId ? {sourceId: evidence.libraryId} : {}),
    ...(evidence.provenance ? {provenance:evidence.provenance} : {}),
    ...(evidence.sourceFile ? {sourceFile:evidence.sourceFile} : {}),
  };
  await mkdir(join(library, 'objects'), {recursive: true});
  await mkdir(entries, {recursive: true});
  await writeAtomic(join(library, 'objects', sha256 + '.webp'), bytes);
  await writeAtomic(join(entries, id + '.json'), JSON.stringify(metadata, null, 2) + '\n');
  return id;
}

export async function readImageEntries() {
  const names = await readdir(entries).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return (await Promise.all(names.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort()
    .map(name => optionalJson(join(entries, name), null)))).filter(Boolean);
}

export async function readLibraryImage(id) {
  if (typeof id !== 'string' || !identifier.test(id)) throw new Error('libraryId 必須是圖片庫中的完整 ID');
  const entry = await optionalJson(join(entries, id + '.json'), null);
  if (!entry) throw new Error('圖片庫找不到 ' + id);
  if (!identifier.test(entry.sha256)) throw new Error('圖片庫索引格式不符：' + id);
  const bytes = await readFile(join(library, 'objects', entry.sha256 + '.webp'));
  if (digest(bytes) !== entry.sha256) throw new Error('圖片庫檔案與索引不符：' + id);
  return {entry, bytes};
}

export async function registerProjectImages(project) {
  const ledger = await optionalJson(join(project, 'asset-ledger.json'), {});
  const {images = []} = await optionalJson(join(project, 'assets.json'), {});
  const design = await optionalJson(join(project, 'remotion/src/design.json'), {});
  const assets = new Map(images.map(asset => [asset.id, asset]));
  let count = 0;
  for (const [id, evidence] of Object.entries(ledger)) {
    if (evidence.path !== 'remotion/public/assets/generated/' + id + '.webp' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) continue;
    const recorded = await recordImage(project, assets.get(id) || {id}, join(project, evidence.path), evidence, evidence.design || design.id);
    console.log(id + ' → ' + recorded);
    count++;
  }
  return count;
}

