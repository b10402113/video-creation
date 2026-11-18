#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir, readdir, readFile, lstat, copyFile, rename, rm, writeFile} from 'node:fs/promises';
import {resolve, join, dirname, extname, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const hash = data => createHash('sha256').update(data).digest('hex');
const defaults = fileURLToPath(new URL('../../video-talkcraft/', import.meta.url));
const kinds = new Set(['image','video','audio','animation','component','model']);
const categories = new Set(['開場意象','概念插畫','介面示意','圖表與流程','場景與背景','其他插畫','圖示與標誌']);
const exists = async p => lstat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const json = async p => JSON.parse(await readFile(p,'utf8'));
const strings = (v,label) => {
  if(v===undefined)return [];
  if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x.trim()))throw Error(label+' must be an array of nonempty strings');
  return [...new Set(v)];
};
async function writeAtomic(file,data){
 await mkdir(dirname(file),{recursive:true});
 const tmp=file+'.'+randomUUID()+'.tmp';
 try{await writeFile(tmp,data,{flag:'wx'});await rename(tmp,file);}finally{await rm(tmp,{force:true});}
}
async function walk(root,dir=root){
 const found=[];
 for(const d of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(['.git','node_modules','.DS_Store','.env','.aws','.ssh'].includes(d.name)||d.name.startsWith('.env.'))continue;
  const p=join(dir,d.name);
  if(d.isSymbolicLink())throw Error('Stage symlinks as local copies first: '+p);
  if(d.name==='SKILL.md')throw Error('Use stage-source.py to rename source SKILL.md before importing');
  if(d.isDirectory())found.push(...await walk(root,p));
  else if(d.isFile()){const bytes=await readFile(p);found.push({path:relative(root,p).split('\\').join('/'),sha256:hash(bytes),bytes:bytes.length});}
 }
 return found;
}
async function main(){
 const {positionals,values}=parseArgs({allowPositionals:true,options:{library:{type:'string',default:defaults},check:{type:'boolean',default:false},'no-build':{type:'boolean',default:false}}});
 if(positionals.length!==1)throw Error('Usage: merge-assets.mjs manifest.json [--check] [--library path] [--no-build]');
 const manifestPath=resolve(positionals[0]),m=await json(manifestPath),library=resolve(values.library);
 if(m.schemaVersion!==1||typeof m.sourceRoot!=='string'||!Array.isArray(m.assets)||!m.assets.length)throw Error('Expected schemaVersion:1, sourceRoot and nonempty assets');
 if(!m.provenance||!m.provenance.origin)throw Error('provenance.origin is required; use license:"unknown" if unknown');
 const sourceRoot=resolve(dirname(manifestPath),m.sourceRoot);
 if((await lstat(sourceRoot)).isSymbolicLink())throw Error('sourceRoot cannot be a symlink');
 const files=await walk(sourceRoot);if(!files.length)throw Error('Empty sourceRoot');
 const sourceFiles=new Map(files.map(f=>[f.path,f]));
 const bundleHash=hash(JSON.stringify(files)),bundle='video-talkcraft/assets/sources/'+bundleHash+'/';
 const pathFor=(p,required=false)=>{
  if(!p){if(required)throw Error('Missing required source path');return '';}
  if(typeof p!=='string'||isAbsolute(p)||p.includes('\\')||p.split('/').includes('..')||!sourceFiles.has(p))throw Error('Path must name a staged file: '+p);
  return bundle+p;
 };
 const baseProvenance={...m.provenance,license:m.provenance.license||'unknown',bundleSha256:bundleHash};
 delete baseProvenance.licensePath;delete baseProvenance.noticesPath;
 if(m.provenance.licensePath)baseProvenance.licenseFile=pathFor(m.provenance.licensePath,true);
 if(m.provenance.noticesPath)baseProvenance.thirdPartyNotices=pathFor(m.provenance.noticesPath,true);
 const existingMedia=new Map();
 for(const folder of ['image-library/entries','asset-library/entries']){
  const directory=join(library,folder);
  const names=await readdir(directory).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  for(const name of names.filter(n=>n.endsWith('.json')).sort()){
   const file=join(directory,name),entry=await json(file),kind=entry.kind||(folder.startsWith('image-')?'image':null);
   if(!['image','video','audio','model'].includes(kind))continue;
   let originalHash=entry.provenance?.sourceSha256;
   const original=entry.sourceFile||entry.source||entry.image;
   if(!originalHash&&original&&await exists(join(library,original)))originalHash=hash(await readFile(join(library,original)));
   if(originalHash&&!existingMedia.has(kind+':'+originalHash))existingMedia.set(kind+':'+originalHash,{file,entry});
  }
 }
 const prepared=[];const seen=new Set();
 const require=createRequire(join(library,'tools/image-library.mjs'));
 for(const a of m.assets){
  if(!kinds.has(a.kind)||typeof a.title!=='string'||!a.title.trim())throw Error('Each asset needs kind and title');
  const source=pathFor(a.path,true),sourceHash=sourceFiles.get(a.path).sha256;
  const existing=existingMedia.get(a.kind+':'+sourceHash);
  const id=existing?.entry.id||hash(a.kind+'\0'+sourceHash+(['animation','component'].includes(a.kind)?'\0'+bundleHash:''));
  if(seen.has(id))continue;seen.add(id);
  const tags=strings(a.tags,'tags'),inputs=strings(a.inputs,'inputs'),semantics=strings(a.semantics,'semantics');
  const format=a.format||extname(a.path).slice(1).toUpperCase();
  const runtime=a.runtime||(['animation','component'].includes(a.kind)?'unknown':a.kind==='model'?'three':'media');
  const readiness=a.kind==='image'?'ready':(a.readiness||(['animation','component'].includes(a.kind)?'reference':'unverified'));
  if(!['ready','unverified','reference'].includes(readiness))throw Error('Invalid readiness');
  if(['animation','component'].includes(a.kind)&&readiness==='ready'&&(runtime!=='remotion'||!a.validation))throw Error('Ready code assets need runtime:remotion and validation evidence');
  const extraProvenance={...(a.provenance||{})};
  if(extraProvenance.licensePath)extraProvenance.licenseFile=pathFor(extraProvenance.licensePath,true);
  if(extraProvenance.noticesPath)extraProvenance.thirdPartyNotices=pathFor(extraProvenance.noticesPath,true);
  delete extraProvenance.licensePath;delete extraProvenance.noticesPath;
  const provenance={...baseProvenance,...extraProvenance,sourceSha256:sourceHash};
  const entry={schemaVersion:1,id,kind:a.kind,title:a.title,tag:a.category||a.kind,summary:a.summary||'',tags,inputs,semantics,semantic:[...tags,...semantics].join(' · '),format,runtime,readiness,source,sha256:sourceHash,bundle,files:[...new Set([a.path,a.poster,a.preview,a.guide,...(a.files||[])].filter(Boolean))].map(p=>pathFor(p,true)),usage:{entrypoint:source,...(a.usage||{})},provenance};
  for(const [key,value] of Object.entries({thumb:a.poster,demo:a.preview,doc:a.guide,audio:a.kind==='audio'?a.path:null,video:a.kind==='video'?a.path:null,image:a.kind==='image'?a.path:null}))if(value)entry[key]=pathFor(value,true);
  if(a.validation)entry.validation=a.validation;
  let bytes;
  if(a.kind==='image'){
   const category=a.category||'其他插畫';if(!categories.has(category))throw Error('Unknown image category: '+category);
   const sharp=require('sharp'),raw=await readFile(join(sourceRoot,a.path));
   const vector=extname(a.path).toLowerCase()==='.svg';
   const meta=await sharp(raw).metadata();
   let image=sharp(raw,vector?{density:72*1200/meta.width}:{});
   if(vector)image=image.resize({width:1200});
   bytes=await image.webp({quality:90}).toBuffer();
   Object.assign(entry,{name:a.title,category,project:'共用素材',design:a.design||'通用',provider:'imported',sourceFile:source,sha256:hash(bytes),image:'image-library/objects/'+hash(bytes)+'.webp',format:'WEBP',runtime:'media'});
   entry.provenance.changes=[...(entry.provenance.changes||[]),'WebP working copy; original retained'+(vector?' (SVG rasterized at 1200 pixels wide)':'')];
  }
  const directory=a.kind==='image'?'image-library/entries':'asset-library/entries';
  const entryFile=existing?.file||join(library,directory,id+'.json');
  const old=await exists(entryFile)?await json(entryFile):null;
  if(old){
   for(const field of ['schemaVersion','kind','title','summary','inputs','semantics','format','runtime','readiness','usage'])if(old[field]===undefined)old[field]=entry[field];
   old.tags=[...new Set([...(old.tags||[]),...tags])];
   old.inputs=[...new Set([...(old.inputs||[]),...inputs])];
   old.semantics=[...new Set([...(old.semantics||[]),...semantics])];
   old.semantic=[...old.tags,...old.semantics].join(' · ');
   old.provenance ||= {};
   if(provenance.origin!==old.provenance.origin){
    const alternates=old.provenance.alternates||[];
    if(!alternates.some(p=>p.origin===provenance.origin))alternates.push(provenance);
    old.provenance.alternates=alternates;
   }
  }
  prepared.push({entry:old||entry,entryFile,bytes:old?null:bytes,status:old?'reused':'added'});
 }
 const report={schemaVersion:1,bundleSha256:bundleHash,sourceFiles:files.length,assets:prepared.map(p=>({id:p.entry.id,kind:p.entry.kind,title:p.entry.title,status:p.status,readiness:p.entry.readiness})),check:values.check};
 if(values.check){console.log(JSON.stringify(report,null,2));return;}
 // Validate and decode everything before changing the library.
 const bundleDir=join(library,bundle);
 if(!await exists(bundleDir)){
  const temp=bundleDir.slice(0,-1)+'.'+randomUUID()+'.tmp';
  try{
   for(const f of files){const target=join(temp,f.path);await mkdir(dirname(target),{recursive:true});await copyFile(join(sourceRoot,f.path),target);if(hash(await readFile(target))!==f.sha256)throw Error('Source changed while copying: '+f.path);}
   await mkdir(dirname(bundleDir),{recursive:true});await rename(temp,bundleDir);
  }finally{await rm(temp,{recursive:true,force:true});}
 }else for(const f of files){if(hash(await readFile(join(bundleDir,f.path)))!==f.sha256)throw Error('Stored source bundle integrity mismatch: '+f.path);}
 for(const p of prepared){
  if(p.bytes)await writeAtomic(join(library,p.entry.image),p.bytes);
  await writeAtomic(p.entryFile,JSON.stringify(p.entry,null,2)+'\n');
 }
 await writeAtomic(join(library,'asset-library/imports',hash(JSON.stringify(m))+'.json'),JSON.stringify({...report,provenance:baseProvenance,inventory:files},null,2)+'\n');
 if(!values['no-build']){
  const result=spawnSync(process.execPath,[join(library,'tools/build-library.mjs')],{encoding:'utf8'});
  if(result.status!==0)throw Error('Assets merged; library index rebuild failed: '+result.stderr);
  process.stderr.write(result.stdout);
 }
 console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
