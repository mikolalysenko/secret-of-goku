// Private all-map destruction-pipeline audit. Controller regressions separately
// check aiming and input; this feeds every placed physical obstacle through the
// same native redraw queue to exercise both layers and all replacement stages.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {readOptions,loadAuditRom,loadCatalog,openAuditPage} from './area-catalog.mjs';
const options=readOptions(),rom=await loadAuditRom(options),catalog=await loadCatalog(options);
const inventory=JSON.parse(await fs.readFile(options.out+'/barriers.json'));
const maps=inventory.maps.filter(m=>m.classification==='gameplay'&&(m.destructibles.length||m.header.tileset16===7)&&(!options.selected.length||options.selected.includes(m.id)));
const jobs=maps.flatMap(m=>{
 const map=catalog.maps[m.id],flags=new Map();
 for(const d of m.destructibles)for(const t of d.tiles){const v=t.visibility;if(v.flag&&(v.min>0||v.max<15)){const values=flags.get(v.flag)??new Set([0]);values.add(v.min);flags.set(v.flag,values);}}
 let states=[{}];for(const[f,values]of flags)states=states.flatMap(s=>[...values].map(v=>({...s,[f]:v})));
 return states.map(flags=>({map,flags}));
});
const key=j=>JSON.stringify([j.map?.id??j.id,j.flags]);
const previous=options.retry?JSON.parse(await fs.readFile(options.out+'/destruction-summary.json')).maps:[];
const wanted=new Set(jobs.map(key)),results=previous.filter(r=>r.result==='checked'&&r.romUnchanged&&wanted.has(key(r))),finished=new Set(results.map(key)),pendingJobs=jobs.filter(j=>!finished.has(key(j)));
const baseline=JSON.parse(await fs.readFile(options.state)),browser=await chromium.launch({channel:'chrome',headless:true});let next=0;
async function worker(){
 const {page,errors}=await openAuditPage(browser,options,rom);
 try{while(next<pendingJobs.length){const job=pendingJobs[next++];let result;
  try{result=await page.evaluate(async({baseline,map,flags})=>{
   const m=mana.mod,c=mana.snes.cart.data,r=mana.snes.ram,hash=mana.hash(c),e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010),word=a=>c[a]|c[a+1]<<8;
   const start=0x80000+word(0x87000+map.id*2),end=0x80000+word(0x87002+map.id*2),objects=c.slice(start,end);
   baseline.romHash=hash;mana.restore(baseline);Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});
   for(const[f,v]of Object.entries(flags))mana.write8(0xcf00+Number(f),v);
   try{c.set([4,24,3,5,0],0x742b0);c.set([map.id&255,map.entry.x*2+(map.id>>8),map.entry.y*2+(map.entry.collisionLayer===2?1:0),0],0x8300c);
    // Hide hostile spawns before entry so a pending enemy spell cannot
    // retain its effect lock after the environmental fixture removes actors.
    for(let at=start+8;at<end;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=255;}
    r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);
   }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(objects,start);}
   for(let i=0;i<60&&!m.canAttack;i++){mana.run(20,[11]);if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));}
   if(m.status.map!==map.id||!m.canAttack)return{id:map.id,flags,result:'entry-not-ready',status:m.status,error:m.story.status.error};
   // Isolate scenery redraw from enemy spells/contact. No enemy/boss defeat
   // flags are asserted or credited by this environmental-only audit.
   for(let i=3;i<12;i++)r[0xe000+i*512]=0;
   const h=m.localFlightHook,{width,height}=h.bounds(),unsupported=[],all=[];let floor=null;
   const placed=[new Uint8Array(16384),new Uint8Array(16384)];
   for(const p of map.pieces){const v=p.visibility,value=r[0xcf00+v.flag];if(v.flag&&(value<v.min||value>v.max))continue;
    for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++)placed[p.layer==='foreground'?1:0][y*128+x]=1;
   }
   for(let layer=0;layer<2;layer++)for(let ty=0;ty<height/16;ty++)for(let tx=0;tx<width/16;tx++){
    if(!placed[layer][ty*128+tx])continue; // Unused BG buffers may hold boss graphics, not scenery.
    const t=m.plants.metadata(tx,ty,layer),decor=h.breakScenery(t),isC=(t.code&240)===192;
    if(isC||decor!==null){if(!m.plants.eligible(t,'objects')&&decor===null)unsupported.push(t);else all.push(t);}
    if(!floor&&layer===(r[0xe00b]&128?1:0)&&tx>2&&ty>2&&!(t.behavior&128)&&h.canLand(tx*16+8,ty*16+8,layer,t.flags&3))floor={x:tx*16+8,y:ty*16+8,terrain:layer*128+(t.flags&3)};
   }
   if(floor){mana.write16(0xe002,floor.x);mana.write16(0xe004,floor.y);r[0xe00b]=floor.terrain;m.teleport.follow(floor);mana.run(25);}
   for(let n=0;n<20&&(!m.canAttack||m.teleport.pending);n++)mana.run(10);
   let passes=0,changed=0,remaining=all.slice(),stalled=false;
   while(remaining.length&&passes++<40){
    const batch=m.plants.enqueueTiles(remaining.slice(0,128),{policy:'objects'});if(!batch.length){stalled=true;break;}
    for(let n=0;n<9;n++){mana.run(10);if(!m.plants.pending)break;}await new Promise(resolve=>setTimeout(resolve,0));
    const pending=remaining.map(t=>m.plants.metadata(t.tx,t.ty,t.layer));changed+=remaining.filter((t,i)=>t.tile!==pending[i].tile).length;
    remaining=pending.filter(t=>m.plants.eligible(t,'objects')||h.breakScenery(t)!==null);
   }
   const solid=all.map(t=>m.plants.metadata(t.tx,t.ty,t.layer)).filter(t=>(t.flags&7)===3||t.flags&8);
   return{id:map.id,name:map.name,flags,result:!unsupported.length&&!remaining.length&&!solid.length&&m.status.map===map.id?'checked':'failed',objects:all.length,blocking:all.filter(t=>(t.flags&7)===3).length,changed,passes,stalled,unsupported,remaining,solid,status:m.status,error:m.story.status.error,romUnchanged:hash===mana.hash(c)};
  },{baseline:structuredClone(baseline),...job});}catch(error){result={id:job.map.id,flags:job.flags,result:'error',error:error.stack};}
  results.push(result);if(results.length%10===0||result.result!=='checked')console.log(JSON.stringify({done:results.length,total:jobs.length,id:result.id,result:result.result,objects:result.objects,remaining:result.remaining?.length,solid:result.solid?.length}));
 }}finally{await page.close();if(errors.length)console.log(JSON.stringify({pageErrors:errors}));}
}
try{await Promise.all(Array.from({length:Math.min(options.workers,pendingJobs.length)},worker));}finally{await browser.close();}
const report={coverage:'Every named gameplay map with native C-prefix obstacles or Haunted Forest vines, plus each conditional physical-object layout. Live queue, staged replacements, original collision and native redraw. Enemy actors hidden after entry to isolate scenery. Controller aiming, switches, orbs, doors and story traversal are separate tests.',counts:results.reduce((a,r)=>(a[r.result]=(a[r.result]??0)+1,a),{}),maps:results.sort((a,b)=>a.id-b.id)};
await fs.writeFile(options.out+'/destruction-summary.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.counts));
if(results.some(r=>r.result!=='checked'||!r.romUnchanged))process.exitCode=1;
