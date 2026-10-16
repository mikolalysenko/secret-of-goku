import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';

test('orbital punches, focus and teleport animate on their own clocks and replay without moving the native actor',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?start=space');await page.waitForFunction(()=>window.mana?.ready,{},{timeout:60000});
 const result=await page.evaluate(()=>{
  mana.pause();const m=mana.mod,s=m.frieza.snapshot(),o=s.boss.space;
  Object.assign(o,{intro:0,hero:{x:120,y:100},heading:0,duelCooldown:10000,action:null,punch:0,teleport:0,charge:0,beam:null});
  Object.assign(s.boss,{x:144,y:100,stun:10000,warning:null,shots:[],hp:32000});m.frieza.restore(s);mana.run(1);
  const ground=[m.status.x,m.status.y],hp=m.frieza.status.hp;
  mana.run(1,[0]);const windup={hp:m.frieza.status.hp,action:{...m.frieza.orbit.action}};
  mana.run(1);const contact={hp:m.frieza.status.hp,action:{...m.frieza.orbit.action}},saved=mana.snapshot();
  mana.run(2);const held={hp:m.frieza.status.hp,action:{...m.frieza.orbit.action}};
  mana.run(14);const expected=JSON.stringify(m.frieza.snapshot()),pixels=mana.hash(mana.pixels);
  mana.restore(saved);mana.run(16);const replay=expected===JSON.stringify(m.frieza.snapshot())&&pixels===mana.hash(mana.pixels);
  const poses=new Set();for(let f=0;f<100;f++){mana.run(1,[10]);poses.add(window.GokuAnimation.actionPose(m.action,'ssj',2).column);}
  mana.run(1);
  const play=m.playSound,cues=[];m.playSound=name=>cues.push({name,age:m.frieza.orbit.action?.age});
  let teleport;
  try{
   const origin={...m.frieza.orbit.hero};mana.run(1,[10,0]);mana.run(3,[10,0]);const before={...m.frieza.orbit.hero};
   mana.run(1,[10,0]);const absent={hero:{...m.frieza.orbit.hero},pose:window.GokuAnimation.actionPose(m.frieza.orbit.action)};
   mana.run(1);mana.run(1,[10,0]);const checkpoint=mana.snapshot();
   mana.run(30);const end=JSON.stringify(m.frieza.snapshot()),picture=mana.hash(mana.pixels),count=cues.filter(c=>c.name==='teleport').length;
   mana.restore(checkpoint);mana.run(30);
   teleport={origin,before,absent,count,arrivals:cues.filter(c=>c.name==='teleportIn').slice(0,2),
    replay:end===JSON.stringify(m.frieza.snapshot())&&picture===mana.hash(mana.pixels),action:m.frieza.orbit.action};
  }finally{m.playSound=play;}
  const duelState=m.frieza.snapshot();duelState.boss.space.duelCooldown=0;m.frieza.restore(duelState);
  mana.run(1,[10,0]);mana.run(12);mana.run(1,[0]);mana.run(1);
  const exchange={started:m.frieza.orbit.duel?.age,action:m.frieza.orbit.action};
  mana.run(80);exchange.finished=m.frieza.orbit.duel===null;exchange.after=m.frieza.orbit.action;
  return{hp,windup,contact,held,replay,poses:[...poses],teleport,exchange,ground,after:[m.status.x,m.status.y]};
 });
 expect(result.windup.hp).toBe(result.hp);expect(result.windup.action).toMatchObject({kind:'punch',age:0});
 expect(result.contact.hp).toBeLessThan(result.hp);expect(result.contact.action).toMatchObject({age:1,hitPause:2});
 expect(result.held.hp).toBe(result.contact.hp);expect(result.held.action.age).toBe(1);expect(result.replay).toBe(true);
 expect(result.poses).toEqual([21,33,30]);expect(result.after).toEqual(result.ground);
 expect(result.teleport.before).toEqual(result.teleport.origin);expect(result.teleport.absent.pose.hidden).toBe(true);
 expect(result.teleport.count).toBe(2);expect(result.teleport.arrivals).toEqual([{name:'teleportIn',age:6},{name:'teleportIn',age:6}]);
 expect(result.teleport.replay).toBe(true);expect(result.teleport.action).toBeNull();expect(errors).toEqual([]);
 expect(result.exchange).toEqual({started:0,action:null,finished:true,after:null});
 await page.locator('#screen').screenshot({path:test.info().outputPath('orbital-motion.png')});
});
