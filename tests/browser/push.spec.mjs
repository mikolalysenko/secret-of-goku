import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

test('normal and Super Saiyan nudge native walls without sliding, then release or walk away',async({page},testInfo)=>{
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
    expect(result.poses.sort()).toEqual([0,1,2]);expect(result.pivots).toBe(1);expect(result.drift).toBe(0);
    expect(result.released.kind).toBe('idle');expect(result.released.nudge).toBeUndefined();
    expect(result.walking.kind).toBe('walk');expect(result.travelled).toBeGreaterThan(0);
    for(const [phase,png]of Object.entries(result.screens))writeFileSync(testInfo.outputPath(`${superSaiyan?'ssj':'base'}-${direction}-${phase}.png`),Buffer.from(png.split(',')[1],'base64'));
  }
  expect(errors).toEqual([]);
});
