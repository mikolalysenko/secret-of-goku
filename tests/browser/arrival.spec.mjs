import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

test('native sword pull hands off once to Goku, survives an impact checkpoint, and returns to gameplay',async({page})=>{
  test.setTimeout(90000);
  const fixture='.local/emulator-probe/main-before-sword.json';
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(fixture),'Requires the local ROM and controller-produced pre-sword checkpoint.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
  const state=JSON.parse(readFileSync(fixture,'utf8'));
  await page.evaluate(state=>{
    mana.pause();
    // This native-state fixture predates the bounded dialogue substitutions.
    // The core, map and script positions are unchanged; only its hash is rebased.
    state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);
    mana.snes.ram.set([0x9c,0xa9,0xb3,0,0,0],0xcc00);
  },state);
  const result=await page.evaluate(async()=>{
    const romHash=mana.hash(mana.snes.cart.data),stages=[],pages=new Set();let replay=null,earlyGoku=false;
    for(let i=0;i<400;i++){
      if(i%12===0)mana.run(2,[0]);mana.run(20);
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
    const complete=mana.snapshot(),ending={phase:mana.arrival.phase,crater:mana.arrival.crater,name:Array.from(mana.snes.ram.slice(0xcc00,0xcc06)),map:mana.read16(0xdc),event:mana.read8(0xd0),flags:[mana.read8(0xcf00),mana.read8(0xcf10),mana.read8(0xcf0a),mana.read8(0xcfc1)],canAttack:mana.mod.canAttack};
    mana.run(120,[10,1]);const charging=mana.mod.charging;mana.run(1);const beams=mana.mod.effects.filter(effect=>effect.kind!=='punch').length;
    mana.restore(complete);mana.run(60);const persistent=mana.arrival.arrived&&mana.arrival.crater&&mana.arrival.phase==='complete';
    return{romUnchanged:mana.hash(mana.snes.cart.data)===romHash,stages,pages:pages.size,replay,earlyGoku,ending,charging,beams,persistent};
  });
  expect(result.stages).toEqual(['prologue','queued','descent','impact','ghost','dialogue','complete']);
  expect(result.earlyGoku).toBe(false);expect(result.pages).toBe(5);expect(result.replay).toBe(true);expect(result.romUnchanged).toBe(true);
  expect(result.ending).toEqual({phase:'complete',crater:true,name:[0xa1,0xa9,0xa5,0xaf,0,0],map:128,event:0,flags:[1,1,0,1],canAttack:true});
  expect(result.charging).toBe(true);expect(result.beams).toBe(1);expect(result.persistent).toBe(true);expect(errors).toEqual([]);
});
