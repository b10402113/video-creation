import {resolve} from 'node:path';
import {registerProjectImages} from './image-library.mjs';

const [project, ...rest] = process.argv.slice(2);
if (!project || rest.length) {
  console.error('Usage: node .agents/skills/video-talkcraft/tools/sync-image-library.mjs <talkcraft-project>');
  process.exit(2);
}
const count = await registerProjectImages(resolve(project));
console.log('已同步 ' + count + ' 張有生圖紀錄的圖片');
await import('./build-library.mjs');
