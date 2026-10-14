import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

// All native sword/axe scenery tilesets, both collision layers, and the
// multi-stage Fortress/Undersea pillars. Scripted gates have separate tests.
for(const scene of[{map:16},{map:17},{map:27},{map:28},{map:73},{map:128},{map:199},{map:248},{map:248,rebuild:true},{map:295,layer:1},{map:432,layer:1},{map:433,layer:1,flags:{64:2}}])test(`one punch or Kamehameha clears each axe/sword obstacle family on map ${scene.map}${scene.rebuild?' with a simultaneous switch rebuild':''}`,async({page},testInfo)=>{
 test.setTimeout(240000);
 test.skip(!existsSync('.local/graphics-audit/party.json')||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});},JSON.parse(readFileSync('.local/graphics-audit/party.json')));
 await page.evaluate(scene=>{
  const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010),word=a=>c[a]|c[a+1]<<8;
  const start=0x80000+word(0x87000+scene.map*2),end=0x80000+word(0x87002+scene.map*2),objects=c.slice(start,end);
  try{
   c.set([4,24,3,5,0],0x742b0);c.set([scene.map&255,16+(scene.map>>8),16+(scene.layer??0),0],0x8300c);
   for(let at=start+8;at<end;at+=8)if(c[at+5]<0x80){c[at]=0;c[at+1]=0xff;}
   for(const[k,v]of Object.entries(scene.flags??{}))mana.write8(0xcf00+Number(k),v);
   mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(objects,start);}
 },scene);
 const cases=await page.evaluate(scene=>{
  const m=mana.mod,h=m.localFlightHook,layer=scene.layer??0,{width,height}=h.bounds(),families=new Map();
  for(let ty=1;ty<height/16-1;ty++)for(let tx=1;tx<width/16-1;tx++){
   if(scene.rebuild&&(tx!==66||ty!==18))continue;
   const tile=m.plants.metadata(tx,ty,layer);if(!m.plants.eligible(tile,'objects'))continue;
   const chain=[tile.tile];let next=tile.replacement;
   while(chain.length<16){chain.push(next);const d=0x1b800+layer*0x400+next*4;if((mana.read8(d+2)&240)!==192)break;next=mana.read8(d+3);}
   const key=[tile.flags,tile.behavior,tile.code,chain.length,mana.read8(0x1b800+layer*0x400+chain.at(-1)*4)].join(':');if(families.get(key)?.start)continue;
   let start=null;
   for(const[dx,dy,button]of[[0,-1,4],[0,1,5],[-1,0,6],[1,0,7]])for(const distance of[28,24,32,20,16]){
    const x=tx*16+8-dx*distance,y=ty*16+8-dy*distance,t=h.tileAt(x,y,layer),terrain=t?.flags&3;
    if(!h.canLand(x,y,layer,terrain))continue;
    let safe=true;for(const ox of[-10,0,10])for(const oy of[-10,0,10]){const p=h.tileAt(x+ox,y+oy,layer);if(!p||p.behavior&0xd0||p.code>=0x10&&p.code<=0x17||(p.code&0xf0)===0xf0)safe=false;}
    if(safe){start={x,y,terrain:terrain+layer*128,layer,button};break;}
   }
   if(scene.rebuild)start={x:1064,y:324,layer:0,terrain:2,button:4};
   families.set(key,{key,tile,chain,start});
  }
  return[...families.values()];
 },scene);
 expect(cases.length).toBeGreaterThan(0);expect(cases.filter(c=>!c.start),'Each family needs a real attack approach').toEqual([]);
 const baseline=await page.evaluate(()=>mana.snapshot()),results=[];
 for(const candidate of cases)for(const punch of[true,false]){
  await page.evaluate(s=>mana.restore(s),baseline);
  results.push(await page.evaluate(({candidate,punch})=>{
   const m=mana.mod,h=m.localFlightHook,{start,tile,chain}=candidate,hash=mana.hash(mana.snes.cart.data);
   mana.write16(0xe002,start.x);mana.write16(0xe004,start.y);mana.write8(0xe00b,start.terrain);m.teleport.follow(start);
   for(let n=0;n<30;n++){mana.run(10);if(!m.teleport.pending&&m.canAttack)break;}
   mana.run(3,[start.button]);const before=m.plants.metadata(tile.tx,tile.ty,tile.layer),attackStart={...m.status,facing:m.facing,nativeFacing:mana.read8(0xe010),terrain:mana.read8(0xe00b),blocked:m.attackBlocked};m.plants.restore();
   if(punch){mana.run(2,[0]);mana.run(45);}else{mana.run(100,[10,1]);mana.run(1);mana.run(90);}
   for(let n=0;n<12&&!m.canAttack;n++)mana.run(60,[11]);mana.run(20);
   const after=m.plants.metadata(tile.tx,tile.ty,tile.layer);
   return{punch,candidate,before,after,attackStart,expected:chain.at(-1),canAttack:m.canAttack,map:m.status.map,error:m.story.status.error,cuts:m.plants.completed,barriers:m.barriers.status,romUnchanged:hash===mana.hash(mana.snes.cart.data)};
  },{candidate,punch}));
 }
 await testInfo.attach('obstacle-strikes',{body:JSON.stringify(results,null,2),contentType:'application/json'});
 writeFileSync(testInfo.outputPath('obstacle-strikes.json'),JSON.stringify(results,null,2));
 for(const r of results){const detail=JSON.stringify(r);expect(r.before.tile,detail).toBe(r.candidate.tile.tile);expect(r.after.tile,detail).toBe(r.expected);expect(r.after.flags&7,detail).not.toBe(3);expect(r.canAttack,detail).toBe(true);expect(r.map).toBe(scene.map);expect(r.error).toBe(null);expect(r.romUnchanged).toBe(true);
  if(scene.rebuild&&!r.punch){expect(r.barriers.completed.length,detail).toBeGreaterThan(0);expect(r.cuts.some(c=>c.replayed),detail).toBe(true);}
 }
});
