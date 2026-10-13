import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
async function load(page){
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(fixture),'Requires local ROM and native party fixture.');
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
 await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(fixture,'utf8')));
}
test('icon-only controls fit small phones, portrait and landscape without covering the game',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/local-rom',route=>route.fulfill({status:404,body:'No ROM'}));await page.goto('/');
 await expect(page.locator('.touch-pad')).toBeVisible();
 for(const viewport of[{width:390,height:844},{width:844,height:390},{width:320,height:568}]){
  await page.setViewportSize(viewport);
  const state=await page.evaluate(()=>{
   const buttons=[...document.querySelectorAll('.touch-pad button')],canvas=document.querySelector('#screen').getBoundingClientRect();
   return{fits:document.documentElement.scrollWidth<=innerWidth,text:buttons.map(b=>b.textContent.trim()).join(''),buttons:buttons.map(b=>{const r=b.getBoundingClientRect();return{label:b.getAttribute('aria-label'),width:r.width,height:r.height,overlaps:r.left<canvas.right&&r.right>canvas.left&&r.top<canvas.bottom&&r.bottom>canvas.top};}),selection:getComputedStyle(document.querySelector('.touch-pad')).userSelect};
  });
  expect(state.fits).toBe(true);expect(state.text).toBe('');expect(state.selection).toBe('none');
  for(const button of state.buttons){expect(button.label).toBeTruthy();expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(36);expect(button.overlaps).toBe(false);}
 }
 await page.screenshot({path:'.local/flight-fixes/mobile-small.png'});expect(errors).toEqual([]);await context.close();
});
test('multitouch can move, slide diagonally and charge together; cancellation never fires a wave',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage();await load(page);
 const session=await context.newCDPSession(page),center=async selector=>{const r=await page.locator(selector).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};};
 const attack=await center('[data-snes="0"]'),left=await center('[data-snes="6"]'),pad=await page.locator('.touch-directions').boundingBox();
 const start=await page.evaluate(()=>({x:mana.mod.status.x,beams:mana.logs.filter(l=>l.startsWith('Kamehameha')).length}));
 const send=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1,radiusX:4,radiusY:4,force:1}))});
 await send('touchStart',[attack,left]);await expect.poll(()=>page.evaluate(()=>mana.mod.charge)).toBeGreaterThan(20);
 expect(await page.evaluate(()=>mana.mod.status.x)).toBeLessThan(start.x);
 await send('touchMove',[attack,{x:pad.x+8,y:pad.y+8}]);
 await expect.poll(()=>page.evaluate(()=>mana.controls.has(4)&&mana.controls.has(6)&&mana.controls.has(0))).toBe(true);
 await send('touchCancel',[]);await expect.poll(()=>page.evaluate(()=>mana.mod.charging)).toBe(false);
 expect(await page.evaluate(()=>mana.logs.filter(l=>l.startsWith('Kamehameha')).length)).toBe(start.beams);
 expect(await page.evaluate(()=>String(getSelection()))).toBe('');
 await send('touchStart',[attack]);await expect.poll(()=>page.evaluate(()=>mana.mod.charge)).toBe(90);await send('touchEnd',[]);
 await expect.poll(()=>page.evaluate(()=>mana.logs.filter(l=>l.startsWith('Kamehameha')).length)).toBe(start.beams+1);
 await context.close();
});
test('standard gamepad drives charge, movement, menus, transformation and pause; disconnect cancels charge',async({page})=>{
 await page.addInitScript(()=>{
  window.testPad={buttons:[],axes:[0,0],connected:true};
  Object.defineProperty(navigator,'getGamepads',{value:()=>testPad.connected?[{index:0,id:'Browser test controller',mapping:'standard',connected:true,axes:[...testPad.axes],buttons:Array.from({length:17},(_,i)=>({pressed:testPad.buttons.includes(i),value:testPad.buttons.includes(i)?1:0}))}]:[]});
 });
 await load(page);await page.evaluate(()=>mana.play());
 await expect(page.locator('#gamepad-status')).toHaveText('Controller connected');
 // Let the neutral snapshot rearm the controller after restoring a checkpoint.
 await expect.poll(()=>page.evaluate(()=>mana.gamepads.pads.get(0)?.blocked)).toBe(false);
 const x=await page.evaluate(()=>mana.mod.status.x);
 await page.evaluate(()=>{testPad.buttons=[0];testPad.axes=[-.8,0];});
 await expect.poll(()=>page.evaluate(()=>mana.mod.charge)).toBeGreaterThan(15);expect(await page.evaluate(()=>mana.mod.status.x)).toBeLessThan(x);
 await page.evaluate(()=>{testPad.buttons=[];testPad.axes=[0,0];});await expect.poll(()=>page.evaluate(()=>mana.logs.some(l=>l.startsWith('Kamehameha')))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>mana.mod.action)).toBe(null);
 await page.evaluate(()=>testPad.buttons=[5]);await expect.poll(()=>page.evaluate(()=>mana.mod.options.superSaiyan)).toBe(true);await page.evaluate(()=>testPad.buttons=[]);
 await expect.poll(()=>page.evaluate(()=>mana.mod.action)).toBe(null);
 await page.evaluate(()=>testPad.buttons=[1]);await expect.poll(()=>page.evaluate(()=>mana.read8(0xec)&8)).not.toBe(0);await page.evaluate(()=>testPad.buttons=[]);
 await expect.poll(()=>page.evaluate(()=>mana.controls.has(1))).toBe(false);await page.evaluate(()=>testPad.buttons=[1]);await expect.poll(()=>page.evaluate(()=>mana.read8(0xec)&8)).toBe(0);await page.evaluate(()=>testPad.buttons=[]);
 await page.evaluate(()=>testPad.buttons=[11]);await expect.poll(()=>page.evaluate(()=>mana.running)).toBe(false);await page.evaluate(()=>testPad.buttons=[]);
 await expect.poll(()=>page.evaluate(()=>mana.gamepads.pads.get(0)?.blocked)).toBe(false);await page.evaluate(()=>testPad.buttons=[9]);await expect.poll(()=>page.evaluate(()=>mana.running)).toBe(true);await page.evaluate(()=>testPad.buttons=[]);
 await expect.poll(()=>page.evaluate(()=>mana.mod.canAttack)).toBe(true);const beams=await page.evaluate(()=>mana.logs.filter(l=>l.startsWith('Kamehameha')).length);
 await page.evaluate(()=>testPad.buttons=[0]);await expect.poll(()=>page.evaluate(()=>mana.mod.charging)).toBe(true);await page.evaluate(()=>testPad.connected=false);
 await expect.poll(()=>page.evaluate(()=>mana.mod.charging)).toBe(false);expect(await page.evaluate(()=>mana.logs.filter(l=>l.startsWith('Kamehameha')).length)).toBe(beams);
});
