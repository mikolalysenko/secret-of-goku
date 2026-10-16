// Generic scene harness. Each catalogued scene can be loaded and debugged:
//   SCENE=goblin-pot npx playwright test tests/browser/scenes.spec.mjs
//   SCENE=chapter:frieza-arc …   SCENE=all …   (or: node tools/scenes/cli.mjs test <id>)
// Without SCENE only the catalog/viewer smoke tests run. Scenes marked
// `fixture` restore .local/graphics-audit/party.json (a private mid-game
// party) when it exists, and otherwise fall back to their quick start.
import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {launchPlan,launchable} from '../../engine/scene-launcher.js';

const catalog=JSON.parse(readFileSync('engine/scene-catalog.json','utf8'));
const rom='.local/rom/secret-of-mana-us.sfc',fixture=process.env.SCENE_FIXTURE??'.local/graphics-audit/party.json';
const wanted=(process.env.SCENE??'').split(',').map(s=>s.trim()).filter(Boolean);
const selected=catalog.scenes.filter(s=>s.kind!=='chapter'&&launchable(launchPlan(s))&&wanted.some(w=>w==='all'||w===s.id||w===`chapter:${s.chapter}`));

test('every catalogued scene is valid linked data and the viewer enumerates it',async({page})=>{
  test.skip(!existsSync(rom),'Requires the private ROM.');
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/scenes.html');
  await page.waitForFunction(()=>window.sceneViewer?.ready,{},{timeout:60000});
  const summary=await page.evaluate(()=>window.sceneViewer.summary());
  expect(summary.problems).toEqual([]);
  expect(summary.curated).toBe(summary.catalog);
  expect(summary.uncovered).toEqual({cutscene:0,script:0,reward:0});
  await page.locator('#scene-search').fill('frieza');
  await expect(page.locator('#scene-tree [data-iri="scene:frieza-entrance"]')).toBeVisible();
  await page.locator('#scene-tree [data-iri="scene:frieza-entrance"]').click();
  await expect(page.locator('#detail h2')).toContainText('steals the Dragon Balls');
  await page.locator('#detail [data-iri="event:a8"]').first().click();
  await expect(page.locator('#detail h2')).toContainText('event:a8');
  expect(errors).toEqual([]);
  await page.close();
});

// One browser context for the whole batch: quick starts built from the ROM
// are cached in its IndexedDB, so only the first scene per base pays for the
// opening. A failing test restarts the worker and simply rebuilds the cache.
let shared=null;
test.afterAll(async()=>{await shared?.close();shared=null;});
for(const scene of selected)test(`scene ${scene.id}: ${scene.title}`,async({browser})=>{
  test.skip(!existsSync(rom),'Requires the private ROM.');
  test.setTimeout(420000);
  shared??=await browser.newContext();
  const page=await shared.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const useFixture=scene.launch?.fixture&&existsSync(fixture);
  if(useFixture){
    await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
    await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);mana.run(3);},JSON.parse(readFileSync(fixture)));
    await page.evaluate(id=>mana.scenes.launch(id,{base:'current',play:false}),scene.id);
  }else{
    await page.goto(`/?scene=${scene.id}`);
    await page.waitForFunction(()=>window.mana?.scenes?.status&&!window.mana.scenes.status.running,{},{timeout:400000});
  }
  const status=await page.evaluate(()=>{mana.pause();return mana.scenes.status;});
  expect(status.error??null,JSON.stringify(status)).toBe(null);
  // Let a requested event play out (mashing B through prose) until the
  // field is controllable again, then check the recipe's expectations.
  const expectation=scene.launch?.expect??{};
  const result=await page.evaluate(async({expectation,requested,id,launched})=>{
    const m=mana.mod;let frames=0;
    // Trace what actually executes: native events via the interpreter
    // pointer, relocated mod scripts via story.lastEvent.
    const [{eventAtPointer},{graph}]=await Promise.all([import('/engine/scene-graph.js'),mana.scenes.graph()]),seen=new Set(launched);
    const sample=()=>{
      if(mana.read8(0xd0)){const e=eventAtPointer(graph,mana.read8(0xd1)|mana.read8(0xd2)<<8|mana.read8(0xd3)<<16);if(e!==null)seen.add(e);}
      for(const id of m.story.status.recentEvents??[m.story.status.lastEvent])if(id!=null)seen.add(id);
    };
    sample();
    if(requested)for(;frames<12000;frames+=20){
      for(let i=0;i<20;i+=4){mana.run(4,[11]);sample();}
      if(mana.fastForward.state(1<<11).choice){mana.run(4,[7]);mana.run(16);}
      const flags=Object.entries(expectation.flag??{});
      if(frames>60&&m.canAttack&&flags.every(([k,v])=>mana.read8(0xcf00+parseInt(k,16))>=v))break;
    }
    // Scene events, plus those of scenes it flows into via `next`.
    const scene=graph.get(`scene:${id}`),own=new Set();
    for(const s of[scene,...scene.links.filter(l=>l.rel==='next').map(l=>graph.get(l.to))])for(const l of s.links)if(l.rel==='contains')own.add(l.to);
    const ran=[...seen].map(e=>`event:${e.toString(16)}`);
    return{frames,ran,ranScene:ran.some(e=>own.has(e)),map:m.status.map,canAttack:m.canAttack,lastEvent:m.story.status.lastEvent,error:m.story.status.error,
      flags:Object.fromEntries(Object.keys(expectation.flag??{}).map(k=>[k,mana.read8(0xcf00+parseInt(k,16))]))};
  },{expectation,requested:!!status.requested,id:scene.id,launched:status.ran??[]});
  await page.evaluate(()=>{const p=document.querySelector('#native-pause');if(p)p.hidden=true;});
  await page.locator('#screen').screenshot({path:test.info().outputPath(`${scene.id}.png`)});
  await test.info().attach('scene-status',{body:JSON.stringify({status,result},null,2),contentType:'application/json'});
  expect(result.error,JSON.stringify(result)).toBe(null);
  if(expectation.map!==undefined)expect(result.map,JSON.stringify(result)).toBe(expectation.map);
  for(const[k,v]of Object.entries(expectation.flag??{}))expect(result.flags[k],`flag ${k} ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(v);
  if(scene.launch?.event!==undefined&&expectation.event!==false)expect(status.requested,JSON.stringify(status)).toBe(true);
  // A requested event must actually execute something the scene owns.
  if(status.requested&&expectation.ran!==false)expect(result.ranScene,`ran ${result.ran.join(' ')}`).toBe(true);
  expect(errors).toEqual([]);
  await page.close();
});
