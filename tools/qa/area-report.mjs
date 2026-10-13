// Local diagnostic report builder. Reads captures; never touches runtime/ROM.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {readOptions} from './area-catalog.mjs';

const options=readOptions(),root=options.out;
const catalog=JSON.parse(await fs.readFile(root+'/catalog.json','utf8'));
const names=await fs.readdir(root+'/records');
const records=await Promise.all(names.filter(n=>/^\d{3}\.json$/.test(n)).map(async n=>JSON.parse(await fs.readFile(root+'/records/'+n,'utf8'))));
const byId=new Map(records.map(r=>[r.id,r]));
let specialBattle=null;
try{
 const r=JSON.parse(await fs.readFile(root+'/special-manabeast/report.json','utf8'));
 specialBattle={event:r.initialization.event,frames:r.history.length,unexpectedPixels:r.history.reduce((s,h)=>s+h.comparison.unexpected,0),pageErrors:r.errors,rendererSourceHash:r.rendererSourceHash};
}catch(error){if(error.code!=='ENOENT')throw error;}
const groups=[...new Set(catalog.maps.map(m=>m.region))].sort();
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const pad=n=>String(n).padStart(3,'0');
const total={maps:catalog.maps.length,documented:catalog.maps.filter(m=>m.documented).length,attempted:records.length,documentedCompleted:records.filter(r=>catalog.maps[r.id]?.documented&&r.result==='captured').length,
  resultCounts:records.reduce((a,r)=>(a[r.result]=(a[r.result]||0)+1,a),{}),
  unexpectedPixels:records.reduce((s,r)=>s+(r.comparison?.unexpected||0),0),
  pageErrors:records.filter(r=>r.pageErrors?.length).map(r=>({id:r.id,errors:r.pageErrors})),
  missingBody:records.filter(r=>r.plan&&!r.plan.parts.length).map(r=>({id:r.id,name:r.name,result:r.result,event:r.status.event,canAttack:r.status.canAttack,colors:r.uniqueColors}))};
const summary={generated:new Date().toISOString(),privateDiagnostic:true,coverage:'One native entry viewport per map slot; opening story flags and full party. Not a walkthrough or all event/animation variants.',
  method:'In-memory scratch event at ROM 0x742B0 uses original door loader via temporary door 3. Each map starts from the same native-initialized full-party checkpoint. Original ROM file is read only.',total,
  regions:groups.map(region=>{const maps=catalog.maps.filter(m=>m.region===region),rs=maps.map(m=>byId.get(m.id)).filter(Boolean);return {region,name:maps[0].regionName,slots:maps.length,documented:maps.filter(m=>m.documented).length,completed:rs.length,results:rs.reduce((a,r)=>(a[r.result]=(a[r.result]||0)+1,a),{}),unexpectedPixels:rs.reduce((s,r)=>s+(r.comparison?.unexpected||0),0),bodyCandidates:rs.filter(r=>r.plan?.parts.length).length};}),
  specialBattle,rendererHashes:[...new Set(records.map(r=>r.rendererSourceHash).filter(Boolean))],reportSourceHashes:{}};
for(const file of ['engine/mana-mod.js','engine/native-effects.js','engine/sprite-layer.js','tools/qa/presentation.mjs']){try{summary.reportSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');}catch{}}
await fs.writeFile(root+'/summary.json',JSON.stringify(summary,null,2));
const css=`*{box-sizing:border-box}body{margin:0;background:#10141d;color:#dfe6f1;font:13px/1.4 system-ui,sans-serif}header{padding:22px 24px;max-width:1220px}h1{font-size:25px;margin:0 0 8px}p{margin:6px 0;color:#a9b7cc}a{color:#acd1ff}nav{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}input,select{font:inherit;background:#1f2938;color:inherit;border:1px solid #53667e;border-radius:4px;padding:7px}main{padding:0 24px 24px}.grid{display:grid;grid-template-columns:repeat(4,256px);gap:16px}.card{border:1px solid #33445b;background:#18202d;width:256px;overflow:hidden}.card img{display:block;width:256px;height:240px;image-rendering:pixelated;background:#000}.card h2{font-size:12px;margin:8px 8px 4px;height:34px;overflow:hidden}.meta{font:11px/1.4 ui-monospace,monospace;color:#a9b7cc;margin:0 8px 8px}.warn{border-color:#e8a64b}.bad{border-color:#f27373}.pending{opacity:.4}.region-title{margin:22px 0 12px;font-size:19px}.count{font-size:14px;color:#a9b7cc}.thumb-link{color:inherit;text-decoration:none}.foot{margin:18px 0 6px;color:#8e9db2;max-width:1080px}.hide{display:none!important}`;
function card(m,base=''){
 const r=byId.get(m.id),bad=r?.comparison?.unexpected>0||r?.result==='error',warning=r&&(r.result!=='captured'||!r.plan?.parts.length),cl=bad?'bad':warning?'warn':r?'':'pending';
 const details=r?`${esc(r.result)} · body ${r.plan?.parts.length??'?'} · OBJ pal ${r.comparison?.palette??'—'}<br>outside Δ ${r.comparison?.unexpected??'?'} · colors ${r.uniqueColors??'?'} · event ${r.status?.event??'?'}`:'Pending';
 return `<article class="card ${cl}" data-search="${esc(`${m.id} ${m.name} ${m.regionName}`.toLowerCase())}" data-result="${esc(r?.result||'pending')}" data-region="${esc(m.region)}"><a class="thumb-link" href="${base}captures/${pad(m.id)}.png">${r&&r.result!=='error'?`<img src="${base}captures/${pad(m.id)}.png" alt="Native map ${m.id}: ${esc(m.name)}">`:'<div style="height:240px;background:#000"></div>'}</a><h2>${pad(m.id)} · ${esc(m.name)}</h2><p class="meta">${details}<br><a href="${base}records/${pad(m.id)}.json">OAM + CGRAM + state</a>${m.exactDataAliasOf!==undefined?` · alias ${pad(m.exactDataAliasOf)}`:''}</p></article>`;
}
const introduction=`<p>Diagnostic entry captures of the original SNES engine, with Goku replacing only the player and intended UI art.</p><p>${records.length}/${catalog.maps.length} map slots attempted; ${total.documentedCompleted}/${total.documented} documented maps captured. Results: ${Object.entries(total.resultCounts).map(([k,v])=>`${k} ${v}`).join(', ')}. ${total.unexpectedPixels} changed pixels outside intended replacement regions. Opening story flags; native full party.</p><p>One entry viewport per slot. Plot variants, full-map traversal, spell animations, boss phases and playability are separate checks. Unused slots and scene-only maps may intentionally be blank, duplicated or redirect.</p>`;
const toc=summary.regions.map(g=>`<a href="#${g.region}">${esc(g.name)} (${g.completed}/${g.slots})</a>`).join(' · ');
const body=groups.map(g=>{const maps=catalog.maps.filter(m=>m.region===g);return `<section id="${g}"><h2 class="region-title">${esc(maps[0].regionName)} <span class="count">${maps.length} slots</span></h2><div class="grid">${maps.map(m=>card(m)).join('')}</div></section>`;}).join('');
await fs.writeFile(root+'/index.html',`<!doctype html><html lang="en"><meta charset="utf-8"><title>Secret of Goku · Native area audit</title><style>${css}</style><header><h1>Native area audit</h1>${introduction}<nav><input id="query" placeholder="Find map / number / region" size="34"><select id="status"><option value="">All results</option><option>captured</option><option>redirected</option><option>invalid-map</option><option>blank</option><option>unexpected-pixels</option><option>error</option><option>pending</option></select><a href="summary.json">Summary JSON</a><a href="catalog.json">ROM catalog</a>${specialBattle?'<a href="special-manabeast/index.html">Native Mana Beast phases</a>':''}</nav><p>${toc}</p></header><main>${body}</main><script>function filter(){const q=document.querySelector('#query').value.toLowerCase(),s=document.querySelector('#status').value;for(const c of document.querySelectorAll('.card'))c.classList.toggle('hide',!c.dataset.search.includes(q)||(s&&c.dataset.result!==s));for(const section of document.querySelectorAll('section'))section.classList.toggle('hide',!section.querySelector('.card:not(.hide)'));}document.querySelector('#query').oninput=filter;document.querySelector('#status').onchange=filter;</script></html>`);
await fs.mkdir(root+'/contact-sheets',{recursive:true});
const sheets=[];
for(const g of groups){
 const maps=catalog.maps.filter(m=>m.region===g&&byId.has(m.id));
 for(let i=0;i<maps.length;i+=20){const chunk=maps.slice(i,i+20),name=`${g}-${String(i/20+1).padStart(2,'0')}`,title=`${chunk[0].regionName} · ${i+1}–${i+chunk.length} of ${maps.length}`;
  await fs.writeFile(root+`/contact-sheets/${name}.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style><header><h1>${esc(title)}</h1><p>Original native map loader · full party · opening flags · diagnostic entry viewports</p></header><main><div class="grid">${chunk.map(m=>card(m,'../')).join('')}</div><p class="foot">Outside Δ compares native and Goku renders from the same state. Body = detected native player OBJ parts. Orange marks a blank/redirected capture or no visible player; these need scene context before being called bugs.</p></main></html>`);sheets.push({name,title,ids:chunk.map(m=>m.id)});
 }
}
await fs.writeFile(root+'/contact-sheets/index.json',JSON.stringify(sheets,null,2));
if(options.screenshots){
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{const page=await browser.newPage({viewport:{width:1120,height:900},deviceScaleFactor:1});for(const s of sheets){await page.goto(pathToFileURL(root+`/contact-sheets/${s.name}.html`).href);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:root+`/contact-sheets/${s.name}.png`,fullPage:true});}await page.close();}finally{await browser.close();}
}
console.log(JSON.stringify({attempted:total.attempted,documentedCompleted:total.documentedCompleted,results:total.resultCounts,unexpectedPixels:total.unexpectedPixels,pageErrors:total.pageErrors.length,regions:summary.regions.length,sheets:sheets.length,index:root+'/index.html'}));
