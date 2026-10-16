import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const fixture=path=>JSON.parse(readFileSync(path,'utf8'));
async function load(page,path){
  await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
  await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(2);},fixture(path));
}
test.beforeEach(()=>test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires user-supplied US cartridge.'));

test('punches and quick ki stay planted on the native pixel grid through recovery',async({page})=>{
  const path='.local/animation-audit/native/rabite-field-a.json';test.skip(!existsSync(path),'Requires native combat research fixture.');
  await load(page,path);
  const trials=await page.evaluate(()=>{
    for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
    mana.run(4);const base=mana.snapshot(),trials=[];
    for(const superSaiyan of[false,true])for(const direction of[4,5,6,7])for(const button of[0,17]){
      mana.restore(base);const m=mana.mod;m.options.superSaiyan=superSaiyan;
      mana.run(2,[direction]);mana.run(4);
      const origin=[m.status.x,m.status.y],pivots=new Set();let drift=0,integer=true,frames=0;
      mana.run(1,[button,direction]);
      while(m.action&&frames++<24){
        const p=m.spriteLayer.plan.sprite;
        drift=Math.max(drift,Math.hypot(m.status.x-origin[0],m.status.y-origin[1]));
        pivots.add(`${p.x},${p.y}`);integer&&=Number.isInteger(p.x)&&Number.isInteger(p.y);
        mana.run(1,[direction]);
      }
      trials.push({superSaiyan,direction,button,drift,pivots:pivots.size,integer,frames});
    }
    return trials;
  });
  for(const t of trials){
    expect(t.drift,JSON.stringify(t)).toBe(0);expect(t.pivots).toBe(1);expect(t.integer).toBe(true);
    expect(t.frames).toBeGreaterThan(0);expect(t.frames).toBeLessThan(24);
  }
});

test('real native Rabites receive punch, travelling beam and ki damage, launch and finish their death animation',async({page})=>{
  const path='.local/animation-audit/native/rabite-field-a.json';test.skip(!existsSync(path),'Requires native combat research fixture.');
  await load(page,path);const results=await page.evaluate(()=>{
    mana.write8(0xe200,0);mana.write8(0xe400,0);
    const base=mana.snapshot(),results=[];
    for(const technique of ['punch','beam','ki']){
      mana.restore(base);mana.run(5,[7]);mana.run(3);
      const enemy=mana.mod.entities().find(e=>e.index===3),before={...enemy},gold=mana.read16(0xcc6a),xp=mana.read16(0xe18d),sounds=mana.mod.combatSound.suppressed;
      if(technique==='beam'){
        mana.run(110,[10,1]);
        const target=mana.mod.entities()[3],player=mana.mod.status,dx=target.x-player.x,dy=target.y-player.y;
        const direction=Math.abs(dx)>Math.abs(dy)?(dx>0?7:6):(dy>0?5:4);
        mana.run(2,[10,1,direction]);mana.run(1);
      }
      else if(technique==='ki')mana.run(8,[17]);
      else{mana.run(2,[0]);mana.run(1);}
      let zero=false,finished=false,maxDisplacement=0,queued=false,number=false,launchOrigin=null;
      for(let i=0;i<180;i++){
        mana.run(1);const e=mana.mod.entities()[3];
        if(e.hp===0)zero=true;if(!e.active||e.species===0xea)finished=true; // Native death may leave a treasure chest.
        if(mana.read16(e.base+0x1f1))queued=true;if(mana.read16(e.base+0x17b))number=true;
        const launch=mana.mod.knockbacks.find(hit=>hit.base===e.base);if(launch)launchOrigin={x:launch.x,y:launch.y};
        if(launchOrigin)maxDisplacement=Math.max(maxDisplacement,Math.hypot(e.x-launchOrigin.x,e.y-launchOrigin.y));
      }
      results.push({technique,zero,finished,queued,number,maxDisplacement,dbzImpacts:mana.mod.combatSound.suppressed-sounds,canAttack:mana.mod.canAttack,gold:mana.read16(0xcc6a)-gold,xp:mana.read16(0xe18d)-xp});
    }
    return results;
  });
  for(const result of results){expect(result.zero,result.technique).toBe(true);expect(result.finished,result.technique).toBe(true);expect(result.maxDisplacement,result.technique).toBeGreaterThan(25);expect(result.canAttack).toBe(true);expect(result.gold).toBe(2);expect(result.xp).toBeGreaterThan(0);expect(result.dbzImpacts).toBeGreaterThan(0);}
});

test('one SSJ beam repeatedly hits a 65535-HP Mantis Ant and still reaches the native rescue event',async({page})=>{
  const path='.local/emulator-probe/map-260-state.json';test.skip(!existsSync(path),'Requires native boss fixture.');
  await load(page,path);
  const result=await page.evaluate(async()=>{
    const boss=mana.mod.entities().find(e=>e.index>=3&&e.active&&e.species===87),before=boss?.hp;
    if(!boss)return{before};
    // Stress the real boss's damage/death routines with the largest native
    // HP value: a one-contact beam cannot possibly finish this encounter.
    mana.mod.options.superSaiyan=true;mana.write16(boss.base+0x182,65535);mana.write16(boss.base+0x184,65535);
    // Aim using actual actor coordinates; positioning uses normal controller
    // input, never relocating the boss or inventing its defeat flag.
    const status=mana.mod.status,dx=boss.x-status.x,dy=boss.y-status.y;
    const button=Math.abs(dx)>Math.abs(dy)?(dx>0?7:6):(dy>0?5:4);
    mana.run(2,[button]);mana.run(112,[10,1]);mana.run(1);
    const beam=mana.mod.effects.find(e=>e.kind==='beam');
    let dead=false,rescue=false;
    for(let i=0;i<60;i++){
      mana.run(20);if(mana.read16(boss.base+0x182)===0)dead=true;
      if(mana.read8(0xd0)!==0||mana.read8(0xcf10)>6)rescue=true;
      if(i%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    return{before,dead,rescue,hits:beam?.pulses[boss.index]?.count,flag:mana.read8(0xcf10),event:mana.read8(0xd0)};
  });
  expect(result.before).toBeGreaterThan(0);expect(result.hits).toBeGreaterThanOrEqual(9);expect(result.dead).toBe(true);expect(result.rescue).toBe(true);
});

test('SSJ ignition bursts on the gold frame, awards native enemy rewards once, and keeps short hair when focusing',async({page},testInfo)=>{
  const path='.local/animation-audit/native/rabite-field-a.json';test.skip(!existsSync(path),'Requires native combat research fixture.');
  await load(page,path);
  const saved=await page.evaluate(()=>{mana.write8(0xe200,0);mana.write8(0xe400,0);mana.run(5,[7]);mana.run(3);return mana.snapshot();});
  for(const first of[true,false]){
    const ignition=await page.evaluate(({saved,first})=>{
      mana.restore(saved);const m=mana.mod;m.powerIntro.restore({flight:true,superShown:!first});
      const gold=mana.read16(0xcc6a),xp=mana.read16(0xe18d),hit=m.hit,calls=[],play=m.playSound,cues=[];
      m.hit=function(enemy,...args){calls.push({index:enemy.index,age:this.action?.age});return hit.call(this,enemy,...args);};
      m.playSound=function(name){cues.push({name,age:this.action?.age});return play.call(this,name);};
      try{
        m.configure({superSaiyan:true});const frame=Math.ceil(m.action.duration*14/40);mana.run(frame-1);
        const before={hits:calls.length,flash:m.feedback.snapshot().flash};mana.run(1);
        return{first,frame,before,calls,cues:cues.filter(c=>c.name==='powerBurst'),flash:m.feedback.snapshot().flash,
          pose:m.spriteLayer.plan.sprite,pixels:m.spriteLayer.effectMask.reduce((a,b)=>a+b,0),
          effects:m.effects.filter(e=>e.kind==='powerBurst').length,gold,xp};
      }finally{m.hit=hit;m.playSound=play;}
    },{saved,first});
    expect(ignition.frame).toBe(first?26:12);expect(ignition.before).toEqual({hits:0,flash:0});
    expect(ignition.calls).toEqual([{index:3,age:ignition.frame}]);expect(ignition.cues).toEqual([{name:'powerBurst',age:ignition.frame}]);
    expect(ignition.flash).toBe(7);expect(ignition.pose).toMatchObject({sheet:'goku',column:56,kind:'transform'});
    expect(ignition.effects).toBe(1);expect(ignition.pixels).toBeGreaterThan(1000);
    await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
    await page.locator('#screen').screenshot({path:testInfo.outputPath(first?'first-ignition.png':'repeat-ignition.png')});
    const aftermath=await page.evaluate(()=>{
      let displacement=0;const enemy=mana.mod.entities()[3];
      for(let i=0;i<180;i++){mana.run(1);const now=mana.mod.entities()[3];displacement=Math.max(displacement,Math.hypot(now.x-enemy.x,now.y-enemy.y));}
      const m=mana.mod,target=m.entities()[3];return{dead:target.hp===0,finished:!target.active||target.species===0xea,displacement,
        gold:mana.read16(0xcc6a),xp:mana.read16(0xe18d),effects:m.effects.length,canAttack:m.canAttack};
    });
    // The native drop roll can replace the finished death effect with a chest.
    expect(aftermath.dead).toBe(true);expect(aftermath.finished).toBe(true);expect(aftermath.displacement).toBeGreaterThan(25);
    expect(aftermath.gold-ignition.gold).toBe(2);expect(aftermath.xp-ignition.xp).toBeGreaterThan(0);
    expect(aftermath.effects).toBe(0);expect(aftermath.canAttack).toBe(true);
  }
  const focused=await page.evaluate(()=>{
    mana.run(2,[5]);
    const poses=new Set();for(let i=0;i<150;i++){mana.run(1,[10]);const p=mana.mod.spriteLayer.plan.sprite;poses.add(`${p.sheet}:${p.row}:${p.column}:${p.kind}`);}
    return{poses:[...poses].sort(),superSaiyan:mana.mod.options.superSaiyan,effects:mana.mod.effects.length};
  });
  expect(focused).toEqual({poses:['ssj:0:21:focus'],superSaiyan:true,effects:0});
  await page.locator('#screen').screenshot({path:testInfo.outputPath('super-saiyan-focus.png')});
});

test('keyboard aliases, confirm, ring cancellation, party switching and checkpoint replay keep distinct input ownership',async({page})=>{
  await load(page,'.local/graphics-audit/party.json');
  await page.evaluate(()=>mana.play());await page.keyboard.down('Shift');await page.keyboard.down('c');await page.keyboard.down('ShiftRight');
  await expect.poll(()=>page.evaluate(()=>mana.mod.charging)).toBe(true);
  await page.keyboard.up('ShiftRight');await expect.poll(()=>page.evaluate(()=>mana.mod.charge)).toBe(90);
  await page.keyboard.up('c');await page.keyboard.up('Shift');await expect.poll(()=>page.evaluate(()=>mana.logs.some(line=>line.startsWith('Kamehameha')))).toBe(true);
  const result=await page.evaluate(()=>{
    mana.pause();mana.run(40);const base=mana.snapshot();
    mana.run(80,[16]);const confirm={charged:mana.mod.charging,beams:mana.mod.effects.filter(e=>e.kind==='beam').length};
    mana.restore(base);mana.run(50,[10,1]);mana.run(2,[10,1,9]);mana.run(90,[10,1]);const ring={charge:mana.mod.charge,menu:mana.read8(0xec),nativeB:mana.snes.joypad1State&1};
    mana.restore(base);mana.run(2,[2]);mana.run(40);const owner=mana.read8(0xe02c);mana.run(90,[10,1]);const party={owner,charging:mana.mod.charging,nativeB:mana.snes.joypad1State&1};
    mana.restore(base);mana.run(45,[10,1]);const saved=mana.snapshot();mana.run(15,[10,1]);mana.run(7);const hash=mana.hash(mana.pixels),ram=mana.hash(mana.snes.ram);
    mana.restore(saved);mana.run(15,[10,1]);mana.run(7);return{confirm,ring,party,replay:hash===mana.hash(mana.pixels)&&ram===mana.hash(mana.snes.ram)};
  });
  expect(result.confirm).toEqual({charged:false,beams:0});expect(result.ring.charge).toBe(0);expect(result.ring.menu).not.toBe(0);expect(result.ring.nativeB).toBe(0);
  expect(result.party).toEqual({owner:0,charging:false,nativeB:0});expect(result.replay).toBe(true);
});

test('on-screen attack and keyboard can overlap, and C and Shift+Z drive ki and transformation',async({page})=>{
  await load(page,'.local/graphics-audit/party.json');
  // Make the real pointer control visible on the desktop test viewport too.
  await page.locator('.touch-pad').evaluate(element=>element.style.display='flex');
  const attack=page.locator('[data-snes="1"]');await attack.scrollIntoViewIfNeeded();
  const box=await attack.boundingBox();await page.evaluate(()=>mana.play());
  await page.keyboard.down('Shift');await page.keyboard.down('c');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.keyboard.up('c');
  await expect.poll(()=>page.evaluate(()=>mana.mod.charge)).toBe(90);
  await page.mouse.up();await page.keyboard.up('Shift');await expect.poll(()=>page.evaluate(()=>mana.logs.some(line=>line.startsWith('Kamehameha')))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>mana.mod.action===null)).toBe(true);
  await page.keyboard.down('Shift');await page.keyboard.down('z');await expect.poll(()=>page.evaluate(()=>mana.mod.options.superSaiyan)).toBe(true);await page.keyboard.up('z');await page.keyboard.up('Shift');
  await expect.poll(()=>page.evaluate(()=>mana.mod.action===null)).toBe(true);
  await page.keyboard.down('c');await expect.poll(()=>page.evaluate(()=>mana.mod.effects.some(effect=>effect.kind==='ki'))).toBe(true);await page.keyboard.up('c');
  await expect.poll(()=>page.evaluate(()=>mana.mod.effects.length===0)).toBe(true);
  await page.keyboard.press('Escape');expect(await page.evaluate(()=>mana.running)).toBe(false);
  await page.keyboard.press('Escape');expect(await page.evaluate(()=>mana.running)).toBe(true);
});
