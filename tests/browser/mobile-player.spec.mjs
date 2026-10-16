import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';

test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:640}});
async function load(page){
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires local ROM.');
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);await page.evaluate(()=>mana.pause());
}
async function layout(page){
 return page.evaluate(()=>{
  const screen=document.querySelector('#screen').getBoundingClientRect();
  const buttons=[...document.querySelectorAll('.touch-pad button')].filter(b=>b.getClientRects().length);
  return{
   overflow:document.documentElement.scrollWidth>innerWidth,
   ratio:screen.width/screen.height,
   controls:buttons.map(b=>{const r=b.getBoundingClientRect();return{
    name:b.getAttribute('aria-label'),size:Math.min(r.width,r.height),
    visible:r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
    overlap:r.left<screen.right&&r.right>screen.left&&r.top<screen.bottom&&r.bottom>screen.top,
   };}),
  };
 });
}
async function expectLayout(page,controlCount=14){
 const view=await layout(page);expect(view.overflow).toBe(false);expect(view.ratio).toBeCloseTo(8/7,2);
 expect(view.controls).toHaveLength(controlCount);
 for(const control of view.controls){expect(control.size,control.name).toBeGreaterThanOrEqual(44);expect(control.visible,control.name).toBe(true);expect(control.overlap,control.name).toBe(false);}
}

test('public loader has one file chooser, a GitHub star link, and no debug UI',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/(local-rom|rom\/secret-of-mana-us\.sfc)$/,route=>route.fulfill({status:404,body:'No ROM'}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Choose ROM',exact:true})).toBeEnabled();
 await expect(page.locator('.touch-pad')).toBeHidden();await expect(page.locator('.player-actions')).toBeHidden();
 await expect(page.getByRole('link',{name:'Star on GitHub'})).toHaveAttribute('href','https://github.com/mikolalysenko/secret-of-goku');
 await expect(page.getByRole('link',{name:'Star on GitHub'})).toHaveAttribute('rel','noopener noreferrer');
 await page.getByText('Controls & game options',{exact:true}).tap();
 await expect(page.getByText('Developer tools',{exact:true})).toBeHidden();await expect(page.getByText('Test scenes',{exact:true})).toBeHidden();
 await expect(page.locator('#build-id')).toBeHidden();await expect(page.locator('#lab-message')).toBeHidden();
 await page.locator('#rom-file').setInputFiles({name:'wrong.sfc',mimeType:'application/octet-stream',buffer:Buffer.alloc(1024)});
 await expect(page.locator('#boot-status')).toContainText('original Secret of Mana (USA) ROM');
 await expect(page.getByRole('button',{name:'Choose ROM',exact:true})).toBeEnabled();
 expect(errors).toEqual([]);
});

test('both control pages fit short portrait and landscape webviews, including safe areas',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
 for(const viewport of [{width:320,height:480},{width:390,height:640},{width:430,height:740},{width:568,height:320},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  await expect.poll(()=>page.evaluate(()=>Number.parseFloat(document.querySelector('.player').style.getPropertyValue('--viewport-height')))).toBe(viewport.height);
  await expectLayout(page);await expect(page.getByRole('button',{name:'Warp: Instant Transmission',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'More controls',exact:true}).tap();await expect(page.locator('#touch-more')).toBeVisible();await expectLayout(page,12);
  await page.locator('#touch-more [data-action="more"]').tap();await expect(page.locator('#touch-main')).toBeVisible();
 }
 await page.setViewportSize({width:390,height:640});
 await page.locator('.player').evaluate(el=>{el.style.setProperty('--safe-top','20px');el.style.setProperty('--safe-bottom','24px');});
 await expectLayout(page);expect(errors).toEqual([]);
});

test('denied fullscreen falls back to an expanded player and exits cleanly',async({page})=>{
 await load(page);await page.setViewportSize({width:320,height:480});
 await page.locator('.player').evaluate(el=>{el.requestFullscreen=()=>Promise.reject(new Error('Webview does not allow fullscreen'));});
 await page.getByRole('button',{name:'Expand game',exact:true}).tap();
 await expect(page.locator('.player')).toHaveClass(/is-expanded/);await expect(page.locator('#native-fullscreen')).toHaveAttribute('aria-pressed','true');
 await expectLayout(page);
 await page.getByRole('button',{name:'Exit expanded view',exact:true}).tap();
 await expect(page.locator('.player')).not.toHaveClass(/is-expanded/);await expect(page.locator('html')).not.toHaveClass(/player-expanded/);
 await expect(page.locator('#native-fullscreen')).toHaveAttribute('aria-pressed','false');await expectLayout(page);
});

test('touch labels and game canvas suppress selection and callouts; resizing clears held input',async({page})=>{
 await load(page);
 const prevention=await page.evaluate(()=>['#screen','.touch-pad'].map(selector=>{
  const el=document.querySelector(selector),style=getComputedStyle(el);
  return{selection:style.userSelect||style.webkitUserSelect,touch:style.touchAction,context:!el.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true})),select:!el.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true}))};
 }));
 for(const surface of prevention)expect(surface).toEqual({selection:'none',touch:'none',context:true,select:true});
 await page.locator('[data-snes="22"]').dispatchEvent('pointerdown',{pointerId:91,button:0,pointerType:'touch'});
 expect(await page.evaluate(()=>mana.controls.has(22))).toBe(true);
 await page.setViewportSize({width:390,height:540});
 await expect.poll(()=>page.evaluate(()=>mana.controls.held.size)).toBe(0);
 await expect(page.locator('.touch-pad .is-held')).toHaveCount(0);
 await page.locator('[data-snes="22"]').dispatchEvent('pointerup',{pointerId:91,button:0,pointerType:'touch'});
 expect(await page.evaluate(()=>String(getSelection()))).toBe('');await expectLayout(page);
});

test('diagnostics require debug=true or a test-scene entry',async({page})=>{
 await page.route(/\/(local-rom|rom\/secret-of-mana-us\.sfc)$/,route=>route.fulfill({status:404,body:'No ROM'}));
 for(const [query,visible] of [['?debug=true',true],['?start=frieza',true],['?scene=frieza-entrance',true],['?debug=false',false],['?debug=1',false],['?scene=',false],['?start=unknown',false]]){
  await page.goto('/'+query);await page.waitForFunction(()=>window.mana);
  await expect(page.getByText('Test scenes',{exact:true})).toBeVisible({visible});await expect(page.locator('#build-id')).toBeVisible({visible});
  await page.getByText('Controls & game options',{exact:true}).tap();await expect(page.getByText('Developer tools',{exact:true})).toBeVisible({visible});
 }
});
