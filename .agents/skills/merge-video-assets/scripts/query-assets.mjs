#!/usr/bin/env node
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
const defaults=fileURLToPath(new URL('../../video-talkcraft/',import.meta.url));
const {values}=parseArgs({options:{library:{type:'string',default:defaults},query:{type:'string',default:''},kind:{type:'string'},ready:{type:'boolean',default:false},limit:{type:'string',default:'8'},id:{type:'string'}}});
const root=values.library;
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const jsonEntries=async p=>{
 const names=await readdir(p).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 return Promise.all(names.filter(n=>n.endsWith('.json')).sort().map(n=>read(join(p,n))));
};
const cards=await read(join(root,'video-talkcraft/references/cards-index.json')).catch(e=>{if(e.code==='ENOENT')return {cards:[]};throw e;});
const native=cards.cards.map(c=>({id:c.slug,kind:'animation',title:c.title,summary:c.oneliner,tags:[c.category],inputs:c.inputs.map(x=>x.type),semantics:c.semantics,runtime:'remotion',readiness:'ready',format:'TSX',source:'video-talkcraft/'+c.code,doc:'video-talkcraft/references/cards/'+c.slug+'.md',usage:{props:c.props,hardcoded:c.hardcoded}}));
const modules=[];
for(const folder of ['components','motion-systems']){
 const dir=join(root,'video-talkcraft/template',folder);
 const files=await readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 for(const file of files.filter(n=>/\.tsx?$/.test(n)).sort()){
  const source='video-talkcraft/template/'+folder+'/'+file;
  const text=await readFile(join(root,source),'utf8');
  const exports=[...text.matchAll(/^export (?:const|function|class|interface|type) (\w+)/gm)].map(m=>m[1]);
  modules.push({id:folder+'/'+file,kind:'component',title:file.replace(/\.tsx?$/,''),tags:[folder],summary:exports.join(' · '),runtime:'remotion',readiness:'ready',format:'TSX',source,usage:{exports}});
 }
}
const images=(await jsonEntries(join(root,'image-library/entries'))).map(e=>({...e,kind:'image',title:e.title||e.name,source:e.source||e.sourceFile||e.image,runtime:'media',readiness:'ready',format:'WEBP'}));
const others=(await jsonEntries(join(root,'asset-library/entries'))).map(e=>({...e,runtime:e.runtime||(e.format==='GLB／3D'?'three':e.kind==='audio'||e.kind==='video'?'media':'unknown'),readiness:e.readiness||(['animation','component','model'].includes(e.kind)?'reference':'unverified')}));
const query=values.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
const limit=Number(values.limit);if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('--limit must be 1–100');
const result=[...native,...modules,...images,...others].filter(e=>!values.id||e.id===values.id).filter(e=>!values.kind||e.kind===values.kind).filter(e=>!values.ready||e.readiness==='ready').map(e=>{
 const fields=[e.title,e.summary,e.semantic,...(e.tags||[]),...(e.semantics||[]),e.id].filter(Boolean).join(' ').toLowerCase();
 return {e,score:query.reduce((n,t)=>n+(fields.includes(t)?1:0),0)};
}).filter(x=>!query.length||x.score===query.length).sort((a,b)=>(b.e.readiness==='ready')-(a.e.readiness==='ready')||b.score-a.score||a.e.title.localeCompare(b.e.title));
console.log(JSON.stringify({total:result.length,items:result.slice(0,limit).map(({e})=>({id:e.id,kind:e.kind,title:e.title,runtime:e.runtime,readiness:e.readiness,source:e.source,image:e.image,doc:e.doc,summary:(e.summary||'').slice(0,180),...(values.id?{format:e.format,inputs:e.inputs||[],semantics:e.semantics||[],usage:e.usage||{},provenance:{origin:e.provenance?.origin||e.provenance?.name,license:e.provenance?.license,licenseFile:e.provenance?.licenseFile,thirdPartyNotices:e.provenance?.thirdPartyNotices}}:{})}))},null,2));
