import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

test.setTimeout(180000);
test('weaker Fortress waves visibly deflect, keep flight intact, and do not repeat the banter',async({page})=>{
  const path='.local/juice-research/flight/request-flight.json';
  test.skip(!existsSync(path)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and flight fixture.');
  await page.goto('/');await page.waitForFunction(()=>mana.ready);
  await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true});mana.mod.radio.restore({firstFlight:true});mana.write8(0xf8,190);mana.run(10);window.flightBaseline=mana.snapshot();document.querySelector('#native-pause').hidden=true;},JSON.parse(readFileSync(path)));
  for(const [superSaiyan,charge]of[[false,90],[true,44],[true,12]]){
    const result=await page.evaluate(({superSaiyan,charge})=>{
      mana.restore(flightBaseline);const m=mana.mod;m.options.superSaiyan=superSaiyan;
      for(let f=0;f<160&&m.charge<charge;f++){
        const dx=((mana.read16(0x128)-mana.read16(0xfa)+2048)&4095)-2048,dy=((mana.read16(0x12a)-mana.read16(0xfc)+2048)&4095)-2048;
        mana.write16(0xf6,Math.round(Math.atan2(-dx,-dy)*512/Math.PI)&1023);mana.run(1,[10,1]);
      }
      const charged=m.charge;mana.run(16);return{charged,state:m.worldKi.status,radio:m.radio.snapshot(),scars:m.worldScars.snapshot(),quest:m.quest.snapshot(),error:m.story.status.error};
    },{superSaiyan,charge});
    expect(result.charged).toBe(charge);expect(result.state).toMatchObject({fortressDestroyed:false,landingQueued:false,finaleQueued:false,explosion:null,cutaway:null,lastHit:null,shot:{hit:true,super:superSaiyan,target:{id:'mana-fortress'},deflected:{x:128}}});
    expect(result.radio.current.kind).toBe('fortress-shield');expect(result.radio.queue.filter(x=>x.kind==='fortress-shield')).toHaveLength(1);expect(result.error).toBe(null);
    await page.locator('#screen').screenshot({path:test.info().outputPath(`shield-${superSaiyan?'ssj':'base'}-${charge}.png`)});
    const replay=await page.evaluate(()=>{const saved=mana.snapshot();mana.run(14);const a={pixels:mana.hash(mana.pixels),ki:mana.mod.worldKi.snapshot()};mana.restore(saved);mana.run(14);return{same:a.pixels===mana.hash(mana.pixels)&&JSON.stringify(a.ki)===JSON.stringify(mana.mod.worldKi.snapshot()),flying:mana.mod.worldFlight};});
    expect(replay).toEqual({same:true,flying:true});
  }
  const reply=await page.evaluate(()=>{mana.run(230);return mana.mod.radio.status.current;});expect(reply.text).toBe('GOKU:Bet I could if I\ntried a bit harder.');
  await page.locator('#screen').screenshot({path:test.info().outputPath('goku-reply.png')});
});
