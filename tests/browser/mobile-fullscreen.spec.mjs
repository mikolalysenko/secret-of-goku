import {test,expect} from '@playwright/test';

async function load(page){
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);await page.evaluate(()=>mana.pause());
}
async function expectFits(page){
 const view=await page.evaluate(()=>{
  const screen=document.querySelector('#screen').getBoundingClientRect();
  const buttons=[...document.querySelectorAll('.touch-pad button,#native-fullscreen,.player-actions button')].filter(b=>b.getClientRects().length);
  const player=document.querySelector('.player');
  return{
   ratio:screen.width/screen.height,screenVisible:screen.top>=0&&screen.bottom<=innerHeight,
   overflow:player.scrollHeight>player.clientHeight||document.documentElement.scrollWidth>innerWidth,
   controls:buttons.map(b=>{const r=b.getBoundingClientRect();return{
    name:b.getAttribute('aria-label')||b.textContent,size:Math.min(r.width,r.height),
    visible:r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
    overlap:r.left<screen.right&&r.right>screen.left&&r.top<screen.bottom&&r.bottom>screen.top,
   };}),
  };
 });
 expect(view.ratio).toBeCloseTo(8/7,2);expect(view.screenVisible).toBe(true);expect(view.overflow).toBe(false);
 expect(view.controls.length).toBeGreaterThanOrEqual(15);
 for(const c of view.controls){expect(c.size,c.name).toBeGreaterThanOrEqual(44);expect(c.visible,c.name).toBe(true);expect(c.overlap,c.name).toBe(false);}
}

for(const mode of ['missing','denied','no-event','pending']){
 test(`expanded view works with a ${mode} fullscreen API and exits immediately`,async({page})=>{
  await load(page);await page.setViewportSize({width:320,height:480});
  await expect.poll(()=>page.locator('.player').evaluate(el=>Number.parseFloat(el.style.getPropertyValue('--viewport-height')))).toBe(480);
  const before=await page.locator('#screen').boundingBox();
  await page.locator('.player').evaluate((el,mode)=>{
   el.webkitRequestFullscreen=undefined;
   el.requestFullscreen=mode==='missing'?undefined:mode==='denied'?()=>Promise.reject(Error('Denied')):mode==='pending'?()=>new Promise(()=>{}):()=>Promise.resolve();
  },mode);
  await page.getByRole('button',{name:'Expand game',exact:true}).tap();
  await expect(page.locator('.player')).toHaveClass(/is-expanded/);
  await expect(page.locator('#native-fullscreen')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('header>a')).toHaveCount(2);
  for(const link of await page.locator('header>a').all())await expect(link).toBeHidden();
  await expectFits(page);
  const after=await page.locator('#screen').boundingBox();expect(after.height).toBeGreaterThan(before.height*1.2);
  await page.getByRole('button',{name:'Exit expanded view',exact:true}).tap();
  await expect(page.locator('.player')).not.toHaveClass(/is-expanded/);
  await expect(page.locator('html')).not.toHaveClass(/player-expanded/);
  await expect(page.locator('#native-fullscreen')).toHaveAttribute('aria-pressed','false');
  await expect(page.getByRole('link',{name:'Star on GitHub'})).toBeVisible();
 });
}

test('expanded game and both control pages fit phone rotation and safe areas',async({page})=>{
 await load(page);await page.locator('.player').evaluate(el=>{el.requestFullscreen=undefined;el.webkitRequestFullscreen=undefined;});
 await page.getByRole('button',{name:'Expand game',exact:true}).tap();
 for(const viewport of [{width:320,height:480},{width:390,height:640},{width:430,height:740},{width:568,height:320},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  await expect.poll(()=>page.locator('.player').evaluate(el=>Number.parseFloat(el.style.getPropertyValue('--viewport-height')))).toBe(viewport.height);
  await expectFits(page);
  await page.getByRole('button',{name:'More controls',exact:true}).tap();await expectFits(page);
  await page.locator('#touch-more [data-action="more"]').tap();
  await page.locator('.player').evaluate(el=>{el.style.setProperty('--safe-top','20px');el.style.setProperty('--safe-bottom','24px');});
  await expectFits(page);
  await page.locator('.player').evaluate(el=>{el.style.removeProperty('--safe-top');el.style.removeProperty('--safe-bottom');});
 }
 await page.keyboard.press('Escape');await expect(page.locator('.player')).not.toHaveClass(/is-expanded/);
});

test('prefixed Safari fullscreen and browser-initiated exit use the expanded layout',async({page})=>{
 await load(page);
 await page.locator('.player').evaluate(el=>{
  let active=null;
  Object.defineProperty(document,'webkitFullscreenElement',{configurable:true,get:()=>active});
  el.requestFullscreen=undefined;
  el.webkitRequestFullscreen=()=>{active=el;document.dispatchEvent(new Event('webkitfullscreenchange'));};
  document.webkitExitFullscreen=()=>{active=null;document.dispatchEvent(new Event('webkitfullscreenchange'));};
  document.exitFullscreen=undefined;
 });
 await page.getByRole('button',{name:'Expand game',exact:true}).tap();await expectFits(page);
 await page.getByRole('button',{name:'Exit expanded view',exact:true}).tap();
 expect(await page.evaluate(()=>document.webkitFullscreenElement)).toBe(null);
 await page.getByRole('button',{name:'Expand game',exact:true}).tap();
 await page.evaluate(()=>document.webkitExitFullscreen());
 await expect(page.locator('.player')).not.toHaveClass(/is-expanded/);
 await expect(page.locator('#native-fullscreen')).toHaveAttribute('aria-pressed','false');
});

test('a native fullscreen request completing after Exit immediately leaves fullscreen',async({page})=>{
 await load(page);
 await page.locator('.player').evaluate(el=>{
  let active=null;
  Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>active});
  el.requestFullscreen=()=>new Promise(resolve=>{window.finishFullscreen=()=>{active=el;document.dispatchEvent(new Event('fullscreenchange'));resolve();};});
  document.exitFullscreen=async()=>{active=null;document.dispatchEvent(new Event('fullscreenchange'));};
 });
 await page.getByRole('button',{name:'Expand game',exact:true}).tap();
 await page.getByRole('button',{name:'Exit expanded view',exact:true}).tap();
 await page.evaluate(()=>window.finishFullscreen());
 expect(await page.evaluate(()=>document.fullscreenElement)).toBe(null);
 await expect(page.locator('.player')).not.toHaveClass(/is-expanded/);
 await expect(page.locator('#native-fullscreen')).toHaveAttribute('aria-pressed','false');
});

test('an iPhone Home Screen launch starts in the expanded game view',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 await load(page);
 await expect(page.locator('.player')).toHaveClass(/is-expanded/);await expectFits(page);
 await page.getByRole('button',{name:'Exit expanded view',exact:true}).tap();
 await expect(page.locator('.player')).not.toHaveClass(/is-expanded/);
});
