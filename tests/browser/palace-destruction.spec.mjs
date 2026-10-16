import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(180000);
async function enter(page,map,x,y,flags={}){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({s,map,x,y,flags})=>{
  mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);const m=mana.mod,r=mana.snes.ram,c=mana.snes.cart.data,word=a=>c[a]|c[a+1]<<8;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});m.powerIntro.restore({flight:true,superShown:true});
  const a=0x80000+word(0x87000+map*2),z=0x80000+word(0x87002+map*2),objects=c.slice(a,z),e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2,0],0x8300c);for(let at=a+8;at<z;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=255;}
   for(const[k,v]of Object.entries(flags))r[0xcf00+Number(k)]=v;r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(objects,a);}
  for(let i=1;i<12;i++)r[0xe000+i*512]=0;
  mana.write16(0xe002,x*16+8);mana.write16(0xe004,y*16+8);r[0xe00b]=2;r[0xe006]=r[0xe007]=0;m.localFlightHook.restore();m.teleport.follow({x:x*16+8,y:y*16+8,layer:0,terrain:2});mana.run(65);
  document.querySelector('#native-pause').hidden=true;
 },{s:JSON.parse(readFileSync(fixture)),map,x,y,flags});
}
test('every lit Fire Palace chalice disappears as a complete native object without corrupting floor tiles',async({page},info)=>{
 for(const s of[{map:327,x:9,y:12},{map:327,x:9,y:16},{map:329,x:13,y:19},{map:349,x:11,y:19},{map:240,x:11,y:24}]){
  await enter(page,s.map,s.x+1,s.y+4);
  const result=await page.evaluate(s=>{
   const m=mana.mod,r=mana.snes.ram,p=m.plants,before=r.slice(0x10000,0x18000),rom=mana.hash(mana.snes.cart.data),ids=[];
   for(let i=0;i<6;i++)ids.push(0x10000+(s.y+(i>>1))*128+s.x+(i&1));
   // A glancing hit on the foot still removes the bowl, pedestal and base.
   const queued=p.beam({x:(s.x+1)*16+8,y:(s.y+2)*16+8,dx:1,dy:0,length:1,halfWidth:0,policy:'super-beam'});
   mana.run(14);const saved=mana.snapshot(),effect=m.effects.filter(e=>e.kind==='brazierBurst').map(e=>({key:e.key,life:e.life}));
   mana.run(70);const checkpoint=mana.snapshot(),expected=mana.hash(mana.pixels);mana.restore(saved);mana.run(70);
   const changed=Array.from(before).map((v,i)=>[i+0x10000,v,r[i+0x10000]]).filter(([a,b,c])=>b!==c);
   const ppu=mana.snes.ppu,st=m.status,words=[];
   // Compare the actual visible BG1 tilemap against the native metatile
   // expansion, not merely the collision bytes we asked to change.
   for(const a of ids){const offset=a-0x10000,tx=offset%128,ty=offset>>7;
    for(let i=0;i<4;i++){
     const x=tx*16+(i&1)*8-st.cameraX+ppu.bgHoff[0],y=ty*16+(i>>1)*8-st.cameraY+ppu.bgVoff[0];
     const v=(ppu.tilemapAdr[0]+(((y&255)>>3)*32)+((x&255)>>3)+((x&256)&&ppu.tilemapWider[0]?1024:0)+((y&256)&&ppu.tilemapHigher[0]?(ppu.tilemapWider[0]?2048:1024):0))&32767;
     const source=0x1c000+186*8+i*2;words.push([ppu.vram[v],r[source]|r[source+1]<<8]);
    }
   }
   return{queued:queued.length,ids,changed,effect,tiles:ids.map(a=>r[a]),words,replay:expected===mana.hash(mana.pixels),romUnchanged:rom===mana.hash(mana.snes.cart.data),pending:p.pending,error:m.story.status.error};
  },s);
  writeFileSync(info.outputPath(`chalice-${s.map}-${s.y}.json`),JSON.stringify(result,null,2));
  expect(result.queued,JSON.stringify({s,result})).toBe(6);expect(result.tiles).toEqual(Array(6).fill(186));
  expect(result.changed.map(t=>t[0]).sort((a,b)=>a-b)).toEqual([...result.ids].sort((a,b)=>a-b));
  expect(result.effect).toHaveLength(1);expect(result.words.every(([actual,expected])=>actual===expected),JSON.stringify(result.words)).toBe(true);
  expect(result.replay).toBe(true);expect(result.romUnchanged).toBe(true);expect(result.pending).toBe(0);expect(result.error).toBe(null);
  await page.locator('#screen').screenshot({path:info.outputPath(`chalice-${s.map}-${s.y}.png`)});
 }
});
for(const variant of['normal','super','old-save'])test(`Earth Palace burner restores the native stair passage and return door: ${variant}`,async({page},info)=>{
 await enter(page,312,24,15,{0x1c:variant==='super'?1:0,0x1d:0});
 const result=await page.evaluate(async variant=>{
  const {floorTileEvent}=await import('/engine/native-barriers.js'),m=mana.mod,r=mana.snes.ram,p=m.plants;
  const background=mana.hash(r.slice(0x14000,0x18000)),rom=mana.hash(mana.snes.cart.data),quest=()=>[0x14,0x18,0x91].map(f=>r[0xcf00+f]),before=quest();
  m.options.superSaiyan=variant==='super';
  if(variant==='old-save'){
   // Recreate the former six-blank-tiles result, save it, then let the
   // restored checkpoint repair itself without another shot or flag edit.
   const tick=m.barriers.tick;m.barriers.tick=()=>{};let save;
   try{p.beam({x:392,y:248,dx:0,dy:-1,length:120,policy:'beam'});mana.run(80);save=mana.snapshot();}finally{m.barriers.tick=tick;}
   mana.restore(save);mana.run(180);
  }else{mana.run(1,[4]);mana.run(100,[10,1]);mana.run(1);mana.run(180);}
  const cells=Array.from({length:6},(_,i)=>p.metadata(23+i%2,10+(i>>1),0));
  const opened={tiles:cells.map(t=>t.tile),doors:cells.slice(0,2).map(t=>floorTileEvent(m,t)),flags:[r[0xcf1c],r[0xcf1d]],backgroundUnchanged:background===mana.hash(r.slice(0x14000,0x18000))};
  for(let i=0;i<50&&m.status.map===312;i++)mana.run(4,variant==='super'?[8,4]:[4]);mana.run(240);
  const upstairs=m.status;
  for(let i=0;i<50&&m.status.map===313;i++)mana.run(4,[5]);mana.run(240);
  return{opened,upstairs,returned:m.status,questUnchanged:JSON.stringify(before)===JSON.stringify(quest()),romUnchanged:rom===mana.hash(mana.snes.cart.data),error:m.story.status.error};
 },variant);
 writeFileSync(info.outputPath('stair-passage.json'),JSON.stringify(result,null,2));
 expect(result.opened.doors).toEqual([0x931,0x931]);expect(result.opened.tiles.slice(2)).toEqual([186,186,185,185]);
 expect(result.opened.flags).toEqual([2,2]);expect(result.opened.backgroundUnchanged).toBe(true);
 expect(result.upstairs.map).toBe(313);expect(result.upstairs.canAttack).toBe(true);
 expect(result.returned.map).toBe(312);expect(result.returned.canAttack).toBe(true);
 expect(result.questUnchanged).toBe(true);expect(result.romUnchanged).toBe(true);expect(result.error).toBe(null);
 await page.locator('#screen').screenshot({path:info.outputPath('earth-palace-burner.png')});
});
test('Shade Palace seal opens by beam and its staggered balconies remain flyable without exposing the outer void',async({page},info)=>{
 for(const flag of[0,1]){
  await enter(page,370,22,8,{0x38:flag});
  const result=await page.evaluate(()=>{const m=mana.mod;m.options.superSaiyan=false;mana.run(1,[4]);mana.run(100,[10,1]);mana.run(1);mana.run(180);
   const opened=mana.read8(0xcf38);mana.run(45,[4]);mana.run(180);return{opened,status:m.status,error:m.story.status.error};});
  expect(result.opened).toBe(2);expect(result.status.map).toBe(373);expect(result.error).toBe(null);
 }
 await enter(page,374,26,17,{0x38:2});
 const result=await page.evaluate(()=>{const m=mana.mod,h=m.localFlightHook,before=m.status,grid=mana.hash(mana.snes.ram.slice(0x10000,0x18000));mana.run(25,[8,6]);const left=m.status;mana.run(25,[8,7]);
  return{before,left,back:m.status,seam:h.canFly(24*16+8,23*16+8,0),outside:h.canFly(5*16+8,40*16+8,0),gridUnchanged:grid===mana.hash(mana.snes.ram.slice(0x10000,0x18000)),error:m.story.status.error};});
 expect(result.left.x).toBeLessThan(result.before.x-130);expect(result.back.x).toBeGreaterThan(result.left.x+130);expect(result.seam).toBe(true);expect(result.outside).toBe(false);expect(result.gridUnchanged).toBe(true);expect(result.error).toBe(null);
 await page.locator('#screen').screenshot({path:info.outputPath('shade-palace-flight.png')});
});
