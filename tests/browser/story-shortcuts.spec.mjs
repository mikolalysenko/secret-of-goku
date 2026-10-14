import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {encodeText} from '../../engine/event-codec.js';

test.setTimeout(180000);
async function load(page,path='.local/graphics-audit/party.json'){
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(path),'Requires the private user ROM and native fixture.');
  await page.goto('/');await page.waitForFunction(()=>mana.ready);
  await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(path,'utf8')));
}
async function enter(page,map,x,y,flags={},layer=1){
  await page.evaluate(({map,x,y,flags,layer})=>{
    const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
    try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2+layer,0],0x8300c);
      for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);
      mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
    }finally{c.set(e,0x742b0);c.set(d,0x8300c);}
  },{map,x,y,flags,layer});
}
async function dismiss(page,predicate,limit=24){
  for(let i=0;i<limit;i++){
    if(await page.evaluate(predicate))return;
    await page.evaluate(()=>{mana.run(2,[16]);mana.run(95);});
  }
  expect(await page.evaluate(predicate)).toBe(true);
}

test('three charged gate shortcuts rebuild native maps and persist across return visits',async({page})=>{
  for(const[map,x,y,flag,min]of[[300,9,25,23,2],[82,20,38,52,4],[116,16,29,55,1]]){
    await load(page);await enter(page,map,x,y,{[flag]:0});
    expect(await page.evaluate(flag=>mana.read8(0xcf00+flag),flag)).toBe(0);
    await page.evaluate(()=>{mana.run(1,[4]);mana.run(105,[10,1]);mana.run(1);mana.run(60);});
    await dismiss(page,()=>mana.mod.barriers.status.completed.length>0&&mana.mod.canAttack,40);
    expect(await page.evaluate(flag=>mana.read8(0xcf00+flag),flag)).toBe(min);
    const after=await page.evaluate(()=>({map:mana.read16(0xdc),grid:mana.hash(mana.snes.ram.slice(0x10000,0x18000)),error:mana.mod.story.status.error}));
    expect(after.map).toBe(map);expect(after.error).toBe(null);
    await enter(page,131,18,22);await enter(page,map,x,y);
    expect(await page.evaluate(flag=>mana.read8(0xcf00+flag),flag)).toBeGreaterThanOrEqual(min);
    expect(await page.evaluate(()=>mana.hash(mana.snes.ram.slice(0x10000,0x18000)))).toBe(after.grid);
  }
});

test('early Tree barrier blocks landing, breaks with an aerial charge, then lands without Flammie',async({page})=>{
  await load(page);await enter(page,198,18,39,{93:1,70:0});
  const result=await page.evaluate(()=>{
    mana.write8(0xe3,0);mana.mod.flight.request();mana.run(700);
    mana.run(160,[0]);const blocked=mana.mod.worldFlight;mana.mod.autoLand=false;
    // Travel away naturally so the native world row stream stays initialized.
    mana.write16(0xf6,512);mana.run(100,[4]);mana.write16(0xf6,0);mana.write16(0xf4,0);
    mana.run(105,[10,1]);const held={charge:mana.mod.charge,nativeB:mana.snes.joypad1State&1};mana.run(1);mana.run(100);
    const hit=mana.mod.worldKi.status.lastHit,scars=mana.mod.worldScars.status.length,saved=mana.snapshot();mana.restore(saved);
    mana.write16(0xfa,624);mana.write16(0xfc,384);mana.write16(0xf4,0);mana.write8(0xcf5d,0);
    const landing=[],backgroundFlyby=[];for(let f=0;f<400;f++){mana.run(1,mana.mod.worldFlight?[0]:[]);if(!mana.mod.worldFlight&&!mana.snes.ppu.forcedBlank){backgroundFlyby.push(mana.read8(0x52));const pose=mana.mod.spriteLayer.plan?.sprite;if(pose?.kind==='landing')landing.push(pose.y);}}
    return{blocked,held,hit,scars,map:mana.read16(0xdc),world:mana.mod.worldFlight,gate:mana.read8(0xe3)&64,progress:mana.read8(0xcf46),landing,backgroundFlyby};
  });
  expect(result.blocked).toBe(true);expect(result.held).toEqual({charge:90,nativeB:0});expect(result.hit).toBe('mana-tree-barrier');
  expect(result.map).toBe(198);expect(result.world).toBe(false);expect(result.gate).toBe(64);expect(result.progress).toBe(0);
  expect(result.scars).toBe(0);
  expect(result.landing.length).toBeGreaterThan(10);expect(Math.max(...result.landing)-Math.min(...result.landing)).toBeGreaterThan(40);
  expect(result.backgroundFlyby.every(v=>v===0)).toBe(true);
  await dismiss(page,()=>mana.mod.canAttack);expect(await page.evaluate(()=>mana.mod.story.status.lastEvent)).toBe(0x4d8);
});

test('aerial Fortress destruction skips the dungeon and starts the native Mana Beast battle solo',async({page})=>{
  await load(page,'.local/juice-research/flight/request-flight.json');
  const hit=await page.evaluate(()=>{
    for(const base of[0xe200,0xe400]){mana.write8(base,0);mana.write8(base+0x2c,0);}
    mana.write8(0xf8,190);mana.run(10);
    for(let f=0;f<105;f++){
      const dx=((mana.read16(0x128)-mana.read16(0xfa)+2048)&4095)-2048,dy=((mana.read16(0x12a)-mana.read16(0xfc)+2048)&4095)-2048;
      mana.write16(0xf6,Math.round(Math.atan2(-dx,-dy)*512/Math.PI)&1023);mana.run(1,[10,1]);
    }
    mana.run(1);mana.run(17);const hit=mana.mod.worldKi.status.lastHit;mana.run(240);return hit;
  });
  expect(hit).toBe('mana-fortress');
  await dismiss(page,()=>mana.read16(0xdc)===253&&mana.mod.canAttack&&mana.mod.entities().some(e=>e.active&&e.species===127),50);
  expect(await page.evaluate(()=>({mode:mana.snes.ppu.mode,flag:mana.read8(0xcf4e),destroyed:mana.mod.worldKi.status.fortressDestroyed,error:mana.mod.story.status.error}))).toEqual({mode:7,flag:8,destroyed:true,error:null});
  expect(await page.evaluate(()=>mana.mod.quest.status.count)).toBe(7);
});

test('Luka shortcut plays both final battles and reaches the ending without recruiting anyone',async({page})=>{
  await load(page);await page.evaluate(()=>{for(const base of[0xe200,0xe400]){mana.write8(base,0);mana.write8(base+0x2c,0);}mana.mod.options.superSaiyan=true;mana.mod.story.request(0x88);});
  const seen=new Set();let ending=false;
  for(let i=0;i<190;i++){
    const s=await page.evaluate(()=>{
      const m=mana.mod,bosses=m.entities().filter(e=>e.index>=3&&e.active&&e.species>=87&&e.species<128&&e.hp);const seen=bosses.map(e=>e.species);
      if(m.canAttack&&bosses.length){m.instantTransmission();mana.run(15);mana.run(110,[10,1]);mana.run(1);mana.run(40);}
      else{mana.run(2,[16]);mana.run(95);}
      return{seen,flag:mana.read8(0xcf4e),error:m.story.status.error};
    });s.seen.forEach(id=>seen.add(id));expect(s.error).toBe(null);if(s.flag>=9){ending=true;break;}
  }
  expect([...seen]).toContain(121);expect([...seen]).toContain(127);expect(ending).toBe(true);
  expect(await page.evaluate(()=>mana.mod.quest.status)).toMatchObject({count:7,wished:true});
});

for(const solo of[true,false])test(`Thanatos possession scene reaches and clears Dark Lich ${solo?'with solo Goku':'with the full party'}`,async({page})=>{
 await load(page,solo?'.local/animation-audit/native/rabite-field-a.json':'.local/graphics-audit/party.json');
 if(solo)await page.evaluate(()=>{for(const base of[0xe200,0xe400])mana.snes.ram.fill(0,base,base+0x200);});
 expect(await page.evaluate(()=>{mana.write8(0xcf4e,4);return mana.mod.story.travel(0x154);})).toBe(true);
 const result=await page.evaluate(()=>{
  const m=mana.mod,r=mana.snes.ram;Object.assign(m.options,{superSaiyan:true});m.powerIntro.restore({flight:true,superSaiyan:true});
  // The real Fortress door runs walk-on event 428. A diagnostic map load
  // would bypass that event and would not exercise the reported approach.
  let scene=false,battle=false,defeated=false,initialHP=0;const poses=new Set(),beamCount=()=>mana.logs.filter(l=>l.startsWith('Kamehameha')).length,initialBeams=beamCount();
  for(let f=0;f<8000;f++){
   if(m.story.status.lastEvent===0x4e1)scene=true;
   if(m.spriteLayer.plan?.sprite)poses.add(m.spriteLayer.plan.sprite.kind);
   const boss=m.entities().find(e=>e.active&&e.species===121&&e.hp);
   if(m.canAttack&&boss){if(!battle){mana.run(1);initialHP=mana.read16(boss.base+0x184);}battle=true;m.instantTransmission();mana.run(15);mana.run(100,[10,1]);mana.run(1);mana.run(80);}
   else mana.run(1,[11]);
   if(battle&&r[0xcf4e]===8&&m.canAttack){defeated=true;break;}
  }
  return{scene,battle,defeated,initialHP,beams:beamCount()-initialBeams,poses:[...poses],map:mana.read16(0xdc),flag:r[0xcf4e],party:[r[0xe200]&1,r[0xe400]&1],error:m.story.status.error,can:m.canAttack};
 });
 expect(result,JSON.stringify(result)).toMatchObject({scene:true,battle:true,defeated:true,map:246,flag:8,party:solo?[0,0]:[1,1],error:null,can:true});
 expect(result.initialHP).toBe(48000);expect(result.beams).toBeGreaterThan(1);
 await page.locator('#screen').screenshot({path:test.info().outputPath('thanatos-defeated.png')});
});

test('a complete native cannon trip lands Goku upright and returns visible walking control',async({page})=>{
 await load(page);await enter(page,159,10,17,{},0);
 const result=await page.evaluate(()=>{
  const m=mana.mod,npc=m.entities().find(e=>e.active&&e.species===206),requested=m.story.request(0xfa,{actor:npc.base-0xe000});
  const poses=[];let arrived=false;
  for(let f=0;f<2600;f++){
   mana.run(1,[11]);const p=m.spriteLayer.plan?.sprite;if(p?.kind==='landing')poses.push(p.column);
   if(f>600&&m.canAttack&&mana.read16(0xdc)===19){arrived=true;mana.run(90);break;}
  }
  const before=m.status;mana.run(10,[5]);return{requested,arrived,poses,visible:!!m.spriteLayer.plan?.sprite,hidden:mana.read8(0xe00e),before,after:m.status,error:m.story.status.error};
 });
 expect(result.requested).toBe(true);expect(result.arrived).toBe(true);expect(result.poses).toContain(38);
 expect(result.poses.every(p=>[0,37,38].includes(p))).toBe(true);expect(result.visible).toBe(true);expect(result.hidden&0x80).toBe(0);
 expect(result.after.canAttack).toBe(true);expect(result.after.y).not.toBe(result.before.y);expect(result.error).toBe(null);
 await page.locator('#screen').screenshot({path:test.info().outputPath('cannon-landed.png')});
});

test('Undine can grant spells solo and native later recruitment keeps both rewards',async({page})=>{
  await load(page);await enter(page,278,15,30,{169:0});
  expect(await page.evaluate(()=>{for(const b of[0xe200,0xe400]){mana.write8(b,0);mana.write8(b+0x2c,0);for(let i=0;i<8;i++)mana.write8(b+0x1c8+i,0);}mana.mod.story.restore();return mana.mod.story.request(0x581);})).toBe(true);
  await dismiss(page,()=>mana.mod.canAttack&&mana.read8(0xcfa9)>0,60);
  const result=await page.evaluate(()=>{
    const before=[mana.read8(0xe3c9),mana.read8(0xe5c9)],c=mana.snes.cart.data,table=0x90000+0x98*2,pointer=c.slice(table,table+2),bytes=c.slice(0x9f300,0x9f305);
    // Private scratch script invokes the real ADD_CHARACTER initializer. Its
    // offsets/data are restored even if recruitment or validation fails.
    try{c.set([0x00,0xf3],table);c.set([0x2b,1,0x2b,2,0],0x9f300);const requested=mana.mod.story.request(0x98);mana.run(240);
      return{before,requested,after:[mana.read8(0xe3c9),mana.read8(0xe5c9)],present:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:mana.mod.story.status.error};
    }finally{c.set(pointer,table);c.set(bytes,0x9f300);}
  });
  expect(result.requested).toBe(true);expect(result.before).toEqual([0x38,7]);expect(result.after).toEqual(result.before);expect(result.present).toEqual([1,1]);expect(result.error).toBe(null);
});

test('Luka menu can cancel the shortcut and open the original save screen',async({page})=>{
  await load(page);await page.evaluate(()=>{mana.write8(0xcfc3,1);mana.mod.story.request(0x134);mana.run(200);});
  for(let i=0;i<2;i++)await page.evaluate(()=>{mana.run(4,[7]);mana.run(16);});
  await page.evaluate(()=>{mana.run(4,[16]);mana.run(110);});
  expect(await page.evaluate(()=>mana.mod.story.status.lastEvent)).toBe(0x87);
  await dismiss(page,()=>mana.mod.canAttack,20); // Stay is the default option.
  expect(await page.evaluate(()=>({event:mana.mod.story.status.lastEvent,flag:mana.read8(0xcf4e)}))).toEqual({event:0x91,flag:0});
  await page.evaluate(()=>{mana.mod.story.request(0x134);mana.run(200);mana.run(4,[7]);mana.run(16);mana.run(4,[16]);mana.run(110);});
  for(let i=0;i<5;i++){
    if(await page.evaluate(()=>mana.mod.story.status.lastEvent===0x90))break;
    await page.evaluate(()=>{mana.run(4,[16]);mana.run(130);});
  }
  expect(await page.evaluate(()=>mana.mod.story.status.lastEvent)).toBe(0x90);
  expect(await page.evaluate(()=>mana.mod.story.status.error)).toBe(null);
});

test('Goku answers NOTHING to Luka and still receives the Water Dragon Ball through the native seed scene',async({page})=>{
 await load(page);await enter(page,139,17,18,{0x11:10,0x90:0},0);
 const choice=await page.evaluate(()=>{
  const m=mana.mod,npc=m.entities().find(e=>e.active&&(mana.read16(e.base+0x3e)&0x7ff)===0x130);m.quest.restore();
  const requested=m.story.request(0x133,{actor:npc.base-0xe000});mana.run(300,[11]);
  const pc=mana.read16(0xd1)|(mana.read8(0xd3)<<16),bytes=Array.from({length:100},(_,i)=>m.story.inspectByte(pc+i));
  mana.run(180,[11]);return{requested,bytes:bytes.join(','),waiting:pc===(mana.read16(0xd1)|(mana.read8(0xd3)<<16)),id:m.story.status.lastEvent};
 });
 expect(choice.requested).toBe(true);expect(choice.id).toBe(0x133);expect(choice.waiting).toBe(true);expect(choice.bytes).toContain(encodeText('NOTHING').join(','));expect(choice.bytes).not.toContain(encodeText('The Sword').join(','));
 const result=await page.evaluate(async()=>{
  const events=new Set();mana.run(2,[0]);mana.run(10);
  for(let i=0;i<120&&mana.read8(0xcf11)===10;i++){
   mana.run(30,[11]);events.add(mana.mod.story.status.lastEvent);
   if(mana.fastForward.state(0x800).choice){mana.run(240,[11]);if(mana.mod.story.status.lastEvent===0x202){mana.run(2,[7]);mana.run(12);}mana.run(2,[0]);mana.run(10);}
   if(i%10===0)await new Promise(r=>setTimeout(r,0));
  }
  return{events:[...events],progress:mana.read8(0xcf11),seed:mana.read8(0xcf90),quest:mana.mod.quest.status,error:mana.mod.story.status.error};
 });
 expect(result.events).toContain(0x9c);expect(result.events).toContain(0x200);expect(result.events).toContain(0x204);expect(result.progress).toBe(11);expect(result.seed).toBe(1);expect(result.quest.mask&1).toBe(1);expect(result.quest.seedMask&1).toBe(1);expect(result.error).toBe(null);
});
