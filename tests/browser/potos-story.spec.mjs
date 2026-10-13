import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';

test('Potos accuses Goku, he deliberately hops after Elliott, and rescue leads to banishment',async({page})=>{
  test.setTimeout(180000);
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the local US cartridge.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/engine.html');await page.getByRole('button',{name:'START IN POTOS'}).click();await page.waitForFunction(()=>window.mana?.ready);
  const result=await page.evaluate(async()=>{
    mana.pause();const hash=mana.hash(mana.snes.cart.data),poses=[],events=new Set();let hopReplay=null;
    const step=(frames,buttons=[])=>{for(let f=0;f<frames;f++){
      mana.run(1,buttons);events.add(mana.mod.story.status.lastEvent);
      if(mana.read16(0xdc)===131&&mana.read8(0xcf10)===6){
        const native=mana.read8(0xe011),kind=mana.mod.spriteLayer.plan?.sprite?.kind;
        if(poses.at(-1)?.native!==native||poses.at(-1)?.kind!==kind)poses.push({native,kind});
        if(native===0xa1&&hopReplay===null){
          const middle=mana.snapshot();mana.run(6);const pixels=mana.hash(mana.pixels);mana.restore(middle);mana.run(6);hopReplay=mana.hash(mana.pixels)===pixels;
        }
      }
    }};
    const dismiss=async predicate=>{for(let n=0;n<100&&!predicate();n++){step(2,[16]);step(110);if(n%8===0)await new Promise(r=>setTimeout(r,0));}return predicate();};
    step(130,[4]);step(22,[7]);step(24,[4]);step(180);
    const entered=await dismiss(()=>mana.read16(0xdc)===260&&mana.mod.canAttack);
    const boss=mana.mod.entities().find(e=>e.active&&e.species===87);
    if(!entered||!boss)return{entered,poses,events:[...events],error:mana.mod.story.status.error};
    const player=mana.mod.status,dx=boss.x-player.x,dy=boss.y-player.y;
    step(1,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);step(110,[0]);step(201);
    const rescued=await dismiss(()=>mana.read16(0xdc)===131&&mana.read8(0xcf10)===9&&mana.mod.canAttack);
    // Walk around the flowerbed, up the steps and through the real house door.
    step(32,[7]);step(39,[4]);step(16,[7]);step(80,[4]);
    const banished=await dismiss(()=>mana.read16(0xdc)===258&&mana.read8(0xcf10)===10&&mana.mod.canAttack);
    // The optional farewell requires the cellar chest's native flag. Seed
    // that prerequisite, then exercise the Elder's actual conditional branch.
    mana.write8(0xcf09,1);
    const requested=mana.mod.story.request(0x114);step(120);
    const farewell=await dismiss(()=>mana.mod.canAttack);
    return{entered,rescued,banished,requested,farewell,hopReplay,poses,events:[...events],error:mana.mod.story.status.error,unchanged:mana.hash(mana.snes.cart.data)===hash};
  });
  expect(result.entered).toBe(true);expect(result.rescued).toBe(true);expect(result.banished).toBe(true);
  expect(result.requested).toBe(true);expect(result.farewell).toBe(true);expect(result.hopReplay).toBe(true);
  const hop=result.poses.findIndex(p=>p.native===0xa1),dive=result.poses.findIndex(p=>p.kind==='rescueDive');
  expect(hop).toBeGreaterThanOrEqual(0);expect(dive).toBeGreaterThan(hop);
  expect(result.poses.some(p=>p.kind==='fall')).toBe(false);
  for(const id of[0x10c,0x112,0x4e6,0x4e7])expect(result.events).toContain(id);
  expect(result.error).toBe(null);expect(result.unchanged).toBe(true);expect(errors).toEqual([]);
});
