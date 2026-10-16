import {test,expect} from '@playwright/test';

test('Shenron silences combat loops and speech, with flight audio only during the Ball departure',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Sound on|Mute/}).click();
 const result=await page.evaluate(async()=>{
  const {createKiSound}=await import('/engine/ki-sound.js'),ctx=new AudioContext();await ctx.resume();
  const m={frame:0,options:{enabled:true,superSaiyan:true},gokuActive:true,canAttack:true,charging:false,charge:90,powerCharge:96,localFlight:false,frieza:{music:'orbit',chargeSound:0},ending:{active:false,airborne:false}};
  const sound=createKiSound(m);sound.update(ctx,true);await sound.ready;await sound.speech.ready;sound.clear();sound.stats.history=[];sound.speech.stats.history=[];
  sound.play('friezaBeam');sound.update(ctx,true);
  const enemyBeam={effect:sound.stats.history.at(-1),speech:[...sound.speech.stats.history]};
  m.frame++;m.ending.active=true;m.localFlight=true;m.charging=true;m.action={kind:'focus'};m.frieza.chargeSound=1;sound.update(ctx,true);
  const wish={loops:[...sound.stats.loops],speaking:sound.speech.stats.speaking,track:sound.music.stats.track,gain:sound.nativeGain};
  m.frame++;m.ending.airborne=true;m.ending.musicMuted=true;sound.update(ctx,true);const departure={loops:[...sound.stats.loops],gain:sound.nativeGain};
  m.frame++;m.ending.airborne=false;m.ending.musicMuted=false;sound.update(ctx,true);const settled={loops:[...sound.stats.loops],gain:sound.nativeGain};
  m.ending.charging=true;sound.stats.history=[];
  for(let i=0;i<40;i++){m.frame++;sound.update(ctx,true);}
  const powerup={loops:[...sound.stats.loops],starts:sound.stats.history.filter(v=>v.name==='charge').length};
  sound.dispose();await ctx.close();return{enemyBeam,wish,departure,settled,powerup};
 });
 expect(result.enemyBeam.effect).toMatchObject({name:'friezaBeam',clip:'beam',sampled:true});expect(result.enemyBeam.speech).toEqual([]);
 expect(result.wish).toEqual({loops:[],speaking:false,track:null,gain:1});expect(result.departure).toEqual({loops:['air'],gain:0});expect(result.settled).toEqual({loops:[],gain:1});expect(result.powerup).toEqual({loops:['charge'],starts:1});
});

test('Frieza score changes from ominous entrance to battle and orbit, ducks native music and stops on pause',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Sound on|Mute/}).click();
 // The combat cues are rendered from the running cartridge's instrument bank.
 await page.waitForFunction(()=>window.mana?.snes?.cart?.data?.length,{},{timeout:60000});
 const result=await page.evaluate(async()=>{
  const {createFriezaScore}=await import('/engine/frieza-score.js'),ctx=new AudioContext();await ctx.resume();
  const m={frame:0,frieza:{music:'arrival'},charging:false},score=createFriezaScore(m,{rom:()=>window.mana.snes.cart.data});score.update(ctx,true);await score.ready;score.update(ctx,true);
  const analyser=ctx.createAnalyser();analyser.fftSize=2048;score.connect(analyser);
  const energy=()=>{const a=new Float32Array(2048);analyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);};
  await new Promise(r=>setTimeout(r,250));const entrance={track:score.stats.track,rms:energy(),gain:score.nativeGain};
  m.frame++;m.frieza.music='battle';score.update(ctx,true);await new Promise(r=>setTimeout(r,250));const battle={track:score.stats.track,rms:energy()};
  m.frame++;m.frieza.music='orbit';score.update(ctx,true);await new Promise(r=>setTimeout(r,250));const orbit={track:score.stats.track,rms:energy()};
  score.update(ctx,false);await new Promise(r=>setTimeout(r,100));const paused={track:score.stats.track,rms:energy(),gain:score.nativeGain};
  score.update(ctx,true);const resumed=score.stats.track;m.frieza.music=null;score.update(ctx,true);const ended=score.nativeGain;
  m.trial={music:'vegeta'};m.frame++;score.update(ctx,true);await new Promise(r=>setTimeout(r,250));const training={track:score.stats.track,rms:energy(),gain:score.nativeGain};
  m.trial.music='vegeta-full-power';m.frame++;score.update(ctx,true);await new Promise(r=>setTimeout(r,250));const fullPower={track:score.stats.track,rms:energy()};
  m.trial.music=null;score.update(ctx,true);const returned={track:score.stats.track,gain:score.nativeGain};
  const error=score.stats.error,rendered=score.stats.rendered;score.dispose();await ctx.close();return{entrance,battle,orbit,paused,resumed,ended,training,fullPower,returned,error,rendered};
 });
 expect(result.entrance.track).toBe('arrival');expect(result.entrance.rms).toBeGreaterThan(.005);expect(result.entrance.gain).toBeLessThan(.05);
 expect(result.battle.track).toBe('battle');expect(result.battle.rms).toBeGreaterThan(.005);expect(result.orbit.track).toBe('orbit');expect(result.orbit.rms).toBeGreaterThan(.005);
 expect(result.paused.track).toBe(null);expect(result.paused.rms).toBeLessThan(.0001);expect(result.paused.gain).toBe(1);
 expect(result.resumed).toBe('orbit');expect(result.ended).toBe(1);expect(result.error).toBe(null);
 expect(result.rendered.sort()).toEqual(['battle','orbit','vegeta','vegeta-full-power']);
 expect(result.training.track).toBe('vegeta');expect(result.training.rms).toBeGreaterThan(.005);expect(result.training.gain).toBeLessThan(.05);
 expect(result.fullPower.track).toBe('vegeta-full-power');expect(result.fullPower.rms).toBeGreaterThan(.005);expect(result.returned).toEqual({track:null,gain:1});
});

test('Frieza charge has a sustained bed and impacts use bounded sampled cues that clear on pause',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Sound on|Mute/}).click();
 const result=await page.evaluate(async()=>{
  const {createKiSound}=await import('/engine/ki-sound.js'),ctx=new AudioContext();await ctx.resume();
  const m={frame:0,options:{enabled:true,superSaiyan:true},gokuActive:true,canAttack:true,frieza:{chargeSound:1},charging:false,charge:0,powerCharge:0};
  const sound=createKiSound(m);sound.update(ctx,true);await sound.ready;await sound.speech.ready;sound.clear();sound.stats.history=[];
  sound.update(ctx,true);const analyser=ctx.createAnalyser();analyser.fftSize=2048;sound.connect(analyser);
  const energy=()=>{const a=new Float32Array(2048);analyser.getFloatTimeDomainData(a);return{rms:Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),peak:Math.max(...a.map(Math.abs))};};
  await new Promise(r=>setTimeout(r,1400));const held=energy();
  m.frame++;m.frieza.chargeSound=0;sound.play('friezaOrb');sound.play('fortressBreak');sound.play('friezaImpact');sound.update(ctx,true);
  await new Promise(r=>setTimeout(r,160));const hit=energy(),history=[...sound.stats.history];
  sound.update(ctx,false);await new Promise(r=>setTimeout(r,120));const paused=energy(),loops=[...sound.stats.loops];
  sound.dispose();await ctx.close();return{held,hit,history,paused,loops};
 });
 expect(result.held.rms).toBeGreaterThan(.01);expect(result.hit.rms).toBeGreaterThan(.02);expect(result.hit.peak).toBeLessThan(.95);
 expect(result.history.every(v=>v.sampled)).toBe(true);expect(result.history.map(v=>v.name)).toEqual(['friezaCharge','friezaOrb','fortressBreak','friezaImpact']);
 expect(result.history.map(v=>v.clip)).toEqual(['charge','power-burst','power-burst','impact']);
 expect(result.paused.rms).toBeLessThan(.0001);expect(result.loops).toEqual([]);
});

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
  m.frame++;m.gapFlight.active=false;sound.play('landing');sound.update(ctx,true);
  await new Promise(resolve=>setTimeout(resolve,90));
  const landed={loops:[...sound.stats.loops],cue:sound.stats.history.at(-1),rms:rms()};
  await new Promise(resolve=>setTimeout(resolve,450));const tail=rms();
  sound.clear();await new Promise(resolve=>setTimeout(resolve,120));
  const stopped={loops:[...sound.stats.loops],rms:rms(),speaking:sound.speech.stats.speaking};
  sound.dispose();await ctx.close();return{active,landed,tail,stopped};
 });
 expect(result.active.ready).toBe(true);expect(result.active.error).toBe(null);
 expect(result.active.history.map(e=>e.name)).toEqual(['flight','air']);expect(result.active.history.every(e=>e.sampled)).toBe(true);
 expect(result.active.loops).toEqual(['air']);expect(result.active.rms).toBeGreaterThan(.005);
 expect(result.landed.loops).toEqual([]);expect(result.landed.cue).toMatchObject({name:'landing',clip:'landing',sampled:true});expect(result.landed.rms).toBeGreaterThan(.003);expect(result.tail).toBeLessThan(.0001);
 expect(result.stopped.loops).toEqual([]);expect(result.stopped.speaking).toBe(false);expect(result.stopped.rms).toBeLessThan(.00001);
});

test('Super Saiyan plays one full power-up burst over the aura, separate from Kamehameha speech',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Sound on|Mute/}).click();
 const result=await page.evaluate(async()=>{
  const {createKiSound}=await import('/engine/ki-sound.js');const ctx=new AudioContext();await ctx.resume();
  const m={frame:0,options:{enabled:true,superSaiyan:false},gokuActive:true,canAttack:true,powerCharge:60,action:{kind:'focus'},charging:false,charge:0};
  const sound=createKiSound(m);sound.update(ctx,true);await sound.ready;await sound.speech.ready;sound.clear();sound.stats.history=[];
  sound.update(ctx,true);const focus=[...sound.stats.loops];
  m.frame++;m.options.superSaiyan=true;m.action={kind:'transform'};sound.play('transform');sound.update(ctx,true);
  await new Promise(r=>setTimeout(r,200));m.frame+=12;sound.play('powerBurst');sound.update(ctx,true);
  const analyser=ctx.createAnalyser();analyser.fftSize=2048;sound.connect(analyser);
  await new Promise(r=>setTimeout(r,600));m.frame+=36;m.action=null;sound.update(ctx,true);
  await new Promise(r=>setTimeout(r,450));
  const samples=new Float32Array(2048);analyser.getFloatTimeDomainData(samples);
  const body=Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length),history=[...sound.stats.history],speech=sound.speech.stats.speaking;
  m.frame++;m.options.superSaiyan=false;m.action={kind:'revert'};sound.play('revert');sound.update(ctx,true);
  await new Promise(r=>setTimeout(r,650));analyser.getFloatTimeDomainData(samples);
  const reverted=Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length),loops=[...sound.stats.loops];
  sound.dispose();await ctx.close();return{focus,body,history,speech,reverted,loops};
 });
 expect(result.focus).toEqual(['charge','aura']);expect(result.history.filter(e=>e.name==='transform')).toHaveLength(1);
 expect(result.history.find(e=>e.name==='transform').sampled).toBe(true);expect(result.body).toBeGreaterThan(.01);
 expect(result.history.filter(e=>e.name==='powerBurst')).toHaveLength(1);expect(result.history.find(e=>e.name==='powerBurst').sampled).toBe(true);
 expect(result.speech).toBe(false);expect(result.loops).toEqual([]);expect(result.reverted).toBeLessThan(.0001);
});
