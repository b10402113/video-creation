import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const [project, id] = process.argv.slice(2);
if (!project || !id || !/^[a-z\d]+(?:-[a-z\d]+)*$/.test(id)) {
  console.error('Usage: node .agents/skills/video-talkcraft/tools/select-design.mjs <project> <design-folder>');
  process.exit(2);
}
const dir = join(workspace, 'design', id);
await readFile(join(dir, 'design.md'), 'utf8');
const theme = JSON.parse(await readFile(join(dir, 'theme.json'), 'utf8'));
const colors = ['background','panel','ink','muted','accent','secondary','success','line','caption','paper'];
const numbers = {size:[24,64], bottom:[32,100], radius:[0,30], maxWidth:[640,1520]};
if (typeof theme.name !== 'string' || !theme.name.trim()
  || colors.some(x => !/^#[a-f0-9]{6}$/i.test(theme.colors?.[x]))
  || ['sans','mono'].some(x => typeof theme.font?.[x] !== 'string' || !theme.font[x].trim())
  || Object.entries(numbers).some(([x,[min,max]]) => !Number.isFinite(theme.subtitle?.[x]) || theme.subtitle[x] < min || theme.subtitle[x] > max)
  || !Number.isFinite(theme.motion?.push) || theme.motion.push < 1 || theme.motion.push > 1.1) {
  throw new Error('Invalid colors, fonts, subtitle or camera in ' + id + '/theme.json');
}
const out = resolve(project, 'remotion/src');
await mkdir(out, {recursive:true});
await writeFile(join(out, 'design.json'), JSON.stringify({...theme, id}, null, 2) + '\n');
console.log('Selected ' + id);
