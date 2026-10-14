// Private controller audit: load every dungeon through the native dispatcher,
// fly an actual bounded gap and fire/traverse a wall breach in each room.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {dungeonGroups,dungeonSpecialScenes} from '../../engine/dungeon-geometry.js';
import {readOptions,loadAuditRom,loadCatalog,openAuditPage} from './area-catalog.mjs';
const options=readOptions(),rom=await loadAuditRom(options),catalog=await loadCatalog(options);
const maps=[...new Set(dungeonGroups.flatMap(d=>d.maps))].filter(id=>!options.selected.length||options.selected.includes(id)).map(id=>catalog.maps[id]);
const baseline=JSON.parse(await fs.readFile(options.state)),browser=await chromium.launch({channel:'chrome',headless:true});let next=0;const results=[];
await fs.mkdir(options.out+'/rooms',{recursive:true});
async function worker(){
 const{page,errors}=await openAuditPage(browser,options,rom);
 try{while(next<maps.length){const map=maps[next++];let result;
  try{result=await page.evaluate(async({baseline,map,special})=>{
   const m=mana.mod,c=mana.snes.cart.data,r=mana.snes.ram,hash=mana.hash(c),word=a=>c[a]|c[a+1]<<8,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
   const start=0x80000+word(0x87000+map.id*2),end=0x80000+word(0x87002+map.id*2),objects=c.slice(start,end);
   baseline.romHash=hash;mana.restore(baseline);Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});m.powerIntro.restore({flight:true,superShown:true});
   try{
    c.set([4,24,3,5,0],0x742b0);c.set([map.id&255,map.entry.x*2+(map.id>>8),map.entry.y*2+(map.entry.collisionLayer===2?1:0),0],0x8300c);
    for(let at=start+8;at<end;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=255;}
    r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);
   }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(objects,start);}
   for(let n=0;n<40&&!m.canAttack;n++){mana.run(30,[11]);if(n%10===0)await new Promise(resolve=>setTimeout(resolve,0));}
   if(m.status.map!==map.id||!m.canAttack)return{id:map.id,name:map.name,result:'entry-sequence',status:m.status,error:m.story.status.error};
   const h=m.localFlightHook,g=h.dungeon,context=g.context();if(!context)return{id:map.id,name:map.name,result:special?'checked':'no-dungeon-profile',protected:special,romUnchanged:hash===mana.hash(c)};
   const routes={flight:new Map(),wall:new Map()},outside=[],protectedBefore=[],geometry=[];
   const key=p=>p.ends.map(t=>`${t.layer}:${t.tx},${t.ty}`).sort().join('/');
   for(let layer=0;layer<2;layer++)for(let ty=1;ty<context.height-1;ty++)for(let tx=1;tx<context.width-1;tx++){
    const t=g.tile(tx,ty,layer);if(!t)continue;
    if(t.flags&8||t.behavior&0xd0||t.code>=0x80)protectedBefore.push([t.address,t.tile]);
    for(const[kind,path]of[['flight',g.airRoute(t)],['wall',g.breach(t)]])if(path)routes[kind].set(key(path),path);
   }
   for(let layer=0;layer<2;layer++)for(const[x,y]of[[0,8],[context.width*16,8],[8,0],[8,context.height*16]])if(h.canFly(x,y,layer))outside.push({x,y,layer});
   // Environmental tests isolate native scenery from hostile spell animation.
   for(let i=3;i<12;i++)r[0xe000+i*512]=0;
   const saved=mana.snapshot();
   async function place(t){
    mana.write16(0xe002,t.tx*16+8);mana.write16(0xe004,t.ty*16+8);r[0xe00b]=t.layer*128+(t.flags&3);r[0xe006]=r[0xe007]=0;m.localFlight=false;m.localLift=0;m.cancelCombat();h.restore();
    m.teleport.follow({x:t.tx*16+8,y:t.ty*16+8,layer:t.layer,terrain:r[0xe00b]});mana.run(35);for(let i=0;i<15&&m.teleport.pending;i++)mana.run(10);
   }
   const standable=t=>h.canLand(t.tx*16+8,t.ty*16+8,t.layer,t.flags&3);
   const candidates=kind=>[...routes[kind].values()].filter(p=>p.ends.every(standable)).sort((a,b)=>b.cells.length-a.cells.length);
   const cross=async(to,fly)=>{
    const x=to.tx*16+8,y=to.ty*16+8,positions=[],initial=m.status;
    let stalled=0,last='';
    for(let n=0;n<500;n++){
     const s=m.status,dx=x-s.x,dy=y-s.y;if(s.map!==map.id||!s.canAttack)return{ok:false,reason:'scene',status:s,positions};
     if(Math.abs(dx)<=3&&Math.abs(dy)<=3){mana.run(8);return{ok:standable(to),status:m.status,positions};}
     const button=Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4;
     mana.run(1,fly&&Math.max(Math.abs(dx),Math.abs(dy))>20?[8,button]:[button]);const position=`${m.status.x},${m.status.y}`;stalled=position===last?stalled+1:0;last=position;
     if(n%20===0)positions.push([m.status.x,m.status.y]);if(stalled>25)return{ok:false,reason:'stalled',initial,status:m.status,positions};
     if(n%100===99)await new Promise(resolve=>setTimeout(resolve,0));
    }return{ok:false,reason:'timeout',initial,status:m.status,positions};
   };
   const trials={},layoutChanges=[];
   for(const kind of['flight','wall']){
    for(let retry=0;retry<3;retry++){
    const list=candidates(kind);let path=null,attempts=[];
    for(const candidate of list){
     if(kind==='flight'&&!candidate.cells.every(t=>h.canFly(t.tx*16+8,t.ty*16+8,t.layer)))continue;
     mana.restore(saved);await place(candidate.ends[0]);
     if(!m.canAttack){attempts.push({ends:candidate.ends.map(t=>[t.tx,t.ty]),event:mana.read8(0xd0)});continue;}
     path=candidate;break;
    }
    if(!path){trials[kind]={candidates:routes[kind].size,standable:list.length,reason:'no standable crossing',attempts};break;}
    const begin=m.status,layout=g.context().signature;
    if(kind==='wall'){
     const a=path.ends[0],b=path.ends[1],button=b.tx>a.tx?7:b.tx<a.tx?6:b.ty>a.ty?5:4;
     mana.run(1,[button]);mana.run(52,[10,1]);mana.run(1);mana.run(125);
     for(let n=0;n<40&&!m.canAttack&&m.status.map===map.id;n++){mana.run(30,[11]);if(n%10===0)await new Promise(resolve=>setTimeout(resolve,0));}
     const damaged=path.cells.filter(t=>mana.read8(t.address)!==t.tile).length;
     if(g.context()?.signature!==layout&&damaged<path.cells.length){
      // A hit switch can remove the destination platform while rebuilding
      // the room. The old tunnel must not be forced through that new layout.
      // Record the native transition, then test a route in its actual result.
      layoutChanges.push({kind,route:path.ends,damaged,total:path.cells.length,from:layout,to:g.context()?.signature});
      routes.wall.clear();const ctx=g.context();
      if(ctx)for(let layer=0;layer<2;layer++)for(let y=1;y<ctx.height-1;y++)for(let x=1;x<ctx.width-1;x++){
       const t=g.tile(x,y,layer),p=t&&g.breach(t);if(p)routes.wall.set(key(p),p);
      }
      Object.assign(saved,mana.snapshot());continue;
     }
     // Native switches may legitimately replace trigger cells. Only edits
     // actually submitted as wall demolition must avoid those addresses.
     const scriptEdits=m.plants.completed.flatMap(c=>c.tiles.filter(t=>t.demolition&&protectedBefore.some(([a])=>a===t.address)));
     trials.wall={candidates:routes.wall.size,begin,route:path.ends,damaged,total:path.cells.length,scriptEdits,after:m.status,attempts};
    }else trials.flight={candidates:routes.flight.size,begin,route:path.ends};
    trials[kind].forward=await cross(path.ends[1],kind==='flight');trials[kind].backward=trials[kind].forward.ok?await cross(path.ends[0],kind==='flight'):null;
    trials[kind].error=m.story.status.error;
    break;
    }
    if(!trials[kind])trials[kind]={error:'Native layout did not stabilize after three attempts'};
   }
   const failed=outside.length||Object.values(trials).some(t=>t.forward&&(!t.forward.ok||!t.backward?.ok)||t.scriptEdits?.length||t.error);
   return{id:map.id,name:map.name,result:failed?'failed':'checked',counts:{flight:routes.flight.size,wall:routes.wall.size},trials,layoutChanges,outside,romUnchanged:hash===mana.hash(c)};
  },{baseline:structuredClone(baseline),map,special:dungeonSpecialScenes.get(map.id)});}catch(error){result={id:map.id,name:map.name,result:'error',error:error.stack};}
  if(options.screenshots){await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:options.out+`/rooms/${map.id}.png`});}
  await fs.writeFile(options.out+`/rooms/${map.id}.json`,JSON.stringify(result));results.push(result);
  console.log(JSON.stringify({done:results.length,total:maps.length,id:map.id,result:result.result,flight:result.counts?.flight,walls:result.counts?.wall}));
 }}finally{await page.close();if(errors.length)console.log(JSON.stringify({pageErrors:errors}));}
}
try{await Promise.all(Array.from({length:Math.min(options.workers,maps.length)},worker));}finally{await browser.close();}
const summary={coverage:'Native room entry and two-way controller traversal of the longest standable flight gap and wall breach per dungeon room. Hostile spawns suppressed for environmental isolation; puzzle/seed and boss events have separate regressions.',counts:results.reduce((s,r)=>(s[r.result]=(s[r.result]??0)+1,s),{}),rooms:results};
await fs.writeFile(options.out+'/runtime.json',JSON.stringify(summary));console.log(JSON.stringify(summary.counts));if(results.some(r=>r.result!=='checked'||r.romUnchanged===false))process.exitCode=1;
