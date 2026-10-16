import test from 'node:test';
import assert from 'node:assert/strict';
import {opposingBeams,createTrainingClash,mashTrainingClash,tickTrainingClash,trainingClashPoint} from '../engine/vegeta-clash.js';
const player={x:100,y:140,dx:1,dy:0,super:true},enemy={x:260,y:140,dx:-1,dy:0,length:80,halfWidth:17},geometry={length:96,halfWidth:40};
const start=()=>createTrainingClash(player,enemy,{x:88,y:152},{x:272,y:152},1);
test('only head-on, overlapping waves lock, preserving misses and the chosen firing direction',()=>{
 assert.ok(opposingBeams(player,geometry,enemy));
 assert.equal(opposingBeams(player,{...geometry,length:70},enemy),false,'Both wave fronts must actually arrive');
 for(const change of[{dx:1},{dx:0,dy:1},{x:80},{y:180}])assert.equal(opposingBeams(player,geometry,{...enemy,...change}),false);
});
test('clashes compress before mashing, require fresh taps, and visibly push back during surges',()=>{
 const c=start();for(let n=0;n<83;n++)tickTrainingClash(c);
 assert.equal(c.phase,'focus');assert.equal(mashTrainingClash(c,1),false);tickTrainingClash(c);assert.equal(c.phase,'struggle');
 mashTrainingClash(c,0);assert.ok(mashTrainingClash(c,1));const taps=c.taps;
 for(let n=0;n<40;n++){tickTrainingClash(c);mashTrainingClash(c,1);}
 assert.equal(c.taps,taps,'Holding a button is not mashing');
 const before=trainingClashPoint(c).x;
 for(let n=0;n<40;n++){tickTrainingClash(c);mashTrainingClash(c,n%10<2?1:0);}
 assert.ok(trainingClashPoint(c).x>before,'Repeated fresh taps move the collision ball toward Vegeta');
 while(c.age<99)tickTrainingClash(c);const pressure=c.pressure;
 assert.equal(tickTrainingClash(c),'surge');assert.ok(c.pressure<pressure-.09);
});
test('both winning and losing finish safely, and saved clashes replay deterministically',()=>{
 for(const mash of[false,true]){
  const c=start();let result,frames=0;
  for(;frames<900&&result!=='done';frames++){result=tickTrainingClash(c);mashTrainingClash(c,mash&&frames%10<2?1:0);}
  assert.equal(result,'done');assert.equal(c.result,mash?'win':'lose');
  assert.ok(frames>=160,'A full beam exchange plays before resolving');
  assert.deepEqual(trainingClashPoint(c),mash?{x:260,y:140}:{x:100,y:140});
 }
 const c=start();for(let n=0;n<150;n++)tickTrainingClash(c);const restored=structuredClone(c);
 for(let n=0;n<150;n++)for(const state of[c,restored]){tickTrainingClash(state);mashTrainingClash(state,n%12<2?1:0);}
 assert.deepEqual(restored,c);
});
