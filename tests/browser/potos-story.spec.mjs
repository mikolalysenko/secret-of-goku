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
      mana.run(1,buttons);for(const id of mana.mod.story.status.recentEvents)events.add(id);
      if(mana.read16(0xdc)===131&&mana.read8(0xcf10)===6){
        const native=mana.read8(0xe011),kind=mana.mod.spriteLayer.plan?.sprite?.kind;
        if(poses.at(-1)?.native!==native||poses.at(-1)?.kind!==kind)poses.push({native,kind});
        if(native===0xa1&&hopReplay===null){
          const middle=mana.snapshot();mana.run(6);const pixels=mana.hash(mana.pixels);mana.restore(middle);mana.run(6);hopReplay=mana.hash(mana.pixels)===pixels;
        }
      }
    }};
    const dismiss=async predicate=>{for(let n=0;n<4000&&!predicate();n++){step(1,[11]);if(n%120===0)await new Promise(r=>setTimeout(r,0));}return predicate();};
    step(130,[4]);step(22,[7]);step(24,[4]);step(180);
    const entered=await dismiss(()=>mana.read16(0xdc)===260&&mana.mod.canAttack);
    const boss=mana.mod.entities().find(e=>e.active&&e.species===87);
    if(!entered||!boss)return{entered,poses,events:[...events],error:mana.mod.story.status.error};
    const player=mana.mod.status,dx=boss.x-player.x,dy=boss.y-player.y;
    // B now holds a melee combo; the boss starts outside punching range.
    // Use the real L+Y charge and release controls for the ranged finisher.
    step(1,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);step(110,[10,1]);step(201);
    const rescued=await dismiss(()=>mana.read16(0xdc)===131&&mana.read8(0xcf10)===9&&mana.mod.canAttack);
    if(!rescued)return{entered,rescued,status:mana.mod.status,poses,events:[...events],error:mana.mod.story.status.error};
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

test('banished Goku gets a native scolding and kick when he flies over the Potos gatekeeper',async({page})=>{
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the local US cartridge.');
  await page.goto('/engine.html');await page.getByRole('button',{name:'START IN POTOS'}).click();await page.waitForFunction(()=>mana.ready);
  const result=await page.evaluate(()=>{
    mana.pause();const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010),hash=mana.hash(c);
    try{c.set([4,24,3,5,0],0x742b0);c.set([131,66,78,0],0x8300c);mana.write8(0xcf10,11);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}finally{c.set(e,0x742b0);c.set(d,0x8300c);}
    const guard=()=>mana.mod.entities().find(e=>e.active&&(mana.read16(e.base+0x3e)&0x7ff)===0x10b),origin=guard(),events=new Set();
    for(let f=0;f<50&&!mana.mod.potosGatekeeper.status.triggers;f++)mana.run(1,[8,4]);
    for(let f=0;f<90&&mana.mod.story.status.lastEvent!==0x9b;f++)mana.run(1);
    const airborne=[mana.mod.localFlight,mana.mod.localLift],saved=mana.snapshot();
    const finish=()=>{for(let f=0;f<900;f++){mana.run(1,[11]);events.add(mana.mod.story.status.lastEvent);if(mana.mod.canAttack&&mana.mod.status.y>650)break;}mana.run(60);return{position:[mana.mod.status.x,mana.mod.status.y],guard:[guard()?.x,guard()?.y],triggers:mana.mod.potosGatekeeper.status.triggers,error:mana.mod.story.status.error,canAttack:mana.mod.canAttack};};
    const first=finish();mana.restore(saved);const replay=finish();mana.run(240);const idleCount=mana.mod.potosGatekeeper.status.triggers;
    // A second deliberate pass replays the gag; merely standing there does not.
    for(let f=0;f<50&&mana.mod.potosGatekeeper.status.triggers<2;f++)mana.run(1,[8,4]);const second=finish();
    return{airborne,first,replay,idleCount,second,events:[...events],origin,unchanged:mana.hash(c)===hash};
  });
  expect(result.airborne).toEqual([false,0]);expect(result.first.error).toBe(null);expect(result.first.canAttack).toBe(true);expect(result.first.position[1]).toBeGreaterThan(650);expect(result.first.guard).toEqual([result.origin.x,result.origin.y]);expect(result.first.triggers).toBe(1);expect(result.replay).toEqual(result.first);expect(result.idleCount).toBe(1);expect(result.second.triggers).toBe(2);expect(result.second.canAttack).toBe(true);expect(result.events).toContain(0x9b);expect(result.events).toContain(0x11b);expect(result.unchanged).toBe(true);
});
