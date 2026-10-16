import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
async function load(page,path){
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(path),'Requires the user ROM and native fixture.');
  await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
  await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(path,'utf8')));
}

test('Potos house entry and exit keep Goku through every native door fade',async({page})=>{
  await load(page,'.local/graphics-audit/party.json');
  const result=await page.evaluate(()=>{
    const layer=mana.mod.spriteLayer,prepare=layer.prepare,leaks=[],maps=new Set();let fadeBodies=0;
    layer.prepare=function(){
      const result=prepare.call(this);maps.add(mana.read16(0xdc));
      if(mana.snes.ppu.brightness>0&&!mana.snes.ppu.forcedBlank)for(const [slot,owner]of mana.mod.ownership.ppuOwners.entries()){
        if(owner?.base!==0xe000||owner.kind!=='body')continue;
        const y=mana.snes.ppu.oam[slot*2]>>8;if(y>=224)continue;
        if(mana.read8(0xe5)!==1)fadeBodies++;
        if(!this.plan.hidden.has(slot*2))leaks.push({map:mana.read16(0xdc),slot,fade:mana.read8(0xe5)});
      }
      return result;
    };
    try{for(const [frames,buttons]of [[48,[6]],[90,[4]],[120,[]],[100,[5]],[120,[]]])mana.run(frames,buttons);}
    finally{layer.prepare=prepare;}
    return{maps:[...maps],fadeBodies,leaks};
  });
  expect(result.maps).toContain(257);expect(result.maps).toContain(131);expect(result.fadeBodies).toBeGreaterThan(20);expect(result.leaks).toEqual([]);
});

test('Goku shuffles while charging in both forms and Super Saiyan keeps a blue beam',async({page})=>{
  await load(page,'.local/graphics-audit/party.json');
  const result=await page.evaluate(()=>{
    const saved=mana.snapshot(),results=[];
    for(const superSaiyan of [false,true]){
      mana.restore(saved);mana.mod.options.superSaiyan=superSaiyan;
      const before=mana.mod.status,legs=new Set();
      for(let i=0;i<35;i++){mana.run(1,[10,1,6]);const p=mana.mod.spriteLayer.plan.sprite;if(p.shuffle!==undefined)legs.add(p.shuffle);}
      const after=mana.mod.status;
      const groups=[],layer=mana.mod.spriteLayer,stamp=layer.stamp;
      layer.stamp=function(group,...args){groups.push(group);return stamp.call(this,group,...args);};
      try{mana.run(1);mana.run(5);}finally{layer.stamp=stamp;}
      results.push({superSaiyan,moved:before.x-after.x,charging:after.action,legs:[...legs].sort((a,b)=>a-b),blue:groups.includes('beam-body'),gold:groups.includes('gold-beam-body')||groups.includes('gold-charge-orb')});
    }
    return results;
  });
  for(const item of result){expect(item.moved).toBeGreaterThan(20);expect(item.charging).toBe('charge');expect(item.legs).toEqual([0,1]);expect(item.blue).toBe(true);expect(item.gold).toBe(false);}
});

test('focus and transformation keep the native walk live with alternating feet',async({page})=>{
  await load(page,'.local/graphics-audit/party.json');
  const result=await page.evaluate(()=>{
    const m=mana.mod,base=mana.snapshot(),out=[];
    for(const kind of['focus','transform','revert']){
      mana.restore(base);m.options.superSaiyan=kind==='revert';m.powerIntro.restore({flight:true,superShown:true});
      if(kind==='transform')mana.run(95,[10]);
      const before=m.status,legs=new Set(),frames=[];
      for(let i=0;i<30;i++){
        mana.run(1,kind==='revert'&&i===10?[6]:kind==='focus'||kind==='revert'&&i>10?[10,6]:[10,8,6]);
        const p=m.spriteLayer.plan.sprite;frames.push(m.action?.kind);
        if(p.shuffle!==undefined)legs.add(p.shuffle);
      }
      out.push({kind,moved:before.x-m.status.x,legs:[...legs],frames});
    }
    return out;
  });
  for(const r of result){
    expect(r.moved,r.kind).toBeGreaterThan(20);
    expect(r.frames).toContain(r.kind);expect(r.legs.length,JSON.stringify(r)).toBeGreaterThan(1);
    expect(r.legs.every(c=>c===0||c===1)).toBe(true);
  }
});

test('Kamehameha over unsafe ground retains cupped hands and downward hover legs in both forms',async({page})=>{
  await load(page,'.local/emulator-probe/main-before-grass.json');
  const result=await page.evaluate(()=>{
    mana.run(5,[8,7]);mana.run(10);const m=mana.mod,base=mana.snapshot(),out=[];
    for(const superSaiyan of[false,true]){
      mana.restore(base);m.options.superSaiyan=superSaiyan;mana.run(16,[10,1]);
      const p=m.spriteLayer.plan.sprite;out.push({superSaiyan,airborne:m.localFlight,solid:!m.localFlightHook.canLand(),kind:p.kind,column:p.column,legs:p.legs});
    }
    return out;
  });
  for(const r of result)expect(r).toEqual({superSaiyan:r.superSaiyan,airborne:true,solid:true,kind:'charge',column:r.superSaiyan?18:22,legs:r.superSaiyan?34:38});
});

test('a charged Kamehameha removes native bushes and opens their collision tiles',async({page})=>{
  await load(page,'.local/emulator-probe/main-before-grass.json');
  const result=await page.evaluate(()=>{
    const saved=mana.snapshot();mana.run(60,[7]);const blocked=mana.mod.status.x;mana.restore(saved);
    mana.run(2,[7]);mana.run(104,[10,1]);mana.run(1);mana.run(35);
    const cuts=mana.mod.plants.completed.flatMap(row=>row.tiles).map(tile=>({before:tile.tile,after:mana.read8(tile.address),replacement:tile.replacement}));
    mana.run(60,[7]);return{blocked,opened:mana.mod.status.x,cuts};
  });
  expect(result.cuts.length).toBeGreaterThan(2);for(const cut of result.cuts){expect(cut.after).toBe(cut.replacement);expect(cut.after).not.toBe(cut.before);}
  expect(result.opened-result.blocked).toBeGreaterThan(70);
});

test('Instant Transmission moves beside a real enemy without killing it or returning',async({page})=>{
  await load(page,'.local/animation-audit/native/rabite-field-b.json');
  const result=await page.evaluate(()=>{
    const player=mana.mod.status;const enemies=mana.mod.entities().filter(e=>e.index>=3&&e.active&&e.species<128&&e.hp);
    mana.run(14,[10,0]);const first={...mana.mod.status},target=mana.mod.entities()[mana.mod.lastTeleportTarget];
    mana.run(25,[10,0]);const stayed=mana.mod.status;
    mana.run(1);mana.run(14,[10,0]);const second=mana.mod.lastTeleportTarget;
    return{count:enemies.length,moved:Math.hypot(first.x-player.x,first.y-player.y),gap:Math.hypot(first.x-target.x,first.y-target.y),target:target.index,hp:target.hp,beforeHp:enemies.find(e=>e.index===target.index)?.hp,stayed:Math.hypot(first.x-stayed.x,first.y-stayed.y),second};
  });
  expect(result.count).toBeGreaterThan(1);expect(result.moved).toBeGreaterThan(20);expect(result.gap).toBeLessThan(45);expect(result.hp).toBe(result.beforeHp);expect(result.stayed).toBeLessThan(3);expect(result.second).not.toBe(result.target);
});

test('real input starts and stops charging audio and releases a beam sound',async({page})=>{
  await load(page,'.local/graphics-audit/party.json');
  await page.evaluate(()=>mana.play());await page.keyboard.down('Shift');await page.keyboard.down('c');
  await expect.poll(()=>page.evaluate(()=>mana.mod.sound.stats.charge)).toBe(true);
  await page.keyboard.up('c');await page.keyboard.up('Shift');
  await expect.poll(()=>page.evaluate(()=>mana.mod.sound.stats.last)).toBe('beam');
  expect(await page.evaluate(()=>mana.mod.sound.stats.played)).toBeGreaterThan(1);
  await page.evaluate(()=>mana.pause());expect(await page.evaluate(()=>mana.mod.sound.stats.charge)).toBe(false);
});

test('A flies over bushes, respects the next wall, and waits for safe ground before landing',async({page})=>{
  await load(page,'.local/emulator-probe/main-before-grass.json');
  const result=await page.evaluate(()=>{
    const start=mana.mod.status;mana.run(5,[8,7]);const flying={...mana.mod.status},sprite=mana.mod.spriteLayer.plan.sprite;
    mana.run(10);const released={...mana.mod.status},solid=!mana.mod.localFlightHook.canLand();
    mana.run(30,[6]);const landed={...mana.mod.status};
    mana.run(42,[8,4]);const north=mana.mod.status;mana.run(90,[8,7]);const east=mana.mod.status;mana.run(60,[8,7]);const wall=mana.mod.status;
    return{distance:flying.x-start.x,kind:sprite.kind,hovered:released.localFlight,solid,drift:released.x-flying.x,landed:landed.localFlight,landingX:landed.x,north:north.y-landed.y,east:east.x-north.x,wallDrift:wall.x-east.x};
  });
  expect(result.distance).toBeGreaterThanOrEqual(24);expect(result.kind).toBe('hover');expect(result.hovered).toBe(true);expect(result.solid).toBe(true);expect(result.drift).toBeLessThanOrEqual(2);expect(result.landed).toBe(false);expect(result.landingX).toBeLessThan(638);expect(result.north).toBeLessThan(-20);expect(result.east).toBeGreaterThan(0);expect(result.wallDrift).toBeLessThanOrEqual(2);
});

test('the native item ring offers Fly with a Goku icon and takes off without Flammie',async({page})=>{
  await load(page,'.local/graphics-audit/party.json');
  const result=await page.evaluate(()=>{
    mana.run(2,[9]);mana.run(90);
    for(let i=0;i<4&&mana.read8(0x1809)!==0;i++){mana.run(2,[4]);mana.run(60);}
    for(let i=0;i<12&&mana.read8(0x180a)!==0;i++){mana.run(2,[6]);mana.run(30);}
    const icon=[...mana.mod.spriteLayer.plan.portraits.values()].some(p=>p.kind==='fly');
    const label=Array.from({length:4},(_,i)=>mana.snes.cart.read(0xca,0xa139+i));
    mana.run(2,[0]);mana.run(320);
    return{icon,label,world:mana.mod.worldFlight,starts:mana.mod.flight.starts,kind:mana.mod.spriteLayer.plan?.sprite?.kind};
  });
  expect(result.icon).toBe(true);expect(result.label).toEqual([0xa0,0x8c,0x99,0]);expect(result.world).toBe(true);expect(result.starts).toBe(1);expect(result.kind).toBe('flight');
});
