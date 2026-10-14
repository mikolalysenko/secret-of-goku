import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
// Pad/post coordinates independently enumerated from the retail event table
// and map pieces. Includes both parallel lanes and the vertical crossings.
const routes=[
 {"map":17,"name":"jehk dungeon","pads":[[68,38,-1,0],[64,39,1,0]]},
 {"map":30,"name":"witchforest c","pads":[[28,8,1,0],[32,9,-1,0]]},
 {"map":62,"name":"jehkcave exterior","pads":[[37,31,-1,0],[33,32,1,0],[31,37,-1,0],[27,38,1,0],[21,42,-1,0],[17,43,1,0]]},
 {"map":248,"name":"manafort interior a","pads":[[57,14,1,0],[61,15,-1,0],[48,32,0,1],[54,32,0,1],[49,36,0,-1],[55,36,0,-1],[64,66,1,0],[68,67,-1,0],[27,85,0,1],[28,89,0,-1]]},
 {"map":249,"name":"manafort interior b","pads":[[10,13,1,0],[14,14,-1,0],[15,19,1,0],[19,20,-1,0],[12,33,-1,0],[8,34,1,0],[19,37,-1,0],[15,38,1,0],[35,60,0,1],[36,64,0,-1]]},
 {"map":250,"name":"manafort interior c","pads":[[89,19,-1,0],[85,20,1,0]]},
 {"map":313,"name":"earthpalace interior b","pads":[[17,37,-1,0],[13,38,1,0]]},
 {"map":322,"name":"matangocave c","pads":[[21,27,-1,0],[17,28,1,0]]},
 {"map":323,"name":"matangocave d","pads":[[36,16,-1,0],[32,17,1,0]]},
 {"map":330,"name":"firepalace e","pads":[[42,10,-1,0],[37,11,1,0]]},
 {"map":362,"name":"icecastle interior j","pads":[[10,10,1,0],[16,10,1,0],[14,11,-1,0],[20,11,-1,0]]},
 {"map":370,"name":"shadepalace interior d","pads":[[16,10,-1,0],[12,11,1,0]]},
 {"map":414,"name":"grandpalace interior c","pads":[[23,22,0,1],[22,26,0,-1],[21,27,-1,0],[28,27,-1,0]]},
 {"map":417,"name":"grandpalace interior f","pads":[[15,24,0,1],[32,24,0,1],[14,28,0,-1],[33,28,0,-1],[18,30,0,1],[29,30,0,1],[19,34,0,-1],[28,34,0,-1]]}
];

for(const scene of routes)test(`local flight crosses every whip route in ${scene.name} (${scene.map})`,async({page},testInfo)=>{
 test.setTimeout(240000);
 test.skip(!existsSync('.local/graphics-audit/party.json')||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.mod.powerIntro.restore({flight:true,superSaiyan:true});mana.mod.radio.restore({firstFlight:true});},JSON.parse(readFileSync('.local/graphics-audit/party.json')));
 await page.evaluate(scene=>{
  const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010),word=a=>c[a]|c[a+1]<<8;
  const start=0x80000+word(0x87000+scene.map*2),end=0x80000+word(0x87002+scene.map*2),objects=c.slice(start,end),[x,y,dx,dy]=scene.pads[0];
  try{
   c.set([4,24,3,5,0],0x742b0);c.set([scene.map&255,(x-dx)*2+(scene.map>>8),(y-dy)*2,0],0x8300c);
   for(let at=start+8;at<end;at+=8)if(c[at+5]<0x80){c[at]=0;c[at+1]=0xff;}
   mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(objects,start);}
 },scene);
 const baseline=await page.evaluate(()=>mana.snapshot()),results=[];
 for(const pad of scene.pads){
  await page.evaluate(s=>mana.restore(s),baseline);
  results.push(await page.evaluate(([x,y,dx,dy])=>{
   const m=mana.mod,h=m.localFlightHook,hash=mana.hash(mana.snes.cart.data),start={x:(x-dx)*16+8,y:(y-dy)*16+8,layer:0},target={x:(x+dx*5)*16+8,y:(y+dy*5)*16+8};
   const terrain=h.tileAt(start.x,start.y,0).flags&3;mana.write16(0xe002,start.x);mana.write16(0xe004,start.y);mana.write8(0xe00b,terrain);m.teleport.follow({...start,terrain});
   for(let n=0;n<30;n++){mana.run(10);if(!m.teleport.pending&&m.canAttack)break;}
   const crossings=m.gapFlight.crossings,walk=(dest,vx,vy)=>{
    let maxEvent=0,hovered=false,frames=0,poses=new Set();
    while(frames++<100){
     const s=m.status,remaining=(dest.x-s.x)*vx+(dest.y-s.y)*vy;if(remaining<=0)break;
     mana.run(1,[...(remaining>16?[8]:[]),vx?vx>0?7:6:vy>0?5:4]);maxEvent=Math.max(maxEvent,m.read8(0xd0));hovered||=m.localFlight;poses.add(m.spriteLayer.plan?.sprite?.kind);
    }
    mana.run(12);const status=m.status;
    return{frames,maxEvent,hovered,poses:[...poses],status,land:h.canLand(status.x,status.y),party:[0xe200,0xe400].filter(a=>mana.read8(a)&1).map(a=>({x:mana.read16(a+2),y:mana.read16(a+4),terrain:mana.read8(a+11)}))};
   };
   const across=walk(target,dx,dy),back=walk(start,-dx,-dy);
   return{pad:[x,y,dx,dy],start,target,across,back,crossings:m.gapFlight.crossings-crossings,flags:[mana.read8(0xcf01),mana.read8(0xcf03)],error:m.story.status.error,romUnchanged:hash===mana.hash(mana.snes.cart.data)};
  },pad));
 }
 await testInfo.attach('crossings',{body:JSON.stringify(results,null,2),contentType:'application/json'});
 writeFileSync(testInfo.outputPath('crossings.json'),JSON.stringify(results,null,2));
 await page.locator('#screen').screenshot({path:testInfo.outputPath('landing.png')});
 for(const result of results){
  const context=JSON.stringify(result);expect(result.crossings,context).toBe(0);expect(result.flags,context).toEqual([0,0]);expect(result.error).toBe(null);expect(result.romUnchanged).toBe(true);
  for(const [crossing,destination]of[[result.across,result.target],[result.back,result.start]]){
   expect(crossing.maxEvent,context).toBe(0);expect(crossing.status.map,context).toBe(scene.map);expect(crossing.frames,context).toBeLessThan(100);expect(crossing.status.canAttack,context).toBe(true);expect(crossing.land,context).toBe(true);expect(crossing.hovered,context).toBe(true);
   expect(Math.hypot(crossing.status.x-destination.x,crossing.status.y-destination.y),context).toBeLessThan(14);
   expect(crossing.status.screenX,context).toBeGreaterThan(8);expect(crossing.status.screenX,context).toBeLessThan(248);expect(crossing.status.screenY,context).toBeGreaterThan(8);expect(crossing.status.screenY,context).toBeLessThan(216);
   for(const p of crossing.party)expect(Math.hypot(p.x-crossing.status.x,p.y-crossing.status.y),context).toBeLessThan(64);
  }
 }
});
