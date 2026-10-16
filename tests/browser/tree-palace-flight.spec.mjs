import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
async function enter(page,map,x,y,flags={}){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({s,map,x,y,flags})=>{
  mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);const m=mana.mod,r=mana.snes.ram,c=mana.snes.cart.data,w=a=>c[a]|c[a+1]<<8;
  Object.assign(m.options,{enabled:true,power:true});m.powerIntro.restore({flight:true,superShown:true});r[0xe200]=r[0xe400]=0;
  const a=0x80000+w(0x87000+map*2),z=0x80000+w(0x87002+map*2),o=c.slice(a,z),e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2,0],0x8300c);for(let at=a+8;at<z;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=255;}
   for(const[k,v]of Object.entries(flags))r[0xcf00+Number(k)]=v;r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(o,a);}
  m.localFlightHook.restore();document.querySelector('#native-pause').hidden=true;
 },{s:JSON.parse(readFileSync(fixture)),map,x,y,flags});
}
test('Tree Palace low terrace flies both ways without opening its tall walls',async({page},info)=>{
 test.setTimeout(120000);await enter(page,430,25,32,{0x44:2});
 const result=await page.evaluate(()=>{const m=mana.mod,r=mana.snes.ram,h=m.localFlightHook;
  mana.write16(0xe002,408);mana.write16(0xe004,520);r[0xe00b]=1;m.teleport.follow({x:408,y:520,layer:0,terrain:1});mana.run(60);
  const grid=mana.hash(r.slice(0x10000,0x18000)),before=m.status;mana.run(10,[8,4]);const across=m.status;mana.run(10,[8,5]);
  return{before,across,back:m.status,lip:h.canFly(408,488,0),outer:h.canFly(8,8,0),gridUnchanged:grid===mana.hash(r.slice(0x10000,0x18000)),error:m.story.status.error};
 });writeFileSync(info.outputPath('tree-lip.json'),JSON.stringify(result,null,2));
 expect(result.lip).toBe(true);expect(result.across.y).toBeLessThan(480);expect(result.back.y).toBeGreaterThan(512);expect(result.outer).toBe(false);expect(result.gridUnchanged).toBe(true);expect(result.error).toBe(null);
 await page.locator('#screen').screenshot({path:info.outputPath('tree-lip.png')});
});
test('Tree Palace flowers are flyable and Jema waits on dry land, including old checkpoints',async({page},info)=>{
 test.setTimeout(120000);await enter(page,195,28,49,{0x41:2});
 const result=await page.evaluate(()=>{const m=mana.mod,r=mana.snes.ram,h=m.localFlightHook,c=mana.snes.cart.data,at=0x80000+(c[0x87186]|c[0x87187]<<8),flags=c[at+2],flowers=[],roofs=[];
  for(let y=1;y<63;y++)for(let x=1;x<63;x++){const t=h.tileAt(x*16+8,y*16+8,0);if(t?.tile!==185)continue;const bg=r[0x14000+y*128+x]+((flags&128)?192:0);([250,251,252].includes(bg)?flowers:roofs).push({x,y,bg,fly:h.canFly(x*16+8,y*16+8,0)});}
  const j=()=>m.entities().find(e=>e.active&&e.species===160&&(mana.read16(e.base+0x3e)&0x7ff)===0x4ac),initial=j();
  // Restore the exact old wandering state, then let the field adapter repair it.
  mana.write16(initial.base+2,452);mana.write16(initial.base+4,820);r[initial.base+0x44]&=127;mana.run(2);const repaired=j();mana.run(600);const after=j();
  const q=flowers.find(q=>[-1,1].every(dy=>h.canFly(q.x*16+8,(q.y+dy)*16+8,0)));if(!q)throw Error('Missing bounded flower route');
  const x=q.x*16+8,y=(q.y+1)*16+8;mana.write16(0xe002,x);mana.write16(0xe004,y);r[0xe006]=r[0xe007]=0;r[0xe00b]=2;m.teleport.follow({x,y,layer:0,terrain:2});mana.run(60);const before=m.status;mana.run(8,[8,4]);const across=m.status;mana.run(8,[8,5]);
  return{flowers,roofs,initial,repaired,after,before,across,back:m.status,error:m.story.status.error};
 });writeFileSync(info.outputPath('tree-exterior.json'),JSON.stringify(result,null,2));
 expect(result.flowers.length).toBeGreaterThan(10);expect(result.flowers.every(t=>t.fly)).toBe(true);expect(result.roofs.filter(t=>!t.fly).length).toBeGreaterThan(10);
 for(const j of[result.initial,result.repaired,result.after])expect([j.x,j.y]).toEqual([452,756]);
 expect(result.across.y).toBeLessThan(result.before.y-30);expect(Math.abs(result.back.y-result.before.y)).toBeLessThan(10);expect(result.error).toBe(null);
 await page.locator('#screen').screenshot({path:info.outputPath('tree-exterior.png')});
});
