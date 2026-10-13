import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
test.setTimeout(180000);
const fixture='.local/graphics-audit/party.json';
async function load(page,path=fixture){
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(path),'Requires private ROM/QA checkpoint.');
  await page.goto('/');await page.waitForFunction(()=>mana.ready);
  await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:true});mana.run(3);},JSON.parse(readFileSync(path,'utf8')));
}
async function enter(page,map,x,y,flags={}){
  await page.evaluate(({map,x,y,flags})=>{
    const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
    try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2+1,0],0x8300c);
      for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);
      mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
    }finally{c.set(e,0x742b0);c.set(d,0x8300c);}
  },{map,x,y,flags});
}
test('telepathy leaves held attacks, movement, release and the native ring in control',async({page})=>{
  await load(page);
  const result=await page.evaluate(()=>{
    const m=mana.mod;mana.run(125,[0]);const first=m.radio.status,oldX=m.status.x;
    mana.run(8,[0,7]);const moved=m.status.x!==oldX,s=mana.snapshot();mana.run(365,[0]);const next=m.radio.snapshot();
    mana.restore(s);mana.run(365,[0]);const replay=JSON.stringify(next)===JSON.stringify(m.radio.snapshot());
    mana.run(1);const beam=m.effects.find(e=>e.kind==='beam'),after=m.radio.status;
    mana.run(70);mana.run(2,[1]);mana.run(60);return{first,moved,replay,beam:beam?.mega,after,ring:mana.read8(0xec),visible:m.radio.status.visible};
  });
  expect(result.first.visible).toBe(true);expect(result.first.current.text).toContain('KING KAI');expect(result.moved).toBe(true);expect(result.replay).toBe(true);
  expect(result.beam).toBe(true);expect(result.after.current.text).toContain('NOT A COUNTDOWN');expect(result.ring&8).toBe(8);expect(result.visible).toBe(false);
});
test('Mode 7 warnings stay nonblocking during a held aerial beam',async({page})=>{
  await load(page,'.local/juice-research/flight/request-flight.json');
  const result=await page.evaluate(()=>{
    const m=mana.mod;m.radio.restore({firstFlight:true});mana.run(125,[0]);const before={radio:m.radio.status,charge:m.charge};mana.run(1);
    return{before,beam:m.worldKi.status.shot?.mega,dialogue:mana.read8(0xd0),nativeB:mana.snes.joypad1State&1};
  });
  expect(result.before.radio.visible).toBe(true);expect(result.before.radio.current.text).toContain('KING KAI');expect(result.before.charge).toBe(45);expect(result.beam).toBe(true);expect(result.dialogue).toBe(0);expect(result.nativeB).toBe(0);
});
test('ceiling punches escape three dungeons with the party, checkpoint replay, and native landing',async({page})=>{
  for(const[map,x,y,outside]of[[284,24,68,25],[300,9,33,196],[412,25,57,195]]){
    await load(page);await enter(page,map,x,y);
    expect(await page.evaluate(()=>mana.mod.canAttack)).toBe(true);
    const result=await page.evaluate(()=>{
      const m=mana.mod;
      mana.fly();const requested=m.ceiling.busy;mana.run(24);const pose=m.spriteLayer.plan.sprite.kind,s=mana.snapshot();mana.run(12);const pixels=mana.hash(mana.pixels);mana.restore(s);mana.run(12);const replay=pixels===mana.hash(mana.pixels);
      for(let i=0;i<14&&!m.worldFlight;i++)mana.run(60);
      mana.run(240);return{requested,pose,replay,world:m.worldFlight,ceiling:m.ceiling.status,party:m.entities().slice(0,3).map(e=>e.active),map:m.status.map,story:m.story.status.error,flight:m.flight.error};
    });
    expect(result.requested).toBe(true);expect(result.pose).toBe('ceilingEscape');expect(result.replay).toBe(true);expect(result.world).toBe(true);expect(result.map).toBe(outside);
    expect(result.ceiling.completed).toBe(1);expect(result.ceiling.error).toBe(null);expect(result.story).toBe(null);expect(result.flight).toBe(null);expect(result.party).toEqual([true,true,true]);
    const landing=await page.evaluate(()=>{const c=mana.snes.cart.data;mana.write16(0xfa,c[0x67a80+131*2]*16);mana.write16(0xfc,c[0x67a81+131*2]*16);mana.write16(0xf4,0);mana.mod.autoLand=true;for(let i=0;i<12&&mana.mod.worldFlight;i++)mana.run(60);mana.run(200);return{world:mana.mod.worldFlight,canAttack:mana.mod.canAttack,map:mana.read16(0xdc),party:mana.mod.entities().slice(0,3).map(e=>e.active),error:mana.mod.story.status.error};});
    expect(landing.world).toBe(false);expect(landing.party).toEqual([true,true,true]);expect(landing.canAttack).toBe(true);expect(landing.error).toBe(null);
  }
});
test('native palace rewards count each Dragon Ball once, then King Kai supplies only the missing Ball',async({page})=>{
  await load(page);await page.evaluate(()=>{for(let i=0;i<8;i++)mana.write8(0xcf90+i,0);mana.mod.quest.restore();});
  // Native seed interaction/reward scripts, with only their visit prerequisites
  // initialized by the fixture. Collection and animation run in the cartridge.
  for(const[map,event,ball]of[[276,0x58b,1],[273,0x58a,2],[349,0x589,3],[120,0x58c,4],[375,0x58d,5],[351,0x58e,6]]){
    await enter(page,map,14,14,{24:8,69:0});
    expect(await page.evaluate(id=>mana.mod.story.request(id),event)).toBe(true);
    for(let i=0;i<24;i++){
      if(await page.evaluate(ball=>!!(mana.mod.quest.status.mask&1<<ball)&&mana.mod.canAttack,ball))break;
      await page.evaluate(()=>{mana.run(2,[16]);mana.run(100);});
    }
    const result=await page.evaluate(()=>({quest:mana.mod.quest.status,canAttack:mana.mod.canAttack,error:mana.mod.story.status.error}));
    expect(result.quest.mask&1<<ball).toBe(1<<ball);expect(result.canAttack).toBe(true);expect(result.error).toBe(null);
    const before=result.quest.count;
    await page.evaluate(id=>{mana.mod.story.request(id);mana.run(300);},event);
    for(let i=0;i<5&&!await page.evaluate(()=>mana.mod.canAttack);i++)await page.evaluate(()=>{mana.run(2,[16]);mana.run(100);});
    expect(await page.evaluate(()=>mana.mod.quest.status.count)).toBe(before);
  }
  const saved=await page.evaluate(()=>mana.snapshot());await page.evaluate(s=>mana.restore(s),saved);
  expect(await page.evaluate(()=>mana.mod.quest.status.count)).toBe(6);
  await page.evaluate(()=>{mana.mod.story.request(0x93);mana.run(220);});
  expect(await page.evaluate(()=>mana.mod.quest.status)).toMatchObject({count:7,delivered:1,wished:false});
});
