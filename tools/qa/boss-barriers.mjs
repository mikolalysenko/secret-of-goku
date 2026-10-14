// Private combat/exit QA. Native doors load each arena, real controller inputs
// kill its boss, and the original defeat event owns rewards and progression.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {readOptions,loadAuditRom,loadCatalog,openAuditPage} from './area-catalog.mjs';

const options=readOptions(),rom=await loadAuditRom(options),catalog=await loadCatalog(options);
const baseline=JSON.parse(await fs.readFile(options.state));
// Native stages immediately before each fight. The three Jabberwocky routes
// have separate defeat events. Final battles have their own full-story tests.
const stages={46:{71:2},60:{33:2},79:{38:1},100:{53:5},111:{55:1},119:{55:4},
 143:{17:13,80:1},166:{26:5},204:{70:0},213:{70:2},226:{70:4},230:{70:1},231:{70:3},232:{70:5},
 237:{68:7},238:{69:1},244:{78:1},260:{16:6},277:{169:0},290:{20:3},310:{23:5},317:{27:3},
 325:{36:4},340:{40:11},347:{44:2},361:{37:0,38:2,86:4},364:{38:3},377:{52:3},407:{45:3},
 408:{45:7},418:{68:5},430:{68:1},434:{64:2},488:{78:3},489:{173:0},495:{24:5}};
const victories={46:[71,3],60:[33,3],79:[38,2],100:[53,7],111:[55,4],119:[55,7],
 143:[80,2],166:[26,7],204:[70,1],213:[70,3],226:[70,5],230:[70,2],231:[70,4],232:[70,6],
 237:[68,9],238:[69,2],244:[78,2],260:[16,9],277:[169,1],290:[20,4],310:[23,6],317:[27,5],
 325:[36,5],340:[40,12],347:[44,3],361:[86,5],364:[38,6],377:[52,4],407:[45,4],
 408:[45,8],418:[68,6],430:[68,2],434:[64,4],488:[78,4],489:[173,1],495:[24,6]};
const jobs=Object.entries(stages).filter(([id])=>!options.selected.length||options.selected.includes(Number(id)))
 .flatMap(([id,flags])=>(Number(id)===143?[1,2,3].map(n=>({...flags,80:n})):[flags]).map(flags=>({map:catalog.maps[Number(id)],flags,victory:Number(id)===143?[80,0]:victories[id]})));
await fs.mkdir(options.out+'/bosses',{recursive:true});
const results=[],pendingJobs=[],jobKey=job=>`${job.map.id}-${job.flags[80]??0}`;
for(const job of jobs){
 let prior=null;if(options.retry)try{prior=JSON.parse(await fs.readFile(options.out+`/bosses/${jobKey(job)}.json`));}catch(error){if(error.code!=='ENOENT')throw error;}
 const progress=prior?.combat?.flags?.[job.victory[0]],won=job.victory[1]===0?progress===0:progress>=job.victory[1];
 if(prior?.result==='checked'&&prior.romUnchanged&&prior.combat?.victory&&won&&!prior.pageErrors?.length&&JSON.stringify(prior.flags)===JSON.stringify(job.flags))results.push(prior);else pendingJobs.push(job);
}
const browser=await chromium.launch({headless:true,channel:'chrome'});let next=0;
async function worker(){
 const {page,errors}=await openAuditPage(browser,options,rom);
 try{while(next<pendingJobs.length){
  const job=pendingJobs[next++],key=jobKey(job),record={id:job.map.id,name:job.map.name,flags:job.flags};
  try{
   record.entry=await page.evaluate(({baseline,map,flags})=>{
    const m=mana.mod,c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010),hash=mana.hash(c);
    baseline.romHash=hash;mana.restore(baseline);Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});m.powerIntro.restore({flight:true,superSaiyan:true});
    mana.write8(0xe200,0);mana.write8(0xe400,0);for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);
    try{c.set([4,24,3,5,0],0x742b0);const {x,y,collisionLayer}=map.entry;c.set([map.id&255,x*2+(map.id>>8),y*2+(collisionLayer===2?1:0),0],0x8300c);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}finally{c.set(e,0x742b0);c.set(d,0x8300c);}
    return{status:m.status,flags:[...mana.snes.ram.slice(0xcf00,0xd000)],bosses:m.entities().filter(e=>e.active&&e.species>=87&&e.species<128),hash};
   },{baseline:structuredClone(baseline),...job});
   record.combat=await page.evaluate(async({map,flags,victory})=>{
    const m=mana.mod,word=a=>mana.read16(a),seen=new Set(),events=new Set(),hits=[];let attempts=0,defeated=false;
    const bosses=()=>m.entities().filter(e=>e.active&&e.species>=87&&e.species<128&&e.hp&&!(mana.read8(e.base+0x191)&128));
    const won=()=>victory[1]===0?mana.read8(0xcf00+victory[0])===0:mana.read8(0xcf00+victory[0])>=victory[1];
    for(let n=0;n<180;n++){
     const targets=bosses();targets.forEach(e=>seen.add(e.species));events.add(m.story.status.lastEvent);
     if(m.canAttack&&targets.length&&attempts<18){
      let target=targets[0];
      if(attempts>1&&Math.hypot(target.x-m.status.x,target.y-m.status.y)>180){
       mana.run(2,[10,0]);mana.run(35);for(let t=0;t<24&&m.teleport.pending;t++)mana.run(10);
       target=m.entities()[target.index];
      }
      const dx=target.x-m.status.x,dy=target.y-m.status.y;mana.run(3,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);
      const before=bosses();mana.run(m.options.superSaiyan?60:105,[10,1]);mana.run(1);mana.run(100,[11]);
      hits.push({before,after:bosses(),map:m.status.map});attempts++;
     }else{
      mana.run(90,[11]);
      if(mana.fastForward.state(0x800).choice){mana.run(90);mana.run(5,[0]);mana.run(20);}
     }
     if(seen.size&&!bosses().length)defeated=true;
     if(defeated&&won()&&(m.canAttack||m.worldFlight))break;
     if(!seen.size&&m.canAttack&&n>12||attempts>=18&&m.canAttack)break;
     if(n%5===0)await new Promise(r=>setTimeout(r,0));
    }
    const after=[...mana.snes.ram.slice(0xcf00,0xd000)];
    return{seen:[...seen],events:[...events],attempts,defeated,victory:won(),hits,status:m.status,flags:after,error:m.story.status.error,pc:word(0xd1)|(mana.read8(0xd3)<<16),hash:mana.hash(mana.snes.cart.data)};
   },job);
   const r=record.combat;record.progress=r.flags.flatMap((v,i)=>v!==record.entry.flags[i]&&i!==10?[{flag:i,before:record.entry.flags[i],after:v}]:[]);
   record.romUnchanged=record.entry.hash===r.hash;
   record.result=r.error?'script-error':!r.seen.length?'absent':!r.defeated?'alive':!(r.status.canAttack||r.status.worldFlight)?'locked':!r.victory?'no-progress':'checked';
   const png=await page.evaluate(()=>document.querySelector('#screen').toDataURL());
   await fs.writeFile(options.out+`/bosses/${key}.png`,Buffer.from(png.split(',')[1],'base64'));
   if(record.result!=='checked')await fs.writeFile(options.out+`/bosses/${key}-state.json`,JSON.stringify(await page.evaluate(()=>mana.snapshot())));
  }catch(error){record.result='error';record.error=error.stack;}
  record.pageErrors=[...errors];results.push(record);await fs.writeFile(options.out+`/bosses/${key}.json`,JSON.stringify(record,null,2));
  console.log(JSON.stringify({id:record.id,name:record.name,result:record.result,attempts:record.combat?.attempts,seen:record.combat?.seen,map:record.combat?.status.map,progress:record.progress,done:results.length,total:jobs.length}));
 }}finally{await page.close();}
}
try{await Promise.all(Array.from({length:Math.min(options.workers,pendingJobs.length)},worker));}finally{await browser.close();}
const report={coverage:'Native boss arena entry and solo controller defeat through return of control. Does not yet traverse each opened exit. Final bosses are covered by the separate story-shortcut regressions.',counts:results.reduce((a,r)=>(a[r.result]=(a[r.result]??0)+1,a),{}),maps:results.sort((a,b)=>a.id-b.id)};
await fs.writeFile(options.out+'/boss-summary.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.counts));
if(results.some(r=>r.result!=='checked'||!r.romUnchanged||r.pageErrors.length))process.exitCode=1;
