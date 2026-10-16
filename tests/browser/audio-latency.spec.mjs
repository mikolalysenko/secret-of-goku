import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {streamTiming} from '../../engine/audio-worklet.js';

test('streamed audio stays close to combat during repeated stalls, then clears on pause and restore',async({page})=>{
 const fixture='.local/graphics-audit/party.json';
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and field fixture');
 await page.goto('/?debug=1');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);mana.mod.radio.restore({});},JSON.parse(readFileSync(fixture)));
 await page.getByRole('button',{name:/Sound on|Mute/}).click();
 const result=await page.evaluate(async()=>{
  const m=mana.mod,out=mana.audioOutput;mana.play();
  for(let i=0;i<100&&!m.sound.stats.ready;i++)await new Promise(r=>setTimeout(r,20));
  if(!m.sound.stats.ready)throw Error('The real player audio bus did not start');
  const starts=[],update=m.sound.update;
  m.sound.update=function(ctx,audible,when){if(audible)starts.push({lead:when-ctx.currentTime,queued:out.queued});return update.call(this,ctx,audible,when);};
  const initial=out.stats.frames;
  try{
   for(let i=0;i<12;i++){
    await new Promise(r=>setTimeout(r,55));
    const end=performance.now()+75;while(performance.now()<end){}
    m.playSound('hit');
   }
   await new Promise(r=>setTimeout(r,200));
   const active={mode:out.stats.mode,underruns:out.stats.underruns,frames:out.stats.frames-initial,largestLead:Math.max(...starts.map(s=>s.lead)),queued:Math.max(...starts.map(s=>s.queued)),hits:m.sound.stats.history.filter(s=>s.name==='hit').length};
   mana.pause();const paused={queued:out.queued,loops:[...m.sound.stats.loops]};
   const saved=mana.snapshot();mana.play();await new Promise(r=>setTimeout(r,120));mana.restore(saved);
   const restored=out.queued;mana.pause();return{active,paused,restored};
  }finally{m.sound.update=update;mana.pause();}
 });
 await test.info().attach('audio-timing',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 expect(result.active.frames).toBeGreaterThan(40);expect(result.active.hits).toBeGreaterThan(3);
 // The streaming worklet trades a little latency for gap-free music: under
 // these 75 ms stalls its headroom grows, but never past its cap plus a frame.
 expect(result.active.mode).toBe('worklet');
 expect(result.active.largestLead).toBeLessThanOrEqual(streamTiming.maxTarget+.02);expect(result.active.queued).toBeLessThanOrEqual(11);
 expect(result.paused).toEqual({queued:0,loops:[]});expect(result.restored).toBe(0);
});
