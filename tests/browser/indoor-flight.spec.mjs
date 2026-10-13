import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

test('Water Palace, houses, inns and shops allow roof exits without a ground-sprite flash',async({page})=>{
  test.setTimeout(150000);const path='.local/graphics-audit/party.json';
  test.skip(!existsSync(path)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>mana.ready);
  const seed=JSON.parse(readFileSync(path));
  // Actual cartridge doors, including both Water Palace NPC maps and
  // interiors on each collision layer. No room or story flags are patched.
  for(const[door,map,outside]of[[9,137,136],[151,139,136],[88,257,131],[92,259,131],[250,293,25],[596,282,224],[650,125,113]]){
    const entry=await page.evaluate(({seed,door})=>{
      mana.pause();seed.romHash=mana.hash(mana.snes.cart.data);mana.restore(seed);
      Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);
      mana.mod.story.travel(door);mana.run(240);
      for(let i=0;i<20&&!mana.mod.canAttack;i++){mana.run(2,[16]);mana.run(120);}
      return mana.mod.status;
    },{seed,door});
    expect(entry).toMatchObject({map,canAttack:true});
    const result=await page.evaluate(()=>{
      const m=mana.mod;mana.fly();mana.run(28);
      const burst={pose:m.spriteLayer.plan?.sprite?.kind,holes:m.ceiling.status.holes},saved=mana.snapshot();
      mana.run(12);const pixels=mana.hash(mana.pixels);mana.restore(saved);mana.run(12);const replay=mana.hash(mana.pixels)===pixels;
      let flashes=0;
      for(let i=0;i<1000&&!m.worldFlight;i++){
        mana.run(1);const e=m.ceiling.status.escape,pose=m.spriteLayer.plan?.sprite;
        if(e&&e.phase!=='punch'&&!m.worldFlight&&!mana.snes.ppu.forcedBlank&&pose&&pose.y>=0)flashes++;
      }
      mana.run(100);
      return{burst,replay,flashes,s:m.status,ceiling:m.ceiling.status,party:m.entities().slice(0,3).map(e=>e.active),story:m.story.status.error,flight:m.flight.error};
    });
    expect(result.burst).toEqual({pose:'ceilingEscape',holes:1});expect(result.replay).toBe(true);expect(result.flashes).toBe(0);
    expect(result.s).toMatchObject({map:outside,worldFlight:true});expect(result.ceiling).toMatchObject({completed:1,holes:1,error:null});
    expect(result.party).toEqual([true,true,true]);expect(result.story).toBe(null);expect(result.flight).toBe(null);
  }
  expect(errors).toEqual([]);
});
