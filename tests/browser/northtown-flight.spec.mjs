import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
async function enter(page,map,x,y,stage=0){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({state,map,x,y,stage})=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);const m=mana.mod,r=mana.snes.ram,c=mana.snes.cart.data,w=a=>c[a]|c[a+1]<<8;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});m.powerIntro.restore({flight:true,superShown:true});r[0xe200]=r[0xe400]=0;
  const a=0x80000+w(0x87000+map*2),z=0x80000+w(0x87002+map*2),o=c.slice(a,z),e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2+1,0],0x8300c);for(let at=a+8;at<z;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=255;}
   r[0xcf2d]=stage;r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(o,a);}
  m.localFlightHook.restore();document.querySelector('#native-pause').hidden=true;
 },{state:JSON.parse(readFileSync(fixture)),map,x,y,stage});
}
for(const scene of[
 {name:'upper spike fan',map:403,a:[13,43],b:[13,38],barrier:[13,41]},
 {name:'sunken pit',map:403,a:[27,63],b:[43,63],barrier:[34,63]},
 {name:'long spike row',map:404,a:[27,55],b:[27,50],barrier:[27,53]},
 {name:'spike maze shortcut',map:404,a:[29,63],b:[33,63],barrier:[31,63]},
])test(`Northtown ${scene.name} flies both ways while walking stays blocked`,async({page},info)=>{
 test.setTimeout(120000);await enter(page,scene.map,...scene.a);
 const result=await page.evaluate(scene=>{
  const m=mana.mod,h=m.localFlightHook,r=mana.snes.ram,a=scene.a.map(v=>v*16+8),b=scene.b.map(v=>v*16+8),barrier=scene.barrier.map(v=>v*16+8);
  const terrain=h.tileAt(...a,1).flags&3;mana.write16(0xe002,a[0]);mana.write16(0xe004,a[1]);r[0xe00b]=128|terrain;m.teleport.follow({x:a[0],y:a[1],layer:1,terrain:128|terrain});mana.run(60);
  const base=mana.snapshot(),grid=mana.hash(r.slice(0x10000,0x18000)),flags=Array.from(r.slice(0xcf00,0xd000));
  const towards=(x,y)=>Math.abs(x-m.status.x)>Math.abs(y-m.status.y)?x>m.status.x?7:6:y>m.status.y?5:4;
  mana.run(45,[towards(...b)]);const walking=m.status;mana.restore(base);
  const cross=to=>{for(let i=0;i<140;i++){const dx=to[0]-m.status.x,dy=to[1]-m.status.y;if(Math.abs(dx)<=3&&Math.abs(dy)<=3)break;mana.run(1,[...(Math.max(Math.abs(dx),Math.abs(dy))>20?[8]:[]),towards(...to)]);}mana.run(10);return m.status;};
  const forward=cross(b),backward=cross(a);
  const outer=[h.canFly(8,8,1),h.canFly(47*16+8,63*16+8,1)];
  return{a,b,walking,forward,backward,fly:h.canFly(...barrier,1),land:h.canLand(...barrier,1,terrain),gridUnchanged:grid===mana.hash(r.slice(0x10000,0x18000)),flagsUnchanged:flags.every((v,i)=>v===r[0xcf00+i]),outer,error:m.story.status.error};
 },scene);writeFileSync(info.outputPath('crossing.json'),JSON.stringify(result,null,2));
 const distance=(p,q)=>Math.hypot(p.x-q[0],p.y-q[1]);
 expect(distance(result.walking,result.b)).toBeGreaterThan(20);expect(result.fly).toBe(true);expect(result.land).toBe(false);
 expect(distance(result.forward,result.b),JSON.stringify(result)).toBeLessThan(6);expect(distance(result.backward,result.a),JSON.stringify(result)).toBeLessThan(6);
 expect(result.forward.hp).toBe(999);expect(result.backward.hp).toBe(999);expect(result.gridUnchanged).toBe(true);expect(result.flagsUnchanged).toBe(true);expect(result.outer).toEqual([false,false]);expect(result.error).toBe(null);
 await page.locator('#screen').screenshot({path:info.outputPath('crossing.png')});
});
for(const map of[403,404])for(const stage of[0,1,2,3])test(`Northtown map ${map} stage ${stage}: every spike cell stays flyable without erasing puzzle tiles`,async({page},info)=>{
 test.setTimeout(120000);await enter(page,map,38,38,stage);
 const result=await page.evaluate(()=>{
  const h=mana.mod.localFlightHook,g=h.dungeon,c=g.context(),spikes=[],walls=[];
  for(let y=1;y<c.height-1;y++)for(let x=1;x<c.width-1;x++){
   const t=g.tile(x,y,1);if(!t)continue;
   if(t.tile===127)spikes.push({x,y,fly:h.canFly(x*16+8,y*16+8,1),land:h.canLand(x*16+8,y*16+8,1)});
   if([94,9,22,24].includes(t.tile))walls.push(h.canFly(x*16+8,y*16+8,1));
  }
  return{spikes,blockedWalls:walls.filter(v=>!v).length,stage:mana.read8(0xcf2d),error:mana.mod.story.status.error};
 });writeFileSync(info.outputPath('spikes.json'),JSON.stringify(result,null,2));
 // The original switches remove the fan at stage 1 and the maze at stage 3.
 expect(result.spikes.length).toBe(map===403?(stage===0?24:0):(stage<3?72:0));expect(result.spikes.filter(t=>!t.fly),JSON.stringify(result)).toEqual([]);expect(result.spikes.some(t=>t.land)).toBe(false);expect(result.blockedWalls).toBeGreaterThan(100);expect(result.stage).toBe(stage);expect(result.error).toBe(null);
});
