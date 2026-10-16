import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(120000);
for(const [condition,bit]of[['petrification',0x40],['sleep',0x10],['Frosty',0x20],['Balloon',0x100],['burning',0x4000]])test(`Focus breaks native ${condition} and repeated applications cannot stun lock Goku`,async({page},info)=>{
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const disabled=await page.evaluate(({s,bit})=>{
  mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);const m=mana.mod;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});mana.write8(0xe200,0);mana.write8(0xe400,0);mana.run(4);
  mana.write16(0xe190,bit);mana.run(90);
  return{can:m.canAttack,status:mana.read16(0xe190),owner:mana.read8(0xe02c),hp:mana.read16(0xe182)};
 },{s:JSON.parse(readFileSync(fixture)),bit});
 expect(disabled.can).toBe(false);expect(disabled.status&bit).toBe(bit);if(bit===0x40)expect(disabled.owner&1).toBe(0);
 const result=await page.evaluate(bit=>{
  const m=mana.mod;mana.run(1,[10]);const cleared=mana.read16(0xe190);let waited=0;
  while((!m.canAttack||m.statusRecovery?.pending)&&waited++<90)mana.run(1,[10]);
  const recovered={can:m.canAttack,owner:mana.read8(0xe02c),gold:m.options.superSaiyan,burst:m.effects.some(e=>e.kind==='statusBurst'),shell:m.effects.find(e=>e.kind==='statusBurst')?.shell,waited};
  let fire=null;
  if(bit===0x4000){
   const draw=m.kiArt.combustion,kinds=new Set(),xs=[],ys=[];
   m.kiArt.combustion=function(kind,frame,x,y,put,options){
    kinds.add(kind);return draw.call(this,kind,frame,x,y,(px,py,c)=>{xs.push(px);ys.push(py);put(px,py,c);},options);
   };
   try{mana.run(10,[10]);}finally{m.kiArt.combustion=draw;}
   document.querySelector('#native-pause').hidden=true;
   fire={kinds:[...kinds],pixels:xs.length,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),image:document.querySelector('#screen').toDataURL()};
  }
  const start=m.status.x,errors=[];
  // Inject the same native status repeatedly while normal movement runs.
  for(let i=0;i<60;i++){mana.write16(0xe190,bit);mana.run(1,[7]);if(!m.canAttack||mana.read16(0xe190)&bit)errors.push(i);}
  const moved=m.status.x-start;mana.run(4);mana.run(3,[0]);const punch=m.action?.kind;mana.run(24);
  mana.run(45,[10,1]);const charged=m.charging&&m.charge>0;mana.run(1);const beam=m.effects.some(e=>e.kind==='beam');
  document.querySelector('#native-pause').hidden=true;
  return{cleared,recovered,fire,errors,moved,punch,charged,beam,status:mana.read16(0xe190)};
 },bit);
 expect(result.cleared&bit).toBe(0);expect(result.recovered.can).toBe(true);expect(result.recovered.owner&1).toBe(1);expect(result.recovered.burst).toBe(true);
 if(bit===0x10)expect(result.recovered.gold).toBe(false);
 if(bit===0x4000){
  expect(result.recovered.shell).toBe('fire');expect(result.fire.kinds).toEqual(expect.arrayContaining(['burst','ember']));
  expect(result.fire.pixels).toBeGreaterThan(100);expect(result.fire.width).toBeGreaterThan(32);expect(result.fire.height).toBeGreaterThan(32);
  writeFileSync(info.outputPath('burning-power-out.png'),Buffer.from(result.fire.image.split(',')[1],'base64'));
 }
 expect(result.errors).toEqual([]);expect(result.moved).toBeGreaterThan(12);expect(result.punch).toBe('punch');expect(result.charged).toBe(true);expect(result.beam).toBe(true);expect(result.status&bit).toBe(0);
 await page.locator('#screen').screenshot({path:info.outputPath(`${condition}-recovered.png`)});
});
