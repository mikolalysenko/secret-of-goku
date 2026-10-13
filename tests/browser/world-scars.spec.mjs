import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

test('an aerial town blast apologizes and its native-art crater survives travel and checkpoints',async({page})=>{
  test.setTimeout(90000);const file='.local/juice-research/flight/request-flight.json';
  test.skip(!existsSync(file)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and flight fixture.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>mana.ready);
  const result=await page.evaluate(s=>{
    mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);const m=mana.mod;
    Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});m.radio.restore({firstFlight:true});
    mana.write8(0xcf4e,9);mana.write8(0xe3,64);mana.write8(0xf8,190);
    // Fly south from Potos, then aim back at the village. Its native texture
    // rows stream normally while travelling to the firing position.
    mana.write16(0xf6,512);mana.run(90,[4]);mana.write16(0xf6,0);mana.run(10);
    mana.run(75,[0]);const target=m.worldKi.aim();mana.run(1);const firing=mana.snapshot();mana.run(110);
    const expected=JSON.stringify(m.worldKi.snapshot());let shotReplay=true;
    for(let i=0;i<2;i++){mana.restore(firing);mana.run(110);shotReplay&&=JSON.stringify(m.worldKi.snapshot())===expected;}
    const scars=m.worldScars.status,radio=m.radio.snapshot(),saved=mana.snapshot();
    mana.run(1);const crater=mana.hash(mana.pixels);mana.restore(saved);m.worldScars.restore();mana.run(1);const intact=mana.hash(mana.pixels);
    mana.restore(saved);mana.run(1);const replay=mana.hash(mana.pixels)===crater;
    mana.run(100,[7,4]);mana.run(50,[6]);const travelled=m.worldScars.status;
    mana.restore(saved);return{target,scars,radio,replay,shotReplay,different:crater!==intact,travelled,restored:m.worldScars.status};
  },JSON.parse(readFileSync(file)));
  expect(result.target.id).toMatch(/^town-/);expect(result.scars.length).toBeGreaterThan(0);
  expect(JSON.stringify(result.radio)).toContain('wish');expect(result.different).toBe(true);expect(result.replay).toBe(true);
  expect(result.shotReplay).toBe(true);
  expect(result.travelled).toEqual(result.scars);expect(result.restored).toEqual(result.scars);expect(errors).toEqual([]);
});
