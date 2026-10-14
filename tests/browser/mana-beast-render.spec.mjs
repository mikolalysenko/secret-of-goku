import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

test.setTimeout(240000);
test('Mana Beast streamed animation never repeats into its empty Mode 7 sky',async({page})=>{
  const path='.local/graphics-audit/party.json';
  test.skip(!existsSync(path)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
  await page.goto('/');await page.waitForFunction(()=>mana.ready);
  await page.evaluate(s=>{
    mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:true});
    for(const base of[0xe200,0xe400])mana.snes.ram.fill(0,base,base+512);
    mana.mod.quest.restore({mask:127,seedMask:127});mana.mod.frieza.restore({stage:'defeated',stolen:false,permanent:true});
    mana.mod.radio.restore({firstFlight:true});mana.write8(0xcf4e,8);mana.mod.story.request(0x429);document.querySelector('#native-pause').hidden=true;
  },JSON.parse(readFileSync(path)));
  for(let i=0;i<60;i++){if(await page.evaluate(()=>mana.read16(0xdc)===253&&mana.mod.canAttack))break;await page.evaluate(()=>mana.run(100,[11]));}
  expect(await page.evaluate(()=>mana.mod.status)).toMatchObject({map:253,canAttack:true});
  await page.evaluate(()=>{
    window.beastBaseline=mana.snapshot();window.renderChecks={outside:0,bad:0,animated:0};
    const p=mana.snes.ppu,old=p.getMode7Pixel;
    p.getMode7Pixel=function(x,y,layer,priority){
      const value=old.call(this,x,y,layer,priority),rx=this.mode7FlipX?255-x:x,px=this.mode7Xcoords[rx]>>8,py=this.mode7Ycoords[rx]>>8;
      if(mana.read16(0xdc)===253&&this.mode7LargeField&&this.mode7Char0fill){
        if(px<0||px>=1024||py<0||py>=1024){
          const raw=this.vram[(py&7)*8+(px&7)]>>>8,expected=layer===1?(raw>>7)===priority?raw&127:0:raw;
          renderChecks.outside++;if(value!==expected)renderChecks.bad++;
        }else if(value&&layer===0)renderChecks.animated++;
      }
      return value;
    };
  });
  for(const action of['idle','beam','teleport','flight']){
    await page.evaluate(()=>{mana.restore(beastBaseline);mana.mod.radio.restore({firstFlight:true});});
    for(let f=0;f<1440;f+=120){
      await page.evaluate(({f,action})=>{
        const m=mana.mod;
        for(let j=0;j<120;j++){
          // Keep the native AI alive for two passes of its streamed art.
          if(m.read16(0xe782)<20000)m.write16(0xe782,65535);if(m.read16(0xe182)<400)m.write16(0xe182,999);
          const tick=f+j,buttons=action==='beam'&&tick%160<60?[10,1]:action==='teleport'&&tick%240===0?[10,0]:action==='flight'?[8,tick%160<80?6:7]:[];
          mana.run(1,buttons);
        }
      },{f,action});
    }
    await page.locator('#screen').screenshot({path:test.info().outputPath(`mana-beast-${action}.png`)});
    expect(await page.evaluate(()=>({map:mana.read16(0xdc),error:mana.mod.story.status.error,cuts:mana.mod.plants.completed.filter(c=>c.map===253).length}))).toEqual({map:253,error:null,cuts:0});
  }
  const counts=await page.evaluate(()=>renderChecks);expect(counts.outside).toBeGreaterThan(100000);expect(counts.animated).toBeGreaterThan(1000);expect(counts.bad).toBe(0);
  const replay=await page.evaluate(()=>{const s=mana.snapshot();mana.run(12);const hash=mana.hash(mana.pixels);mana.restore(s);mana.run(12);return hash===mana.hash(mana.pixels);});expect(replay).toBe(true);
});
