import test from 'node:test';
import assert from 'node:assert/strict';
import {newOrbit,tickOrbit} from '../engine/frieza-orbit.js';
import {startOrbitTeleport,startOrbitPunch,tickOrbitAction} from '../engine/orbit-actions.js';

function scene(){
 const o=newOrbit({x:1000,y:1000}),b={x:144,y:100,hp:32000,shots:[]},sounds=[];
 o.intro=0;o.hero={x:120,y:100};o.heading=0;
 const hooks={sound:name=>sounds.push({name,age:o.action?.age}),shake:()=>{},hurt:()=>{},damage:()=>{},melee:n=>{b.hp-=n;return n;}};
 const step=(n=1)=>{for(let i=0;i<n;i++){tickOrbit(o,b,hooks);tickOrbitAction(o,b,hooks);}};
 return{o,b,sounds,hooks,step};
}

test('orbital punches strike on their extended frame, hold real contacts and recover before the next combo',()=>{
 const {o,b,sounds,hooks,step}=scene();
 for(let combo=0;combo<3;combo++){
  startOrbitPunch(o,hooks.sound);const hp=b.hp;
  assert.equal(o.action.combo,combo);assert.equal(b.hp,hp);
  step();assert.equal(b.hp,hp-550);assert.equal(o.action.age,1);
  const hold=combo===2?3:2;
  step(hold);assert.equal(o.action.age,1);assert.equal(b.hp,hp-550);
  step(7);assert.equal(o.action,null);assert.equal(o.cooldown,0);assert.equal(b.hp,hp-550);
 }
 assert.deepEqual(sounds.map(s=>s.name),['swing','friezaImpact','swing','friezaImpact','kickSwing','friezaImpact']);
 step(45);startOrbitPunch(o);assert.equal(o.action.combo,0);
});

test('orbital punches can miss to the side or behind, without contact sound or a freeze',()=>{
 for(const position of[{x:100,y:100},{x:144,y:124},{x:170,y:100}]){
  const {o,b,sounds,hooks,step}=scene();Object.assign(b,position);startOrbitPunch(o,hooks.sound);
  step(2);assert.equal(o.action.age,2);assert.equal(b.hp,32000);assert.deepEqual(sounds.map(s=>s.name),['swing']);
  step(6);assert.equal(o.action,null);
 }
});

test('orbital teleport waits for disappearance, faces the moving opponent and sounds on materialization',()=>{
 for(const origin of[{x:60,y:100},{x:210,y:100},{x:144,y:40},{x:144,y:165}]){
  const{o,b,sounds,hooks,step}=scene();o.hero={...origin};startOrbitTeleport(o,hooks.sound);
  step(3);assert.deepEqual(o.hero,origin);b.x+=6;
  step();assert.equal(Math.hypot(o.hero.x-b.x,o.hero.y-b.y),22);assert.ok([o.hero.x,o.hero.y].every(Number.isInteger));
  const [dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][o.action.facing];assert.ok((b.x-o.hero.x)*dx+(b.y-o.hero.y)*dy>0);
  step(2);assert.deepEqual(sounds,[{name:'teleport',age:0},{name:'teleportIn',age:6}]);
  step(6);assert.equal(o.action,null);assert.equal(b.hp,32000);
 }
});

test('a teleport checkpoint keeps one buffered hop, and a contact checkpoint never repeats damage',()=>{
 for(const teleport of[false,true]){
  const{o,b,hooks,step}=scene();
  if(teleport){startOrbitTeleport(o);step(4);startOrbitTeleport(o);startOrbitTeleport(o);}
  else{startOrbitPunch(o);step();}
  const saved=structuredClone({o,b}),hp=b.hp;step(30);assert.equal(b.hp,hp);
  const replayHooks={...hooks,melee:n=>{saved.b.hp-=n;return n;}};
  for(let i=0;i<30;i++){tickOrbit(saved.o,saved.b,replayHooks);tickOrbitAction(saved.o,saved.b,replayHooks);}
  assert.deepEqual(saved,{o,b});assert.equal(o.action,null);
 }
});
