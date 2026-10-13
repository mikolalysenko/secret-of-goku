import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';

test('GOKU title and full NASIR / ChatGPT credit retain native fades and menu transitions',async({page})=>{
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the local US ROM.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.waitForFunction(()=>window.mana?.ready);
  const result=await page.evaluate(()=>{
    mana.pause();mana.run(960);const state=mana.snapshot();
    mana.title.enabled=false;mana.run(1);const original=mana.pixels.slice(),vram=mana.hash(mana.snes.ppu.vram),cgram=mana.hash(mana.snes.ppu.cgram);
    mana.restore(state);mana.title.enabled=true;mana.run(1);
    let logo=0,credit=0,outside=0;
    for(let i=0;i<original.length;i+=4){
      if(original.subarray(i,i+3).every((value,c)=>value===mana.pixels[i+c]))continue;
      const x=(i/4%512)>>1,y=Math.floor(i/4/512/2)-7;
      if(x>=143&&x<192&&y>=56&&y<104)logo++;
      else if(y>=136&&y<144)credit++;
      else outside++;
    }
    const full={logo,credit,outside,active:mana.title.active,visible:mana.title.creditVisible,vram:mana.hash(mana.snes.ppu.vram)===vram,cgram:mana.hash(mana.snes.ppu.cgram)===cgram};
    // The pinned core maps brightness 0 to RGB 0..3. Both additions must use
    // this native fade, rather than retaining their full-brightness colors.
    mana.snes.ppu.brightness=0;
    for(let line=0;line<=225;line++)mana.snes.ppu.renderLine(line);
    mana.render();const dark=mana.pixels.every((n,i)=>i%4===3||n<=3);
    mana.restore(state);mana.run(2,[3]);mana.run(180);
    return{...full,dark,menuMode:mana.snes.ppu.mode,titleInMenu:mana.title.active};
  });
  expect(result.logo).toBeGreaterThan(1000);expect(result.credit).toBeGreaterThan(1000);expect(result.outside).toBe(0);
  expect(result.active&&result.visible&&result.vram&&result.cgram).toBe(true);expect(result.dark).toBe(true);
  expect(result.menuMode).toBe(5);expect(result.titleInMenu).toBe(false);expect(errors).toEqual([]);
});
