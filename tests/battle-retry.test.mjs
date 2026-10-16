import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleRetry} from '../engine/battle-retry.js';
import {bossRushDeathTiming as T} from '../engine/boss-rush-death.js';

test('each final boss defeat lets the actor die, then runs a terminal, non-retry ending',()=>{
 for(const phase of['thanatos','frieza:0','frieza:1','frieza:2','beast']){
  const state={map:phase==='beast'?253:246,hp:999,beans:4,clock:20};let ending=null,defeats=0,finished=0,pictures=0;
  const mod={options:{enabled:true},gokuActive:true,frame:0,canAttack:true,
   frieza:{encounter:phase.startsWith('frieza')?phase:null},
   entities:()=>[{species:phase==='beast'?127:121,active:true,hp:100}],
   read16:a=>({[0xdc]:state.map,[0xe182]:state.hp})[a],teleport:{restore(){}},
   ending:{get active(){return !!ending;},get defeated(){return !!ending;},get nativeDeath(){return phase!=='frieza:2'&&ending?.age<T.black;},get complete(){return ending?.age===T.gameOver;},get status(){return ending;},lose(encounter){ending={encounter,age:0};},tick(){ending.age++;}},
   planetView:{renderDefeat(){pictures++;}}};
  const retry=createBattleRetry(mod,{onDefeat:()=>defeats++,onGameOver:()=>finished++});
  assert.equal(retry.check(),false);state.beans=2;state.hp=0;state.clock=300;
  assert.equal(retry.check(),true);assert.equal(retry.check(),true);assert.equal(defeats,1);assert.equal(retry.encounter,phase);
  assert.equal(retry.retry(),false);for(let i=0;i<T.gameOver+10;i++)retry.tick(()=>{state.clock++;mod.frame++;mod.ending.tick();});
  assert.equal(retry.gameOver,true);assert.equal(finished,1);assert.equal(mod.frame,T.gameOver);assert.equal(pictures,T.gameOver+10);
  assert.equal(state.hp,0);assert.equal(state.beans,2);assert.equal(state.clock,300+(phase==='frieza:2'?0:T.black));
  retry.clear();assert.equal(retry.check(),true,'a restored terminal ending cannot resume the fight');
 }
});
