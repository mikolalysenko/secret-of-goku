import{test,expect}from'@playwright/test';import{existsSync,readFileSync}from'node:fs';
const party='.local/graphics-audit/party.json',field='.local/animation-audit/native/rabite-field-a.json';
async function load(page,fixture=party){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private native fixtures required.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(fixture)));
}
test('native level-up announcements never remap punch or ki, and modal level/status pages still own confirmation',async({page})=>{
 test.setTimeout(120000);await load(page,field);
 const level=await page.evaluate(()=>{
  const m=mana.mod,r=mana.snes.ram;r[0xe18d]=255;r[0xe18e]=0;mana.write16(0xe7f1,999);r[0xe7ec]=r[0xe7f0]=0;
  const initial=r[0xe181];let banner=0,rings=0,punches=0,blasts=0;
  for(let f=0;f<420;f++){mana.run(1,f%48<8?[0]:f%48>=24&&f%48<32?[1]:[]);if(r[0x2c]&&m.nativeField){banner++;if(m.action?.kind==='punch')punches++;if(m.action?.kind==='blast')blasts++;}if(r[0xec]&12||r[0xed]&64)rings++;}
  return{initial,level:r[0xe181],banner,rings,punches,blasts,canAttack:m.canAttack};
 });expect(level.level).toBeGreaterThan(level.initial);expect(level.banner).toBeGreaterThan(10);expect(level.rings).toBe(0);expect(level.punches).toBeGreaterThan(0);expect(level.blasts).toBeGreaterThan(0);expect(level.canAttack).toBe(true);
 await load(page);
 const pages=await page.evaluate(()=>{const state=mana.snapshot(),out=[];for(const turns of[1,2,3,5]){mana.restore(state);mana.run(2,[9]);mana.run(70);for(let i=0;i<turns;i++){mana.run(2,[7]);mana.run(50);}mana.run(2,[0]);mana.run(90);const during={canAttack:mana.mod.canAttack,field:mana.mod.nativeField};mana.run(6,[1]);const noKi=mana.mod.action===null;mana.run(4,[9]);mana.run(90);if(mana.read8(0xec)&12){mana.run(4,[9]);mana.run(90);}mana.run(30);mana.run(2,[1]);out.push({turns,during,noKi,after:mana.mod.status});}return out;});
 for(const p of pages){expect(p.during,JSON.stringify(p)).toEqual({canAttack:false,field:false});expect(p.noKi).toBe(true);expect(p.after.action,JSON.stringify(p)).toBe('blast');}
});

test('native in-game saves survive reload and GAME FILE loads them',async({page})=>{
 test.setTimeout(120000);await load(page);
 const saved=await page.evaluate(()=>{const c=mana.snes.cart.data,r=mana.snes.ram,old=c.slice(0x742b0,0x742b3);try{c.set([0x10,0x50,0],0x742b0);r.set([1,0xb0,0x42,0xc7],0xd0);mana.run(180);for(let i=0;i<5;i++){mana.run(2,[0]);mana.run(100);}return{battery:mana.battery.status,bytes:[...mana.snes.cart.sram]};}finally{c.set(old,0x742b0);}});
 expect(saved.battery.saves).toBeGreaterThan(0);expect(saved.battery.dirty).toBe(false);
 const confirmation=await page.evaluate(()=>{const c=mana.snes.cart.data,r=mana.snes.ram,old=c.slice(0x742b0,0x742b3);try{c.set([0x1f,6,0],0x742b0);r.set([1,0xb0,0x42,0xc7],0xd0);mana.run(180);mana.run(2,[0]);mana.run(120);return{mode:mana.snes.ppu.mode,panel:r[0x2c],sprite:mana.mod.spriteLayer.plan?.sprite,hidden:mana.mod.spriteLayer.plan?.hidden.size};}finally{c.set(old,0x742b0);}});
 expect(confirmation.mode).toBe(5);expect(confirmation.panel).toBe(0);expect(confirmation.sprite?.sheet).toBe('goku');expect(confirmation.hidden).toBe(8);
 await page.locator('#screen').screenshot({path:test.info().outputPath('save-confirmation-goku.png')});
 await page.reload();await page.waitForFunction(()=>mana.ready);
 const loaded=await page.evaluate(()=>{mana.pause();const same=[...mana.snes.cart.sram];mana.run(960);mana.run(2,[3]);mana.run(180);mana.run(2,[5]);mana.run(60);mana.run(2,[0]);mana.run(180);return{same,mode:mana.snes.ppu.mode,png:document.querySelector('#screen').toDataURL()};});
 expect(loaded.same).toEqual(saved.bytes);expect(loaded.mode).toBe(5);
 expect(await page.evaluate(()=>mana.mod.spriteLayer.saveFaces)).toBe(1);
 await page.locator('#screen').screenshot({path:test.info().outputPath('game-file.png')});
 const playing=await page.evaluate(()=>{mana.run(4,[0]);mana.run(360);return mana.mod.status;});expect(playing.map).toBe(131);expect(playing.canAttack).toBe(true);
});

test('Goku has no weapon tier; companions can swap real weapons but cannot equip sword dust',async({page})=>{
 await load(page);const result=await page.evaluate(()=>{const m=mana.mod,r=mana.snes.ram,state=mana.snapshot(),tiers=[];
 mana.run(2,[9]);mana.run(60);for(let i=0;i<5;i++){tiers.push(r[0x1809]);mana.run(2,[4]);mana.run(60);}
 const trial=direction=>{mana.restore(state);mana.run(2,[2]);mana.run(60);mana.run(2,[9]);mana.run(60);for(let i=0;i<6&&r[0x1809]!==3;i++){mana.run(2,[4]);mana.run(60);}const before=[r[0xe1e3],r[0xe3e3],r[0xe5e3]],rejected=m.equipment.rejected;mana.run(3,[direction]);mana.run(60);const dust=[...m.spriteLayer.plan.portraits.values()].some(p=>p.kind==='dust');mana.run(3,[0]);mana.run(50);mana.run(3,[0]);mana.run(90);return{before,after:[r[0xe1e3],r[0xe3e3],r[0xe5e3]],dust,rejected:m.equipment.rejected-rejected};};
 return{tiers,dust:trial(6),real:trial(7)};
 });expect(result.tiers).not.toContain(3);expect(result.dust.dust).toBe(true);expect(result.dust.rejected).toBeGreaterThan(0);expect(result.dust.after).toEqual(result.dust.before);expect(result.real.after).not.toEqual(result.real.before);expect(result.real.rejected).toBe(0);
});

test('a native spell announcement never redirects ki to a ring and attacks recover after casting',async({page})=>{
 test.setTimeout(120000);await load(page);
 const result=await page.evaluate(()=>{
  const m=mana.mod,s=mana.snes,r=s.ram,c=s.cart.data;r[0xe386]=r[0xe387]=99;r.fill(0,0xe3c8,0xe3d0);r[0xe3cf]=0x38;r.fill(0x33,0xe3c4,0xe3c8);
  // Diagnostic target permission only: execute the actual cartridge spell
  // and its shared battle-name window with Goku receiving controller input.
  const target=c[0x1034d8];c[0x1034d8]=0;
  try{mana.run(120);mana.run(4,[2]);mana.run(90);mana.run(4,[9]);mana.run(90);for(let i=0;i<4&&r[0x1809]!==1;i++){mana.run(4,[4]);mana.run(60);}mana.run(4,[0]);mana.run(90);mana.run(4,[6]);mana.run(90);mana.run(4,[0]);mana.run(90);mana.run(4,[0]);mana.run(12);
   r[0xd9]=1;r[0xe02c]=1;r[0xe22c]=r[0xe42c]=0;let banners=0,rings=0,punches=0,blasts=0;
   for(let f=0;f<600;f++){mana.run(1,f%40<8?[1]:f%40>=20&&f%40<28?[0]:[]);if(r[0x2c]&&m.nativeField)banners++;if(r[0xec]&12||r[0xed]&64)rings++;if(m.action?.kind==='punch')punches++;if(m.action?.kind==='blast')blasts++;}
   mana.run(30);return{banners,rings,punches,blasts,mp:r[0xe386],canAttack:m.canAttack};
  }finally{c[0x1034d8]=target;}
 });expect(result.banners).toBeGreaterThan(0);expect(result.mp).toBeLessThan(99);expect(result.rings).toBe(0);expect(result.punches).toBeGreaterThan(0);expect(result.blasts).toBeGreaterThan(0);expect(result.canAttack).toBe(true);
});
