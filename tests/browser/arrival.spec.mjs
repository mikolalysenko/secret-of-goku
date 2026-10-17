import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

for(const fast of[false,true])test(`native sword pull settles its effects after ${fast?'fast-forward':'normal playback'}, survives a checkpoint, and returns to gameplay`,async({page})=>{
  test.setTimeout(90000);
  const fixture='.local/emulator-probe/main-before-sword.json';
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(fixture),'Requires the local ROM and controller-produced pre-sword checkpoint.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
  const state=JSON.parse(readFileSync(fixture,'utf8'));
  // The title-screen name belongs to the boy Goku lands on: the editor default
  // BOY reads as Randi, and a typed name is kept for {3}.
  const boy=fast?[0xae,0x89,0x8d,0x8d,0x99,0]:[0x9c,0xa9,0xb3,0,0,0];
  await page.evaluate(([state,boy])=>{
    mana.pause();
    // This native-state fixture predates the bounded dialogue substitutions.
    // The core, map and script positions are unchanged; only its hash is rebased.
    state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);
    mana.snes.ram.set(boy,0xcc00);
  },[state,boy]);
  const result=await page.evaluate(async fast=>{
    const romHash=mana.hash(mana.snes.cart.data),stages=[],pages=new Set();let replay=null,earlyGoku=false;
    for(let i=0;i<400;i++){
      if(i%12===0)mana.run(2,[0]);mana.run(20,fast&&mana.read8(0xd0)!==0?[11]:[]);
      const {phase,ticks}=mana.arrival;
      if(stages.at(-1)!==phase)stages.push(phase);
      if(['prologue','queued','descent'].includes(phase)&&mana.mod.gokuActive)earlyGoku=true;
      if(phase==='dialogue'&&mana.read8(0xd0)===0x83)pages.add(mana.read16(0xd1));
      if(phase==='impact'&&ticks>=40&&replay===null){
        const saved=mana.snapshot();mana.run(10);const first=mana.hash(mana.pixels);
        mana.restore(saved);mana.run(10);replay=mana.hash(mana.pixels)===first;
      }
      if(phase==='complete'&&mana.mod.canAttack)break;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const complete=mana.snapshot(),ending={phase:mana.arrival.phase,crater:mana.arrival.crater,name:Array.from(mana.snes.ram.slice(0xcc00,0xcc06)),map:mana.read16(0xdc),event:mana.read8(0xd0),flags:[mana.read8(0xcf00),mana.read8(0xcf10),mana.read8(0xcf0a),mana.read8(0xcfc1)],canAttack:mana.mod.canAttack};const names=mana.mod.names.status;
    mana.run(120,[10,1]);const charging=mana.mod.charging;mana.run(1);const beams=mana.mod.effects.filter(effect=>effect.kind!=='punch').length;
    // The crater and pod are line-composited: no scanline falls back to the
    // per-pixel renderer, which phones cannot afford every frame.
    mana.restore(complete);const ppu=mana.snes.ppu,can=ppu.canComposeLine;let perPixel=0;
    ppu.canComposeLine=function(line){const ok=can.call(this,line);if(!ok)perPixel++;return ok;};
    try{mana.run(60);}finally{ppu.canComposeLine=can;}
    const persistent=mana.arrival.arrived&&mana.arrival.crater&&mana.arrival.phase==='complete';
    const scrolls=new Set(),craters=new Set();
    for(let i=0;i<180;i++){
      mana.run(1);scrolls.add(mana.snes.ppu.bgHoff.slice(0,2).join(','));
      // Opaque ground pixels on the crater rim; avoid the capsule and river.
      const x=500-(mana.read16(0xe002)-mana.mod.readSigned16(0xe020))-30,y=948-(mana.read16(0xe004)-mana.mod.readSigned16(0xe022))+16;
      craters.add(mana.snes.ppu.getColor(false,x,y)[0]);
    }
    const stable={quake:mana.read8(0x49),scrolls:scrolls.size,craters:craters.size};
    // A pre-fix checkpoint can have the residual quake but no cleanup marker.
    const legacy=mana.snapshot();delete legacy.arrival.effectsSettled;mana.restore(legacy);mana.write8(0x49,0x60);mana.run(2);
    return{romUnchanged:mana.hash(mana.snes.cart.data)===romHash,names,stages,pages:pages.size,replay,earlyGoku,ending,charging,beams,persistent,perPixel,stable,repaired:mana.read8(0x49)};
  },fast);
  expect(result.stages).toEqual(['prologue','queued','descent','impact','ghost','dialogue','complete']);
  expect(result.earlyGoku).toBe(false);if(!fast)expect(result.pages).toBe(5);expect(result.replay).toBe(true);expect(result.romUnchanged).toBe(true);
  expect(result.ending).toEqual({phase:'complete',crater:true,name:[0xa1,0xa9,0xa5,0xaf,0,0],map:128,event:0,flags:[1,1,0,1],canAttack:true});
  expect(result.names).toMatchObject({0:'GOKU',3:fast?'Timmy':'Randi'});
  expect(result.charging).toBe(true);expect(result.beams).toBe(1);expect(result.persistent).toBe(true);expect(result.perPixel).toBe(0);expect(errors).toEqual([]);
  expect(result.stable).toEqual({quake:0,scrolls:1,craters:1});expect(result.repaired).toBe(0);
});
