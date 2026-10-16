import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

test('normal and Super Saiyan push native walls without sliding, then release or walk away',async({page},testInfo)=>{
  const fixture='.local/graphics-audit/party.json';
  test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the native Potos fixture and user-supplied cartridge.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
  const base=JSON.parse(readFileSync(fixture,'utf8'));
  for(const superSaiyan of [false,true])for(const direction of [4,7]){
    const result=await page.evaluate(({base,superSaiyan,direction})=>{
      mana.pause();base.romHash=mana.hash(mana.snes.cart.data);mana.restore(base);
      const m=mana.mod;Object.assign(m.options,{enabled:true,power:true,superSaiyan});
      for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
      mana.run(4);mana.run(direction===4?120:40,[direction]);
      const origin=[m.status.x,m.status.y],poses=new Set(),pivots=new Set(),screens={};let drift=0;
      for(let i=0;i<90;i++){
        mana.run(1,[direction]);const p=m.spriteLayer.plan?.sprite;
        if(p?.kind!=='push')throw Error(`Blocked input became ${p?.kind}`);
        if(p.sheet!==(superSaiyan?'ssj':'goku')||p.row!==(direction===4?3:2))throw Error('Push changed form or facing');
        poses.add(p.nudge);pivots.add(`${p.x},${p.y}`);
        drift=Math.max(drift,Math.hypot(m.status.x-origin[0],m.status.y-origin[1]));
        screens[p.nudge]??=document.querySelector('#screen').toDataURL();
      }
      mana.run(6);const released=m.spriteLayer.plan.sprite;
      mana.run(6,[direction===4?5:6]);const walking=m.spriteLayer.plan.sprite;
      return{poses:[...poses],pivots:pivots.size,drift,released,walking,screens,
        travelled:Math.hypot(m.status.x-origin[0],m.status.y-origin[1])};
    },{base,superSaiyan,direction});
    expect(result.poses.sort()).toEqual([0,1,2,3]);expect(result.pivots).toBe(1);expect(result.drift).toBe(0);
    expect(result.released.kind).toBe('idle');expect(result.released.nudge).toBeUndefined();
    expect(result.walking.kind).toBe('walk');expect(result.travelled).toBeGreaterThan(0);
    for(const [phase,png]of Object.entries(result.screens))writeFileSync(testInfo.outputPath(`${superSaiyan?'ssj':'base'}-${direction}-${phase}.png`),Buffer.from(png.split(',')[1],'base64'));
  }
  expect(errors).toEqual([]);
});

test('pushing a real Rabite uses the compact push in base and Super Saiyan, including the native contact brace',async({page},testInfo)=>{
 const fixture='.local/animation-audit/native/rabite-field-a.json';
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private Rabite field fixture required.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const nativeContacts=new Set();
 for(const superSaiyan of[false,true]){
  const result=await page.evaluate(({state,superSaiyan})=>{
   mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);const m=mana.mod;Object.assign(m.options,{enabled:true,power:true,superSaiyan});
   for(let i=1;i<12;i++)if(i!==3)mana.write8(0xe000+i*512,0);mana.run(3);
   const frames=[],screens={},steps=new Set();let direction=7;
   for(let frame=0;frame<240;frame++){
    const hero=m.status,enemy=m.entities()[3],dx=enemy.x-hero.x,dy=enemy.y-hero.y;
    if(frame%6===0)direction=Math.abs(dx)>Math.abs(dy)?dx<0?6:7:dy<0?4:5;
    mana.run(1,[direction]);const p=m.spriteLayer.plan?.sprite,native=(m.ownership.ppuOwners.find(o=>o?.base===0xe000&&o.kind==='body')?.native.latchedAnimation??0)&0x7f;
    if([8,17].includes(native))frames.push({kind:p?.kind,native,sheet:p?.sheet});
    if(p?.kind==='push'){if(p.legs!==null&&p.legs!==undefined)steps.add(p.legs);screens[p.nudge]??=document.querySelector('#screen').toDataURL();}
   }
   mana.run(8);return{frames,steps:[...steps],screens,released:m.spriteLayer.plan.sprite.kind};
  },{state:JSON.parse(readFileSync(fixture)),superSaiyan});
  expect(result.frames.length).toBeGreaterThan(150);for(const f of result.frames)nativeContacts.add(f.native);
  expect(result.frames.filter(f=>f.kind==='push').length).toBeGreaterThan(150);
  for(const frame of result.frames){expect(['push','walk','idle']).toContain(frame.kind);expect(frame.sheet).toBe(superSaiyan?'ssj':'goku');}
  expect(result.steps.sort()).toEqual([2,3,4,5]);expect(result.released).not.toBe('push');
  for(const [phase,png]of Object.entries(result.screens))writeFileSync(testInfo.outputPath(`enemy-${superSaiyan?'ssj':'base'}-${phase}.png`),Buffer.from(png.split(',')[1],'base64'));
 }
 expect([...nativeContacts].sort((a,b)=>a-b)).toEqual([8,17]);
});
