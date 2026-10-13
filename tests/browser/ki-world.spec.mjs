import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {readMap} from '../../tools/rom/rom.mjs';

async function load(page,path='.local/graphics-audit/party.json'){
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(path),'Requires user ROM and native fixture.');
  await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
  await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(path,'utf8')));
}
async function enter(page,map,x,y,flags={},layer=0){
  await page.evaluate(({map,x,y,flags,layer})=>{
    const cart=mana.snes.cart.data,event=cart.slice(0x742b0,0x742b5),door=cart.slice(0x8300c,0x83010);
    try{
      cart.set([4,0x18,3,5,0],0x742b0);cart.set([map&255,(x<<1)|(map>>8),(y<<1)|layer,0],0x8300c);
      for(const [flag,value]of Object.entries(flags))mana.write8(0xcf00+Number(flag),value);
      mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
      // Moon Palace's native entrance effect temporarily locks the player
      // after the map is visible. Wait for control before issuing attacks.
      for(let frames=240;frames<600&&!mana.mod.canAttack;frames+=10)mana.run(10);
    }finally{cart.set(event,0x742b0);cart.set(door,0x8300c);}
  },{map,x,y,flags,layer});
}

test('charging halves walking and flying speed in both forms',async({page})=>{
  await load(page);
  const results=await page.evaluate(()=>{
    const saved=mana.snapshot(),results=[];
    for(const superSaiyan of [false,true])for(const fly of [false,true]){
      const measure=charge=>{
        mana.restore(saved);mana.mod.options.superSaiyan=superSaiyan;
        mana.run(20,charge?[10,1]:[]);const start=mana.mod.status;
        mana.run(10,[6,...(fly?[8]:[]),...(charge?[10,1]:[])]);
        return{distance:start.x-mana.mod.status.x,charge:mana.mod.charging};
      };
      results.push({superSaiyan,fly,normal:measure(false),slow:measure(true)});
    }
    return results;
  });
  for(const r of results){expect(r.slow.charge).toBe(true);expect(r.slow.distance).toBeGreaterThan(3);expect(r.slow.distance/r.normal.distance).toBeGreaterThan(.35);expect(r.slow.distance/r.normal.distance).toBeLessThan(.65);}
});

test('flight keeps its speed over river currents and stairs, can land there, and still slows while charging',async({page})=>{
  await load(page);
  for(const scene of [{map:128,x:500,y:890,button:4,code:0x31},{map:131,x:558,y:344,button:7,code:0x21}]){
    await enter(page,scene.map,scene.x>>4,scene.y>>4,{16:1});
    const results=await page.evaluate(scene=>{
      const m=mana.mod,rows=[];
      for(let i=1;i<12;i++){mana.write8(0xe000+i*0x200,0);mana.write8(0xe02c+i*0x200,0);}
      mana.write16(0xe002,scene.x);mana.write16(0xe004,scene.y);m.localFlightHook.restore();
      m.teleport.follow({x:scene.x,y:scene.y,terrain:mana.read8(0xe00b),layer:0});mana.run(60);const saved=mana.snapshot();
      for(const superSaiyan of [false,true])for(const charging of [false,true]){
        mana.restore(saved);m.options.superSaiyan=superSaiyan;mana.run(20,charging?[10,1]:[]);
        const from=m.status,points=[];mana.run(1,[8,scene.button,...(charging?[10,1]:[])]);
        for(let i=0;i<6;i++){mana.run(1,[8,scene.button,...(charging?[10,1]:[])]);points.push([m.status.x,m.status.y,m.charging]);}
        const end=m.status,code=m.localFlightHook.tileAt(end.x,end.y).code;
        mana.run(10,charging?[10,1]:[]);const landed=!m.localFlight;
        rows.push({superSaiyan,charging,from:[from.x,from.y],points,code,landed});
      }
      return rows;
    },scene);
    for(const r of results){
      const speed=(r.superSaiyan?8:6)/(r.charging?2:1);
      const first=r.points[0],last=r.points.at(-1),distance=Math.hypot(last[0]-first[0],last[1]-first[1]);
      // The native main loop occasionally catches up with two movement ticks
      // in one video frame; check elapsed travel rather than that boundary.
      expect(distance,JSON.stringify({scene,r})).toBeGreaterThanOrEqual(speed*4);
      expect(distance,JSON.stringify({scene,r})).toBeLessThanOrEqual(speed*6);
      for(const point of r.points)expect(point[2]).toBe(r.charging);
      expect(r.landed).toBe(true);
    }
  }
});

test('fast flight cannot cross native walls in village, cave and palace maps on either layer',async({page})=>{
  await load(page);const results=[];
  for(const scene of [[257,8,10,0],[286,36,35,0],[432,7,14,1],[420,15,10,0]]){
    await enter(page,scene[0],scene[1],scene[2],{},scene[3]);
    results.push(await page.evaluate(layer=>{
      const h=mana.mod.localFlightHook,{width,height}=h.bounds(),player=mana.mod.status,candidates=[];
      for(let y=24;y<height-24;y+=16)for(let x=24;x<width-24;x+=16){
        if(!h.canLand(x,y,layer))continue;
        if([-16,0,16].some(dy=>[-16,0,16].some(dx=>{const t=h.tileAt(x+dx,y+dy,layer);return t&&(t.behavior&0x10||t.tile>=mana.read8(0x4d));})))continue;
        for(const [dx,dy,button]of [[1,0,7],[-1,0,6],[0,1,5],[0,-1,4]]){
          const wall=h.tileAt(x+dx*16,y+dy*16,layer);
          if(wall&&(wall.flags&7)===3&&wall.code===0&&!h.lowObstacle(wall)&&!(wall.behavior&0x10))candidates.push({x,y,dx,dy,button,distance:Math.hypot(x-player.x,y-player.y)});
        }
      }
      const at=candidates.sort((a,b)=>a.distance-b.distance)[0];if(!at)return{map:player.map,missing:true};
      for(let index=0;index<3;index++){const base=0xe000+index*0x200;mana.write16(base+2,at.x);mana.write16(base+4,at.y);mana.write8(base+0xb,(mana.read8(base+0xb)&0x7f)|(layer?0x80:0));}
      mana.mod.options.superSaiyan=true;mana.run(4);const start=mana.mod.status;
      let farthest=0;for(let frame=0;frame<60;frame++){mana.run(1,[8,at.button]);farthest=Math.max(farthest,(mana.mod.status.x-at.x)*at.dx+(mana.mod.status.y-at.y)*at.dy);}
      return{map:player.map,endMap:mana.mod.status.map,farthest,flight:mana.mod.localFlight,start,at};
    },scene[3]));
  }
  for(const r of results){expect(r.missing,JSON.stringify(r)).toBeFalsy();expect(r.endMap,JSON.stringify(r)).toBe(r.map);expect(r.flight).toBe(true);expect(r.farthest,JSON.stringify(r)).toBeLessThan(12);}
});

test('poison interrupts Super Saiyan charge and blocks transformation until cured',async({page})=>{
  await load(page);
  const result=await page.evaluate(()=>{
    mana.mod.options.superSaiyan=true;mana.run(30,[10,1]);
    mana.write8(0xe191,mana.read8(0xe191)|0x20);mana.run(1,[10,1]);
    const poisoned={super:mana.mod.options.superSaiyan,charging:mana.mod.charging,blocked:mana.mod.attackBlocked};
    mana.mod.configure({superSaiyan:true});const denied=!mana.mod.options.superSaiyan;
    mana.run(1);const beams=mana.mod.effects.filter(e=>e.kind==='beam').length;
    mana.write8(0xe191,mana.read8(0xe191)&~0x20);mana.mod.configure({superSaiyan:true});
    return{poisoned,denied,beams,cured:mana.mod.options.superSaiyan};
  });
  expect(result.poisoned).toEqual({super:false,charging:false,blocked:true});expect(result.denied).toBe(true);expect(result.beams).toBe(0);expect(result.cured).toBe(true);
});

test('the native whip pad floats the whole party across without an equipped whip',async({page})=>{
  await load(page);await enter(page,313,12,38);
  const result=await page.evaluate(()=>{
    const start=mana.mod.status,weapon=mana.read8(0xe1e3),poses=new Set();
    for(let f=0;f<240;f++){mana.run(1,f<10?[7]:[]);poses.add(mana.mod.spriteLayer.plan?.sprite?.kind);}
    return{weapon,start,party:mana.mod.entities().slice(0,3),poses:[...poses],active:mana.mod.gapFlight.active,count:mana.mod.gapFlight.crossings,flags:[mana.read8(0xcf01),mana.read8(0xcf03)],event:mana.read8(0xd0)};
  });
  expect(result.weapon).not.toBe(4);expect(result.poses).toContain('gapFlight');expect(result.count).toBe(1);expect(result.active).toBe(false);expect(result.flags).toEqual([0,0]);expect(result.event).toBe(0);
  for(const actor of result.party){expect(actor.x-result.start.x).toBeGreaterThan(80);expect(actor.y).toBe(result.start.y);}
});

test('Kamehameha breaks native axe rocks on both collision layers',async({page})=>{
  await load(page);
  for(const scene of [{map:286,x:36,y:35,layer:0},{map:432,x:7,y:14,layer:1}]){
    await enter(page,scene.map,scene.x,scene.y,{},scene.layer);
    const result=await page.evaluate(()=>{
      mana.run(2,[7]);mana.run(105,[10,1]);mana.run(1);mana.run(35);
      return mana.mod.plants.completed.filter(row=>row.map===mana.read16(0xdc)).flatMap(row=>row.tiles).filter(t=>t.code===0xc2).map(t=>({layer:t.layer,before:t.tile,after:mana.read8(t.address),replacement:t.replacement}));
    });
    expect(result.length).toBeGreaterThan(0);for(const t of result){expect(t.layer).toBe(scene.layer);expect(t.after).toBe(t.replacement);expect(t.after).not.toBe(t.before);}
  }
});

test('Super Saiyan lightning changes paths during a full hold and strikes native surfaces',async({page})=>{
  await load(page,'.local/emulator-probe/main-before-grass.json');
  const result=await page.evaluate(()=>{
    mana.mod.options.superSaiyan=true;mana.run(80,[10,1]);const paths=[],targets=[];
    for(let f=0;f<24;f++){mana.run(1,[10,1]);const arcs=mana.mod.spriteLayer.plan.lightning||[];paths.push(JSON.stringify(arcs.map(a=>a.points)));targets.push(...arcs.map(a=>a.target));}
    return{variations:new Set(paths).size,surfaces:targets.filter(t=>t.kind==='surface').length,charge:mana.mod.charge};
  });
  expect(result.variations).toBeGreaterThan(6);expect(result.surfaces).toBeGreaterThan(10);expect(result.charge).toBe(45);
});

test('Japanese chant keeps its long delivery in both forms and shouts only on release',async({page})=>{
  await load(page);await page.evaluate(()=>mana.play());
  await page.keyboard.press('ArrowLeft');
  await expect.poll(()=>page.evaluate(()=>mana.mod.sound.speech.stats.ready)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>mana.mod.sound.stats.ready)).toBe(true);
  await page.evaluate(()=>{const sound=mana.mod.sound;window.kiMeter=sound.output.context.createAnalyser();kiMeter.fftSize=2048;sound.connect(kiMeter);});
  for(const superSaiyan of [false,true]){
    await page.evaluate(superSaiyan=>{mana.mod.options.superSaiyan=superSaiyan;mana.mod.sound.speech.stats.history=[];},superSaiyan);
    await page.keyboard.down('Shift');await page.keyboard.down('c');
    await expect.poll(()=>page.evaluate(()=>mana.mod.charge)).toBe(superSaiyan?45:90);
    await expect.poll(()=>page.evaluate(()=>mana.mod.sound.speech.stats.speaking),{timeout:10000}).toBe(false);
    const before=await page.evaluate(()=>({frame:mana.mod.frame,history:mana.mod.sound.speech.stats.history.map(v=>v.name)}));
    expect(before.history).toEqual(['charge']);
    expect(await page.evaluate(()=>mana.mod.sound.stats.charge)).toBe(true);
    // Measure actual audio from the effects bus after the vocal has ended.
    await expect.poll(()=>page.evaluate(()=>{const a=new Float32Array(kiMeter.fftSize);kiMeter.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((sum,v)=>sum+v*v,0)/a.length);})).toBeGreaterThan(.008);
    const loops=await page.evaluate(()=>mana.mod.sound.stats.loops);
    expect(loops).toContain('charge');expect(loops.includes('aura')).toBe(superSaiyan);
    expect(await page.evaluate(()=>mana.mod.sound.speech.stats.durations.charge)).toBeGreaterThan(3.5);
    await expect.poll(()=>page.evaluate(()=>mana.mod.frame)).toBeGreaterThan(before.frame+20);
    expect(await page.evaluate(()=>mana.mod.sound.speech.stats.history.map(v=>v.name))).toEqual(before.history);
    await page.keyboard.up('c');await page.keyboard.up('Shift');
    await expect.poll(()=>page.evaluate(()=>mana.mod.sound.speech.stats.last)).toBe('release');
    await expect.poll(()=>page.evaluate(()=>mana.mod.action)).toBe(null);
    await expect.poll(()=>page.evaluate(()=>mana.mod.sound.speech.stats.speaking)).toBe(false);
  }
  await page.keyboard.down('Shift');await page.keyboard.down('c');await expect.poll(()=>page.evaluate(()=>mana.mod.charging)).toBe(true);
  await page.getByRole('button',{name:'Mute',exact:true}).click();
  expect(await page.evaluate(()=>mana.mod.sound.speech.stats.speaking)).toBe(false);
  expect(await page.evaluate(()=>mana.mod.sound.stats.loops)).toEqual([]);
  await page.evaluate(()=>mana.pause());await page.keyboard.up('c');await page.keyboard.up('Shift');
  expect(await page.evaluate(()=>mana.mod.sound.speech.stats.speaking)).toBe(false);
});

test('punches, ki shots and Kamehameha activate every native elemental orb puzzle',async({page})=>{
  test.setTimeout(180000);await load(page);
  const rom=readFileSync('.local/rom/secret-of-mana-us.sfc'),saved=await page.evaluate(()=>mana.snapshot()),results=[];
  const maps=[291,307,41,348,345,240,35,420,421,422,423,424,425,426];
  for(let i=0;i<maps.length;i++){
    const map=maps[i],orb=readMap(rom,map).objects.find(o=>o.species===85),flag=orb.visibility.flag;
    await page.evaluate(saved=>mana.restore(saved),saved);await enter(page,map,orb.x,orb.y+2,{[flag]:orb.visibility.min});
    const result=await page.evaluate(({i,flag})=>{
      const orb=mana.mod.entities().find(e=>e.active&&e.species===85),before=mana.read8(0xcf00+flag),grid=mana.snes.ram.slice(0x10000,0x18000);
      // Position is established by the native door; attack inputs remain real.
      mana.run(6,[4]);
      if(i%3===0){mana.run(2,[0]);mana.run(1);}
      else if(i%3===1)mana.run(4,[17]);
      else{mana.run(105,[10,1]);mana.run(1);}
      mana.run(30);
      for(let f=0;f<300;f++)mana.run(1,f%30<2?[16]:[]);
      return{map:mana.read16(0xdc),before,after:mana.read8(0xcf00+flag),count:mana.mod.orbs.activated,last:mana.mod.orbs.last,error:mana.mod.orbs.error,queuedDamage:mana.read16(orb.base+0x1f1),event:mana.read8(0xd0),gridChanged:grid.some((v,i)=>v!==mana.snes.ram[0x10000+i])};
    },{i,flag});results.push({map,...result});
  }
  await test.info().attach('orb-puzzles',{body:JSON.stringify(results,null,2),contentType:'application/json'});
  for(const r of results){expect(r.count,`map ${r.map}: ${JSON.stringify(r)}`).toBe(1);expect(r.after,`map ${r.map}`).toBeGreaterThan(r.before);expect(r.error).toBe(null);expect(r.queuedDamage).toBe(0);expect(r.event).toBe(0);}
  expect(results.filter(r=>r.gridChanged).length).toBeGreaterThan(4);
});
