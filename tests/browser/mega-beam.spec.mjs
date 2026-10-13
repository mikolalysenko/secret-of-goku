import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
async function load(page,path){
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(path),'Requires the local ROM and native fixture.');
  await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
  await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:true});mana.run(3);},JSON.parse(readFileSync(path)));
}
test('full SSJ beam has a huge blue native-pixel footprint, sustains, hits real enemies and replays',async({page})=>{
  await load(page,'.local/animation-audit/native/rabite-field-a.json');
  const result=await page.evaluate(()=>{
    const saved=mana.snapshot(),shots=[];
    for(const full of[false,true]){
      mana.restore(saved);mana.run(1,[4]);mana.run(full?65:35,[10,1]);mana.run(1);mana.run(8);
      const m=mana.mod,e=m.effects.find(e=>e.kind==='beam'),pixels=m.spriteLayer.effectMask.reduce((s,p)=>s+p,0);
      shots.push({mega:e.mega,pixels,width:m.beamGeometry(e).halfWidth,hits:e.hits.slice()});
    }
    mana.run(25);const sustained=mana.mod.spriteLayer.plan?.sprite?.column;
    const middle=mana.snapshot();mana.run(8);const first=[mana.hash(mana.pixels),mana.hash(mana.snes.ram)];
    mana.restore(middle);mana.run(8);const replay=first[0]===mana.hash(mana.pixels)&&first[1]===mana.hash(mana.snes.ram);
    mana.run(40);return{shots,sustained,replay,finished:mana.mod.action===null};
  });
  expect(result.shots[0].mega).toBe(false);expect(result.shots[1].mega).toBe(true);
  expect(result.shots[1].pixels).toBeGreaterThan(result.shots[0].pixels*4);
  expect(result.shots[1].width).toBe(80);expect(result.shots[1].hits.length).toBeGreaterThan(0);
  expect(result.sustained).toBe(20);expect(result.replay).toBe(true);expect(result.finished).toBe(true);
});
test('the giant aerial beam stays blue and enormous at low and space-high Mode 7 altitudes',async({page})=>{
  await load(page,'.local/juice-research/flight/request-flight.json');
  const result=await page.evaluate(()=>{
    const saved=mana.snapshot(),shots=[];
    for(const altitude of[48,190]){
      mana.restore(saved);mana.write8(0xf8,altitude);mana.write16(0xf6,512);mana.run(10);
      mana.run(65,[10,1]);mana.run(1);mana.run(12);
      const m=mana.mod,layer=m.spriteLayer;let blue=0,colors=0;
      for(let i=0;i<layer.surface.length;i++)if(layer.effectMask[i]){
        const c=layer.surface[i]-1,r=c&31,g=c>>5&31,b=c>>10&31;colors++;if(b>r&&b>=g)blue++;
      }
      const shot=m.worldKi.status.shot;shots.push({mega:shot?.mega,colors,blue});
      mana.run(24);shots.at(-1).sustained=!!m.worldKi.status.shot;
      const middle=mana.snapshot();mana.run(8);const hash=mana.hash(mana.pixels);mana.restore(middle);mana.run(8);shots.at(-1).replay=mana.hash(mana.pixels)===hash;
      mana.run(50);shots.at(-1).finished=m.worldKi.status.shot===null;
    }
    return shots;
  });
  for(const shot of result){expect(shot.mega).toBe(true);expect(shot.colors).toBeGreaterThan(9500);expect(shot.blue).toBeGreaterThan(1500);expect(shot.sustained).toBe(true);expect(shot.replay).toBe(true);expect(shot.finished).toBe(true);}
});
