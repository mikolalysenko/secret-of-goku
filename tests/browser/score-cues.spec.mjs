import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
test.setTimeout(120000);
// The live player's own sound bus, not a standalone renderer: each preset
// must reach its Mana-instrument arrangement and duck the native soundtrack.
for(const[preset,track,where]of[['frieza','arrival','Frieza and Thanatos trial cutscene'],['battle','battle','Fortress deck battle'],['space','orbit','orbital battle'],['trial','vegeta','Vegeta entrance and training fight']])
test(`${where} plays the ${track} arrangement in game`,async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/?start=${preset}`);await page.waitForFunction(()=>mana.ready,{},{timeout:90000});
 await page.getByRole('button',{name:/Sound on|Mute/}).click();
 const result=await page.evaluate(async()=>{
  const score=mana.sound.music;mana.play?.();
  for(let i=0;i<100&&!(score.stats.track&&mana.sound.nativeGain<.05);i++)await new Promise(r=>setTimeout(r,100));
  const ctx=mana.sound.output.context,analyser=ctx.createAnalyser();analyser.fftSize=2048;score.connect(analyser);
  await new Promise(r=>setTimeout(r,600));
  const a=new Float32Array(2048);analyser.getFloatTimeDomainData(a);
  return{want:mana.mod.trial?.music??mana.mod.frieza.music,track:score.stats.track,native:mana.sound.nativeGain,rms:Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),error:score.stats.error};
 });
 expect(result).toMatchObject({want:track,track,error:null});
 expect(result.native).toBeLessThan(.05);expect(result.rms).toBeGreaterThan(.005);expect(errors).toEqual([]);
});
