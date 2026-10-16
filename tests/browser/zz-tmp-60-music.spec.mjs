import {test} from '@playwright/test';
test.setTimeout(400000);
for(const preset of(process.env.PRESETS||'battle,orbit').split(','))test(`music ${preset}`,async({page})=>{
 await page.goto(`/?start=${preset}`);await page.waitForFunction(()=>mana.ready,{},{timeout:90000});
 await page.getByRole('button',{name:/Sound on|Mute/}).click();
 const r=await page.evaluate(async()=>{
  const m=mana.mod,score=mana.sound.music;mana.play?.();
  const ctx=await new Promise(res=>{const t=setInterval(()=>{const c=mana.sound.output?.context;if(c){clearInterval(t);res(c);}},50);});
  const an=ctx.createAnalyser();an.fftSize=2048;score.connect(an);
  const rms=()=>{const a=new Float32Array(2048);an.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);};
  const out=[];for(let i=0;i<+(window.SAMPLES||24);i++){await new Promise(r=>setTimeout(r,500));
   out.push({t:i/2,frame:m.frame,want:m.trial?.music??m.frieza?.music??null,stage:m.frieza?.status?.stage,scene:m.frieza?.snapshot?.().scene?.kind??null,track:score.stats.track,rms:+rms().toFixed(4),native:+mana.sound.nativeGain.toFixed(3),rendered:score.stats.rendered.join('|'),err:score.stats.error,map:m.status.map});}
  return out;
 });
 console.log(preset+'\n'+r.map(x=>JSON.stringify(x)).join('\n'));
});
