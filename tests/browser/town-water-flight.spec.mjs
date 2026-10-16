import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test('village riverbanks fly both ways while town roofs and the outer treeline stay solid',async({page},info)=>{
 test.setTimeout(180000);test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const results=[];
 for(const map of[63,144,168,228,89]){
  const result=await page.evaluate(({s,map})=>{
   mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);const m=mana.mod,r=mana.snes.ram,c=mana.snes.cart.data,w=a=>c[a]|c[a+1]<<8;
   Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});m.powerIntro.restore({flight:true,superShown:true});
   const a=0x80000+w(0x87000+map*2),z=0x80000+w(0x87002+map*2),o=c.slice(a,z),e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
   try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,41,40,0],0x8300c);c[0x8300d]=40+(map>>8);for(let at=a+8;at<z;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=255;}
    if(map===89)r[0xcf3a]=1;r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);
   }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(o,a);}
   for(let i=1;i<12;i++)r[0xe000+i*512]=0;
   const h=m.localFlightHook,{width,height}=h.bounds(),candidates=[],walls=[];
   // Verified shore art in the village and snow/desert town sets. Pick a
   // real inner bank with clear tiles on both sides, excluding transitions.
   const ids=map===89||map===228?[82,90,91,94,88,89]:[90,89,81,82,83,85,88,91,94];
   for(let y=2;y<height/16-2;y++)for(let x=2;x<width/16-2;x++){
    const t=h.tileAt(x*16+8,y*16+8,0);if(!t||t.code||t.behavior&0xd0||t.flags&8)continue;
    if((t.flags&7)===3&&!ids.includes(t.tile))walls.push(!h.canFly(x*16+8,y*16+8,0));
    if(!ids.includes(t.tile))continue;
    for(const[dx,dy]of[[1,0],[0,1]]){
     const shores=[-1,1].map(sign=>h.tileAt((x+dx*sign)*16+8,(y+dy*sign)*16+8,0));
     if(shores.every(t=>t&&!(t.flags&8)&&!(t.behavior&0xd0)&&(t.flags&7)<3&&t.code===0))candidates.push({x,y,dx,dy,id:t.tile});
    }
   }
   const chosen=map===63?{x:18,y:22,dx:1,dy:0,id:90}:candidates[0];if(!chosen)return{map,error:'No bounded riverbank found',candidates};
   const q=chosen,x=(q.x+q.dx)*16+8,y=(q.y+q.dy)*16+8;mana.write16(0xe002,x);mana.write16(0xe004,y);r[0xe00b]=2;r[0xe006]=r[0xe007]=0;m.localFlightHook.restore();m.teleport.follow({x,y,layer:0,terrain:2});mana.run(60);
   const before=m.status,grid=mana.hash(r.slice(0x10000,0x18000)),flags=Array.from(r.slice(0xcf00,0xd000));mana.run(8,[8,q.dx?6:4]);const across=m.status;mana.run(8,[8,q.dx?7:5]);
   return{map,chosen,candidates:candidates.length,banks:candidates.map(q=>h.canFly(q.x*16+8,q.y*16+8,0)),before,across,back:m.status,solidWalls:walls.filter(Boolean).length,wallCount:walls.length,edge:h.canFly(4,4,0),gridUnchanged:grid===mana.hash(r.slice(0x10000,0x18000)),error:m.story.status.error};
  },{s:JSON.parse(readFileSync(fixture)),map});
  results.push(result);writeFileSync(info.outputPath('towns.json'),JSON.stringify(results,null,2));
  expect(result.error,JSON.stringify(result)).toBe(null);expect(result.banks.every(Boolean),JSON.stringify(result)).toBe(true);
  expect(Math.hypot(result.across.x-result.before.x,result.across.y-result.before.y)).toBeGreaterThanOrEqual(32);
  expect(Math.hypot(result.back.x-result.before.x,result.back.y-result.before.y)).toBeLessThan(10);
  expect(result.solidWalls).toBeGreaterThan(50);expect(result.edge).toBe(false);expect(result.gridUnchanged).toBe(true);
  await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:info.outputPath(`riverbank-${map}.png`)});
 }
});
