import {test,expect} from '@playwright/test';

test('DBZ flight audio survives scripted combat locks and all audio stops on clear',async({page})=>{
 await page.goto('/');
 // A real gesture unlocks the browser AudioContext; this test needs no ROM.
 await page.getByRole('button',{name:/Sound on|Mute/}).click();
 const result=await page.evaluate(async()=>{
  const {createKiSound}=await import('/engine/ki-sound.js');
  const ctx=new AudioContext();await ctx.resume();
  const m={frame:0,options:{enabled:true,superSaiyan:false},gokuActive:true,canAttack:false,localFlight:false,worldFlight:false,gapFlight:{active:true},charging:false,charge:0};
  const sound=createKiSound(m);sound.update(ctx,true);await sound.ready;await sound.speech.ready;
  sound.clear();sound.stats.history=[];sound.play('flight');sound.update(ctx,true);
  for(let i=0;i<40;i++){m.frame++;sound.cancelCombat();sound.update(ctx,true);}
  const analyser=ctx.createAnalyser();analyser.fftSize=2048;sound.connect(analyser);
  const rms=()=>{const a=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);};
  await new Promise(resolve=>setTimeout(resolve,850));
  const active={history:[...sound.stats.history],loops:[...sound.stats.loops],rms:rms(),ready:sound.stats.ready,error:sound.stats.error};
  sound.clear();await new Promise(resolve=>setTimeout(resolve,120));
  const stopped={loops:[...sound.stats.loops],rms:rms(),speaking:sound.speech.stats.speaking};
  sound.dispose();await ctx.close();return{active,stopped};
 });
 expect(result.active.ready).toBe(true);expect(result.active.error).toBe(null);
 expect(result.active.history.map(e=>e.name)).toEqual(['flight','air']);expect(result.active.history.every(e=>e.sampled)).toBe(true);
 expect(result.active.loops).toEqual(['air']);expect(result.active.rms).toBeGreaterThan(.005);
 expect(result.stopped.loops).toEqual([]);expect(result.stopped.speaking).toBe(false);expect(result.stopped.rms).toBeLessThan(.00001);
});
