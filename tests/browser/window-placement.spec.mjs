import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';

// Jehk and Joch stand at the top of a camera-clamped room. Their dialogue
// window drops above the HUD instead of covering them, keeping the window's
// HDMA palette.
test('the dialogue window moves below speakers it would cover',async({page})=>{
  test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and fixture.');
  test.setTimeout(240000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
  await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);mana.run(3);},JSON.parse(readFileSync(fixture)));
  await page.evaluate(()=>mana.scenes.launch('joch-trial',{base:'current',play:false}));
  const result=await page.evaluate(()=>{
    mana.pause();const w=mana.mod.windowPlacement;let lowered=false,first=null,flips=0,shownTop=0;
    // Step every frame through the whole conversation: the placement is
    // decided before any window tile is shown and never changes mid-scene.
    for(let f=0;f<4000;f++){
      mana.run(1,f%45<4?[11]:[]);const s=w.status;
      if(s.open){if(first===null)first=s.lower;else if(s.lower!==first)flips++;if(!s.lower)shownTop++;lowered||=s.lower;}
      if(f>300&&mana.mod.canAttack&&!mana.read8(0xd0)&&!s.open)break;
    }
    return{lowered,decisions:w.status.decisions,flips,shownTop};
  });
  expect(result).toMatchObject({lowered:true,flips:0,shownTop:0});expect(result.decisions).toBe(1);
  expect(errors).toEqual([]);
});
