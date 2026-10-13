import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
async function load(page,path='.local/graphics-audit/party.json'){
 test.skip(!existsSync(path)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(path)));
}
test('R fast-forwards real native prose and cutscenes, but stops at the seed-gated choice',async({page})=>{
 test.setTimeout(180000);await load(page);
 await page.evaluate(()=>{mana.mod.quest.restore({mask:0,seedMask:0});for(let i=0;i<6;i++)mana.mod.quest.collect(i);mana.write8(0xcf4e,8);mana.mod.story.request(0x429);mana.run(10);});
 const reached=await page.evaluate(async()=>{
   for(let i=0;i<100;i++){
     if(mana.fastForward.state(0x800).choice)return true;
     mana.run(80,[11]);await new Promise(r=>setTimeout(r,0));
   }
   return{state:mana.mod.status,story:mana.mod.story.status,ff:mana.fastForward.state(0x800)};
 });expect(reached).toBe(true);
 const waiting=await page.evaluate(()=>{
   const m=mana.mod,pointer=mana.read16(0xd1)|(mana.read8(0xd3)<<16),bytes=Array.from({length:250},(_,i)=>m.story.inspectByte(pointer+i));
   mana.run(360,[11]);return{pointer,same:pointer===(mana.read16(0xd1)|(mana.read8(0xd3)<<16)),bytes,fed:m.challenge.status.fed,quest:m.quest.status,error:m.story.status.error};
 });expect(waiting.same).toBe(true);expect(waiting.fed).toBe(false);expect(waiting.quest).toMatchObject({count:7,seedCount:6,canFeed:false,earned:6});expect(waiting.error).toBe(null);
 await page.screenshot({path:'.local/danger-progress/seed-locked-choice.png'});
 await page.evaluate(()=>{mana.run(2,[0]);mana.run(10);});
 const battle=await page.evaluate(async()=>{
   for(let i=0;i<100;i++){if(mana.mod.canAttack&&mana.read16(0xdc)===253)return true;mana.run(80,[11]);await new Promise(r=>setTimeout(r,0));}
   return mana.mod.status;
 });expect(battle).toBe(true);expect(await page.evaluate(()=>mana.mod.challenge.status.fed)).toBe(false);
});
test('L focus grows native aura without chanting, L+A transforms, and a tap reverts on the real game',async({page})=>{
 await load(page);await page.evaluate(()=>mana.play());await page.keyboard.down('Shift');
 await expect.poll(()=>page.evaluate(()=>mana.mod.powerCharge)).toBe(96);
 expect(await page.evaluate(()=>mana.mod.options.superSaiyan)).toBe(false);
 expect(await page.evaluate(()=>mana.mod.spriteLayer.plan.power)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>mana.mod.sound.stats.loops.includes('charge'))).toBe(true);
 expect(await page.evaluate(()=>mana.mod.sound.speech.stats.speaking)).toBe(false);
 await page.screenshot({path:'.local/danger-progress/focus-aura.png'});
 await page.keyboard.down('k');await expect.poll(()=>page.evaluate(()=>mana.mod.options.superSaiyan)).toBe(true);
 await page.keyboard.up('k');await page.keyboard.up('Shift');
 await expect.poll(()=>page.evaluate(()=>mana.mod.sound.stats.history.some(v=>v.name==='transform'&&v.sampled))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>mana.mod.action)).toBe(null);
 await page.keyboard.press('r');await expect.poll(()=>page.evaluate(()=>mana.mod.options.superSaiyan)).toBe(false);
 await expect.poll(()=>page.evaluate(()=>mana.mod.action)).toBe(null);
});
test('R alone never takes off, L+R does; Mode 7 keeps B descent and L+Y wave controls',async({page})=>{
 await load(page);
 const takeoff=await page.evaluate(()=>{mana.run(15,[11]);const grounded=!mana.mod.worldFlight&&!mana.mod.flightTransition;mana.run(1);mana.run(2,[10,11]);mana.run(700);return{grounded,flight:mana.mod.worldFlight,error:mana.mod.flight.error};});
 expect(takeoff).toEqual({grounded:true,flight:true,error:null});
 const controls=await page.evaluate(()=>{
   mana.run(5,[0]);const descend=mana.snes.joypad1State&1;
   mana.run(8,[8]);const ascend=mana.snes.joypad1State&0x100;
   mana.run(105,[10,1]);const held={charge:mana.mod.charge,descend:mana.snes.joypad1State&1};mana.run(1);
   return{descend,ascend,held,shot:mana.mod.worldKi.status.shot,flight:mana.mod.worldFlight};
 });expect(controls.descend).toBe(1);expect(controls.ascend).toBe(256);expect(controls.held).toEqual({charge:90,descend:0});expect(controls.shot.ki).toBe(false);expect(controls.flight).toBe(true);
});
