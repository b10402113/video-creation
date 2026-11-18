import { readdir, readFile, access } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {readImageEntries, writeAtomic} from './image-library.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const upstream = join(root, 'video-talkcraft');
const files = async (p, pattern) => (await readdir(p)).filter(x => pattern.test(x)).sort();
const exists = async p => access(p).then(() => true, () => false);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tabs = ['全部','動畫','共用元件','Design','圖片素材','音效','3D 模型','影片素材'];
const items = [];
for (const file of await files(join(upstream,'references/cards'),/\.md$/)) {
  const raw = await readFile(join(upstream,'references/cards',file),'utf8');
  const fm = raw.replace(/\r/g,'').match(/^---\n([\s\S]*?)\n---/);
  if (!fm) throw new Error('Missing card frontmatter: ' + file);
  const m = Object.fromEntries(fm[1].split('\n').map(x=>x.match(/^([^:：]+)[:：]\s*(.*)$/)).filter(Boolean).map(x=>[x[1],x[2]]));
  const slug = basename(file,'.md');
  const path = 'video-talkcraft/';
  items.push({group:1,id:slug,title:m['标题']||slug,tag:m['类别'],summary:m['一句话'],needs:m['输入'],semantic:m['语义'],
    source:path+'template/cards/'+slug+'.tsx',doc:path+'references/cards/'+file,
    thumb:await exists(join(upstream,'gallery/thumbs',slug+'.png')) ? path+'gallery/thumbs/'+slug+'.png' : '',
    demo:await exists(join(upstream,'demos',slug,'index.html')) ? path+'demos/'+slug+'/index.html' : ''});
}
for (const group of ['components','motion-systems']) {
  for (const file of await files(join(upstream,'template',group),/\.tsx?$/)) {
    const raw = await readFile(join(upstream,'template',group,file),'utf8');
    const exports = [...raw.matchAll(/^export (?:const|type|function|interface|class) (\w+)/gm)].map(x=>x[1]);
    items.push({group:2,id:group+'/'+file,title:basename(file,extname(file)),tag:group,
      summary:exports.join(' · ') || '模板模組',source:'video-talkcraft/template/'+group+'/'+file});
  }
}
const designRoot=join(root,'../../../design');
for (const id of (await readdir(designRoot,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort()) {
  if (!await exists(join(designRoot,id,'design.md'))) continue;
  const hasTokens=await exists(join(designRoot,id,'theme.json'));
  const theme=hasTokens ? JSON.parse(await readFile(join(designRoot,id,'theme.json'),'utf8')) : null;
  items.push({group:3,id,title:theme?.name??id,tag:hasTokens?'可切換':'視覺筆記',summary:hasTokens?'design.md + theme.json':'補上 theme.json 後即可切換',
    doc:'../../../design/'+id+'/design.md',source:hasTokens?'../../../design/'+id+'/theme.json':'',
    demo:await exists(join(designRoot,id,'design-system.html'))?'../../../design/'+id+'/design-system.html':'',
    thumb:await exists(join(designRoot,id,'reference/sheet-001.jpg'))?'../../../design/'+id+'/reference/sheet-001.jpg':''});
}
for (const entry of await readImageEntries()) {
  items.push({
    group: 4, id: entry.id, title: entry.name, tag: entry.category,
    project: entry.project, design: entry.design, summary: entry.project + ' · ' + entry.design,
    semantic: entry.tags.join(' · '), thumb: entry.image, image: entry.image,
    provenance:entry.provenance, extraLinks:entry.sourceFile ? [['原始素材',entry.sourceFile],['授權',entry.provenance?.licenseFile],['第三方聲明',entry.provenance?.thirdPartyNotices]] : [],
  });
}
// Additional reusable assets share the same catalog, classified by use rather than supplier.
const assetGroups = {animation:1, component:2, image:4, audio:5, model:6, video:7};
const assetEntries = join(root,'asset-library/entries');
if (await exists(assetEntries)) {
  for (const file of await files(assetEntries,/\.json$/)) {
    const entry = JSON.parse(await readFile(join(assetEntries,file),'utf8'));
    if (!assetGroups[entry.kind]) throw new Error('Unknown asset kind: ' + file);
    items.push({...entry, group:assetGroups[entry.kind]});
  }
}
const counts=tabs.map((_,g)=>items.filter(x=>!g || x.group===g).length);
const links=x=>[['播放預覽',x.demo],['規格',x.doc],['原始碼',x.source],['開啟原圖',x.image],...(x.extraLinks||[])].filter(([,p],i,all)=>p&&all.findIndex(([,v])=>v===p)===i).map(([label,p])=>'<a href="'+esc(p)+'">'+esc(label)+'</a>').join('');
const cards=items.map(x=>'<article data-group="'+x.group+'" data-tag="'+esc(x.tag)+'" data-project="'+esc(x.project)+'" data-design="'+esc(x.design)+'" data-format="'+esc(x.format)+'" data-search="'+esc([...Object.values(x).filter(v=>typeof v==='string'),...(x.extraLinks||[]).flat(),JSON.stringify(x.provenance||{})].join(' ').toLowerCase())+'">'
  +(x.thumb&&!x.video?'<img loading="lazy" alt="" src="'+esc(x.thumb)+'">':'')+(x.video?'<video controls preload="none" playsinline'+(x.thumb?' poster="'+esc(x.thumb)+'"':'')+' src="'+esc(x.video)+'"></video>':'')+(x.audio?'<audio controls preload="none" aria-label="'+esc(x.title)+'" src="'+esc(x.audio)+'"></audio>':'')+'<div class="body"><div class="tag">'+esc([x.tag,x.format].filter(Boolean).join(' · '))+'</div><h2>'+esc(x.title)+'</h2><code>'+esc(x.id)+'</code><p>'+esc(x.summary)+'</p>'
  +(x.needs||x.semantic?'<small>'+esc([x.needs,x.semantic].filter(Boolean).join(' · '))+'</small>':'')+'<footer>'+links(x)+'</footer></div></article>').join('\n');
const html=`<!doctype html>
<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Talkcraft 動效與元件庫</title>
<style>
:root{color-scheme:dark;--bg:#171716;--card:#222220;--ink:#f7f3e8;--muted:#c0b9ab;--line:#44403a;--accent:#ffab62}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:44px 28px}h1{font-size:clamp(30px,6vw,54px);letter-spacing:-.04em;margin:6px 0 10px}header p{color:var(--muted);max-width:66ch;margin:0 0 22px}.tag,small{color:var(--accent)}.controls,nav{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}button,input,select{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:9px 13px}button{cursor:pointer}button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}input{flex:1;min-width:210px}a{color:var(--accent);text-underline-offset:4px}#results{color:var(--muted);margin:14px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,276px),1fr));gap:16px}article{border:1px solid var(--line);border-radius:13px;overflow:hidden;background:var(--card);display:flex;flex-direction:column}article[hidden],[hidden]{display:none!important}article img{object-fit:contain;background:#1b1b1e}article img,article video{width:100%;aspect-ratio:16/9;object-fit:contain;background:#363430}article audio{width:100%;padding:12px}.body{padding:16px;flex:1;display:flex;flex-direction:column}h2{font-size:20px;margin:3px 0}code{color:var(--muted);overflow-wrap:anywhere}article p{margin:10px 0}footer{display:flex;gap:14px;flex-wrap:wrap;margin-top:auto;padding-top:12px;font-size:14px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style><main><header><div class="tag">VIDEO TALKCRAFT / WORKSPACE LIBRARY</div><h1>動效與元件庫</h1><p>先按素材或語義找動效，再到配方檢查可用參數。動畫、共用元件、圖片、音效、3D 模型與影片統一依用途收錄，來源與授權保留在項目資料中。</p><a href="video-talkcraft/gallery/index.html">開啟原版可互動畫廊 ↗</a></header>
<nav aria-label="資產分頁">${tabs.map((t,i)=>'<button data-tab="'+i+'" aria-pressed="'+(i===0)+'">'+t+' '+counts[i]+'</button>').join('')}</nav>
<div class="controls"><input id="search" aria-label="搜尋" placeholder="搜尋名稱、語義、專案或標籤"><select id="filter" aria-label="分類"><option value="">所有分類</option></select><select id="project" aria-label="專案" hidden></select><select id="design" aria-label="圖片風格" hidden></select></div>
<p role="status" id="results"></p><div class="grid">${cards}</div></main>
<script>
const q=document.querySelector('#search'), f=document.querySelector('#filter'), results=document.querySelector('#results');
const project=document.querySelector('#project'), design=document.querySelector('#design');
const buttons=[...document.querySelectorAll('[data-tab]')], cards=[...document.querySelectorAll('article')];let tab=0;
function scoped(){return cards.filter(x=>!tab||Number(x.dataset.group)===tab)}
function options(select,key,label){
  select.replaceChildren(new Option(label,''));
  [...new Set(scoped().map(x=>x.dataset[key]).filter(Boolean))].sort()
    .forEach(value=>select.add(new Option(value,value)));
}
function filters(){
  options(f,'tag','所有分類');
  project.hidden=design.hidden=tab!==4;
  options(project,'project','所有專案');
  options(design,'design','所有風格');
}
function render(){
  const terms=q.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);
  let n=0;
  cards.forEach(x=>{
    x.hidden=Boolean(
      (tab&&+x.dataset.group!==tab) ||
      (f.value&&x.dataset.tag!==f.value) ||
      (tab===4&&project.value&&x.dataset.project!==project.value) ||
      (tab===4&&design.value&&x.dataset.design!==design.value) ||
      !terms.every(t=>x.dataset.search.includes(t))
    );
    n+=!x.hidden;
  });
  results.textContent=n?'顯示 '+n+' 個項目':'沒有符合的項目';
}
buttons.forEach(b=>b.onclick=()=>{
  tab=+b.dataset.tab;
  buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  filters();
  render();
});
q.oninput=f.onchange=project.onchange=design.onchange=render;
filters();
render();
</script></html>`;
await writeAtomic(join(root,'library.html'),html);
console.log(counts.map((n,i)=>tabs[i]+': '+n).join(' · '));
