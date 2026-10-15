import test from 'node:test';
import assert from 'node:assert/strict';
import {newOrbit,steerOrbit,tickOrbit,ricochet,orbitTargets} from '../engine/frieza-orbit.js';
import {orbitPrompts} from '../engine/frieza-orbit-view.js';
import {encodeText,wrapText} from '../engine/event-codec.js';

test('beam struggle instructions fit the original font and three-line window',()=>{
 for(const text of Object.values(orbitPrompts)){assert.doesNotThrow(()=>encodeText(text));assert.ok(wrapText(text).split('\n').length<=3);}
});

test('orbital steering stays on screen; charging slows movement and sprint restores evasion speed',()=>{
 const o=newOrbit({x:0,y:0});o.hero={x:100,y:100};steerOrbit(o,128);const walk=o.hero.x-100;
 o.hero.x=100;o.charge=20;steerOrbit(o,128|256);assert.ok(o.hero.x-100<walk);
 o.charge=0;o.hero.x=100;steerOrbit(o,128|256);assert.ok(o.hero.x-100>walk);
 for(let i=0;i<1000;i++)steerOrbit(o,256|128|32);
 assert.deepEqual(o.hero,{x:242,y:184});for(let i=0;i<1000;i++)steerOrbit(o,256|64|16);
 assert.deepEqual(o.hero,{x:14,y:20});
});
test('a blue beam repeatedly hits its visible lane and counters a Death Ball before it can collide again',()=>{
 const o=newOrbit({x:0,y:0}),b={x:100,y:50,shots:[{kind:'orb',x:80,y:50,age:5},{kind:'orb',x:80,y:100,age:5}]};
 o.intro=0;
 o.beam={x:20,y:50,dx:1,dy:0,age:0,max:60,width:20,damage:900};let damage=0;
 const hooks={hurt:n=>damage+=n,sound:()=>{},shake:()=>{}};
 for(let i=0;i<12;i++)tickOrbit(o,b,hooks);
 assert.equal(damage,1800);assert.equal(b.shots[0].age,999);assert.equal(b.shots[1].age,5);
 assert.equal(o.ricochets.length,1,'countered shot does not explode repeatedly');
 b.y=100;for(let i=0;i<6;i++)tickOrbit(o,b,hooks);assert.equal(damage,1800);
});
test('collateral bodies are established first; only one can explode per readable beat, and replay is exact',()=>{
 const o=newOrbit({x:200,y:500}),b={x:202,y:57,shots:[]};let booms=0;
 o.intro=0;
 const hooks={hurt:()=>{},sound:n=>{if(n==='fortressBreak')booms++;},shake:()=>{}};
 for(let i=0;i<orbitTargets.length;i++)ricochet(o,120,90,1,-1);
 for(let i=0;i<360;i++)tickOrbit(o,b,hooks);assert.equal(booms,0);assert.equal(o.collateral,null);
 for(let i=0;i<4;i++)ricochet(o,120,90,1,-1);
 for(let i=0;i<110;i++)tickOrbit(o,b,hooks);assert.equal(booms,0);const saved=structuredClone(o);
 for(let i=0;i<10;i++)tickOrbit(o,b,hooks);assert.equal(booms,1);assert.equal(o.destroyed.length,1);
 const replay=structuredClone(saved);for(let i=0;i<10;i++)tickOrbit(replay,b,{...hooks,sound:()=>{}});assert.deepEqual(replay,o);
 for(let i=0;i<3;i++)ricochet(o,120,90,1,-1);for(let i=0;i<140;i++)tickOrbit(o,b,hooks);
 assert.equal(booms,1);assert.equal(o.destroyed.length,1);assert.ok(o.impacts.length,'aftermath lingers');
});
