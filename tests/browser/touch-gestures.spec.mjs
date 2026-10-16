import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';

async function touchDriver(page){
 const session=await page.context().newCDPSession(page);
 const send=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1,radiusX:4,radiusY:4,force:1}))});
 const spread=async(start,end)=>{
  await send('touchStart',start);
  for(let step=1;step<=16;step++){
   await send('touchMove',start.map((p,i)=>({x:p.x+(end[i].x-p.x)*step/16,y:p.y+(end[i].y-p.y)*step/16})));
   // Let the browser's native gesture recognizer process actual touch motion.
   await page.waitForTimeout(20);
  }
  await send('touchEnd',[]);await page.waitForTimeout(200);
 };
 const pinch=(x,y)=>spread([{x:x-15,y},{x:x+15,y}],[{x:x-80,y},{x:x+80,y}]);
 return{send,spread,pinch};
}

test('real touches cannot select, pan or zoom the game, including overlays and gaps',async({browser})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires local ROM.');
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:640}});
 // Prove the same driver can trigger browser zoom when it is allowed.
 const control=await context.newPage();
 await control.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="height:1500px;background:linear-gradient(white,blue)">Pinch control</div>');
 await (await touchDriver(control)).pinch(195,120);
 expect(await control.evaluate(()=>visualViewport.scale)).toBeGreaterThan(1.2);await control.close();
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);await page.evaluate(()=>mana.pause());
 const touch=await touchDriver(page),stable=async()=>{
  expect(await page.evaluate(()=>({scale:visualViewport.scale,x:scrollX,y:scrollY,selection:String(getSelection()),held:mana.controls.held.size}))).toEqual({scale:1,x:0,y:0,selection:'',held:0});
 };
 for(const viewport of [{width:390,height:640},{width:568,height:320}]){
  await page.setViewportSize(viewport);
  await expect.poll(()=>page.evaluate(()=>parseFloat(document.querySelector('.player').style.getPropertyValue('--viewport-height')))).toBe(viewport.height);
  await page.evaluate(()=>mana.pause());
  const screen=await page.locator('#screen').boundingBox();
  // Pause overlay, then the playing canvas under it.
  await touch.pinch(screen.x+screen.width/2,screen.y+12);await stable();
  await page.getByRole('button',{name:'Resume game',exact:true}).tap();
  await touch.pinch(screen.x+screen.width/2,screen.y+12);await stable();
  const power=await page.getByRole('button',{name:'Power: Hold to charge ki / break stun',exact:true}).boundingBox(),x=power.x+power.width/2,y=power.y+power.height/2;
  const label=await page.locator('#touch-main [data-snes="10"] span').boundingBox(),text={x:label.x+label.width/2,y:label.y+label.height/2};
  // Hold past the long-press threshold, then double tap the button's label.
  await touch.send('touchStart',[text]);await page.waitForTimeout(1200);await touch.send('touchMove',[{x:text.x-70,y:text.y-30}]);await touch.send('touchEnd',[]);await stable();
  for(let tap=0;tap<2;tap++){await touch.send('touchStart',[text]);await touch.send('touchEnd',[]);await page.waitForTimeout(60);}await stable();
  await touch.pinch(x,y);await stable();
  const surface=await page.locator('.game-surface').boundingBox(),left=await page.locator('.touch-left').boundingBox();
  const outsideX=viewport.width>viewport.height?(left.x+left.width+screen.x)/2:(surface.x+screen.x)/2,outsideY=screen.y+screen.height/2;
  await touch.spread([{x:outsideX,y:outsideY-8},{x:outsideX,y:outsideY+8}],[{x:outsideX-5,y:outsideY-50},{x:outsideX+5,y:outsideY+50}]);await stable();
  // Start between buttons, where neither touch belongs to an action.
  const menu=await page.locator('#touch-main [data-snes="9"]').boundingBox(),fly=await page.locator('#touch-main [data-snes="8"]').boundingBox();
  const gapX=(menu.x+menu.width+fly.x)/2,gapY=menu.y+menu.height/2;
  await touch.spread([{x:gapX,y:gapY-8},{x:gapX,y:gapY+8}],[{x:gapX-65,y:gapY-35},{x:gapX+65,y:gapY+35}]);await stable();
  await touch.spread([{x:gapX,y:gapY}],[{x:gapX,y:gapY+80}]);await stable();
  await page.getByRole('button',{name:'More controls',exact:true}).tap();
  const ssj=await page.locator('#touch-more [data-snes="18"] span').boundingBox();
  for(let tap=0;tap<2;tap++){await touch.send('touchStart',[{x:ssj.x+ssj.width/2,y:ssj.y+ssj.height/2}]);await touch.send('touchEnd',[]);await page.waitForTimeout(60);}await stable();
  await page.locator('#touch-more [data-action="more"]').tap();
 }
 expect(errors).toEqual([]);await context.close();
});
