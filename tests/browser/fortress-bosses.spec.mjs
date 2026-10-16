import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(240000);
async function prepare(page,flag,event){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 return page.evaluate(({save,flag,event})=>{mana.pause();save.romHash=mana.hash(mana.snes.cart.data);mana.restore(save);const m=mana.mod,r=mana.snes.ram;Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});m.powerIntro.restore({flight:true,superShown:true});r[0xe200]=r[0xe400]=0;r[0xcf4e]=flag;const requested=m.story.request(event);for(let i=0;i<60&&(![244,488].includes(m.status.map)||!m.canAttack);i++)mana.run(10);document.querySelector('#native-pause').hidden=true;return{requested,map:m.status.map,flag:r[0xcf4e],canAttack:m.canAttack,error:m.story.status.error};},{save:JSON.parse(readFileSync(fixture)),flag,event});
}
for(const flag of[0,2,3])test(`Dread Slime starts, moves, accepts damage and exits from Fortress stage ${flag}`,async({page},info)=>{
 expect(await prepare(page,flag,0x423)).toEqual({requested:true,map:488,flag:3,canAttack:true,error:null});
 const movement=await page.evaluate(()=>{const m=mana.mod,boss=()=>m.entities().find(e=>e.active&&e.species===124),before=boss();mana.run(360);const after=boss();return{before,after,can:m.canAttack};});
 expect(movement.before.hp).toBe(5000);expect(movement.after.hp).toBe(5000);expect([movement.after.x,movement.after.y]).not.toEqual([movement.before.x,movement.before.y]);
 await page.locator('#screen').screenshot({path:info.outputPath('slime-active.png')});
 await page.evaluate(()=>{const m=mana.mod;m.hit(m.entities().find(e=>e.active&&e.species===124),8191,'beam');});
 let done;
 for(let i=0;i<180;i++){done=await page.evaluate(()=>{mana.run(40,[11]);const m=mana.mod;return{map:m.status.map,flag:mana.read8(0xcf4e),canAttack:m.canAttack,error:m.story.status.error};});if(done.map===250&&done.canAttack)break;}
 writeFileSync(info.outputPath('progress.json'),JSON.stringify({movement,done},null,2));
 expect(done).toEqual({map:250,flag:4,canAttack:true,error:null});
 const revisited=await page.evaluate(()=>{mana.mod.story.request(0x423);mana.run(240);return{map:mana.mod.status.map,flag:mana.read8(0xcf4e),slime:mana.mod.entities().some(e=>e.active&&e.species===124)};});expect(revisited).toEqual({map:250,flag:4,slime:false});
});
test('unfinished Buffy encounter can be re-entered; defeated Buffy stays cleared',async({page})=>{
 expect(await prepare(page,1,0x420)).toEqual({requested:true,map:244,flag:1,canAttack:true,error:null});
 expect(await page.evaluate(()=>mana.mod.entities().some(e=>e.active&&e.species===120&&e.hp>0))).toBe(true);
 const cleared=await page.evaluate(()=>{mana.snes.ram[0xcf4e]=2;mana.mod.story.request(0x420);mana.run(240);return{map:mana.mod.status.map,flag:mana.read8(0xcf4e),boss:mana.mod.entities().some(e=>e.active&&e.species===120)};});expect(cleared).toEqual({map:248,flag:2,boss:false});
});
