import {test,expect} from '@playwright/test';

test('Vegeta samples play through clash entry, never shout as Goku, and stop on exit, mute and restore',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Sound on|Mute/}).click();
 const result=await page.evaluate(async()=>{
  const {createKiSound}=await import('/engine/ki-sound.js'),ctx=new AudioContext();await ctx.resume();
  const m={frame:0,options:{enabled:true,superSaiyan:true},gokuActive:true,canAttack:true,charging:false,charge:0,powerCharge:0,trial:{dangerous:true}};
  const sound=createKiSound(m);sound.update(ctx,true);await sound.ready;await sound.speech.ready;sound.clear();sound.stats.history=[];
  const analyser=ctx.createAnalyser();analyser.fftSize=2048;sound.connect(analyser);
  const rms=()=>{const a=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);};
  const settle=()=>new Promise(r=>setTimeout(r,220));
  sound.play('vegetaFinalFlash');sound.update(ctx,true);await settle();const finalFlash=rms();
  sound.cancelCombat();sound.update(ctx,true);await settle();const clashEntry=rms();
  sound.clear();m.frame++;sound.play('vegetaBeam');sound.play('vegetaKakarot');sound.update(ctx,true);await settle();const struggle=rms();
  const history=[...sound.stats.history],speech=[...sound.speech.stats.history];
  m.trial.dangerous=false;m.frame++;sound.update(ctx,true);await settle();const ended=rms();
  m.trial.dangerous=true;m.frame++;sound.play('vegetaFinalFlash');sound.update(ctx,true);await settle();
  sound.update(ctx,false);await settle();const muted=rms();
  m.frame++;sound.play('vegetaKakarot');sound.update(ctx,false);const beforeResume=sound.stats.played;
  sound.update(ctx,true);await settle();const resumed={rms:rms(),replayed:sound.stats.played-beforeResume};
  m.frame++;sound.play('vegetaKakarot');const queued=sound.snapshot();sound.update(ctx,true);await settle();
  sound.restore();await settle();const restored=rms();
  sound.restore(queued);sound.update(ctx,true);await settle();const replay={rms:rms(),cue:sound.stats.history.at(-1)};
  const error=sound.stats.error,ready=sound.stats.ready;sound.dispose();await ctx.close();
  return{ready,error,finalFlash,clashEntry,struggle,history,speech,ended,muted,resumed,restored,replay};
 });
 expect(result.ready).toBe(true);expect(result.error).toBe(null);
 for(const key of['finalFlash','clashEntry','struggle'])expect(result[key],key).toBeGreaterThan(.005);
 expect(result.history.map(v=>v.name)).toEqual(['vegetaFinalFlash','vegetaBeam','vegetaKakarot']);
 expect(result.history.map(v=>v.clip)).toEqual(['vegeta-final-flash','beam','vegeta-kakarot']);
 expect(result.history.every(v=>v.sampled)).toBe(true);expect(result.speech).toEqual([]);
 for(const key of['ended','muted','restored'])expect(result[key],key).toBeLessThan(.0001);
 expect(result.resumed).toEqual({rms:0,replayed:0});
 expect(result.replay.rms).toBeGreaterThan(.005);expect(result.replay.cue).toMatchObject({name:'vegetaKakarot',sampled:true});
});
