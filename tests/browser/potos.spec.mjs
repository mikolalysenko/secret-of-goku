import {test,expect} from '@playwright/test';
test('Potos input, charged attack, ring, world flight, doors, and local save',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/prototype.html?debug=1');await page.getByRole('button',{name:'BEGIN ADVENTURE'}).click();
  const x=await page.evaluate(()=>__game.game.player.x);
  await page.keyboard.down('d');
  try{await expect.poll(()=>page.evaluate(()=>__game.game.player.x)).toBeGreaterThan(x+25);}
  finally{await page.keyboard.up('d');}
  await page.keyboard.press('j');await expect.poll(()=>page.evaluate(()=>__game.game.stats.punches)).toBe(1);
  await page.keyboard.down('j');await expect.poll(()=>page.evaluate(()=>__game.game.chargeFraction)).toBe(1);
  await expect(page.locator('#charge-hud')).toBeVisible();expect(await page.evaluate(()=>__game.game.stats.beams)).toBe(0);
  await page.keyboard.up('j');await expect.poll(()=>page.evaluate(()=>__game.game.stats.beams)).toBe(1);
  await page.keyboard.press('q');await expect(page.locator('#ring')).toBeVisible();await page.keyboard.press('1');
  await expect(page.locator('#form-name')).toHaveText('SUPER SAIYAN');
  await page.keyboard.press('f');await expect.poll(()=>page.evaluate(()=>__game.game.mode)).toBe('flight');
  await page.keyboard.press('3');await page.keyboard.press('h');await page.keyboard.press('f');
  await expect.poll(()=>page.evaluate(()=>__game.game.mode)).toBe('play');
  expect(await page.evaluate(()=>__game.game.breaks.map(b=>b.id))).toContain('gateFlight');
  // Position at a real door; E must transition through the public input path.
  await page.evaluate(()=>{const g=__game.game;g.enterMap('potos',296,637);});
  await page.keyboard.press('e');await expect.poll(()=>page.evaluate(()=>__game.game.map)).toBe('inn');
  await page.evaluate(()=>__game.save());await page.reload();await page.getByRole('button',{name:'Continue adventure'}).click();
  expect(await page.evaluate(()=>__game.game.map)).toBe('inn');await expect(page.locator('#form-name')).toHaveText('SUPER SAIYAN');
  await page.keyboard.press('Escape');await expect(page.locator('#modal')).toBeVisible();await page.getByRole('button',{name:'RESUME ADVENTURE'}).click();
  await expect(page.locator('#modal')).toBeHidden();expect(errors).toEqual([]);
});

test('dialogue, boss, and ending render without errors; mobile controls fit',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/prototype.html?debug=1');await page.getByRole('button',{name:'BEGIN ADVENTURE'}).click();
  await page.evaluate(()=>__game.game.talk('elder'));await expect(page.locator('#dialogue')).toBeVisible();
  for(let i=0;i<6;i++)await page.keyboard.press('e');expect(await page.evaluate(()=>__game.game.flags.metElder)).toBe(true);
  await page.evaluate(()=>__game.game.enterCave());for(let i=0;i<4;i++)await page.keyboard.press('e');
  await page.evaluate(()=>{const g=__game.game;g.player.x=227;g.player.y=225;g.player.facing='up';});
  await page.keyboard.down('j');await expect.poll(()=>page.evaluate(()=>__game.game.chargeFraction)).toBe(1);await page.keyboard.up('j');
  await expect.poll(()=>page.evaluate(()=>__game.game.flags.bossDefeated)).toBe(true);await expect(page.locator('#dialogue')).toBeVisible();
  for(let i=0;i<4;i++)await page.keyboard.press('e');expect(await page.evaluate(()=>__game.game.map)).toBe('potos');
  await page.evaluate(()=>__game.game.finishChapter('gate'));await expect(page.getByRole('heading',{name:'A legend. In record time.'})).toBeVisible();
  await page.getByRole('button',{name:'KEEP EXPLORING'}).click();await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Controls',exact:true}).click();await expect(page.getByRole('heading',{name:'A few small advantages.'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
