import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleRetry} from '../engine/battle-retry.js';

test('fatal damage freezes before a native death warp and retry restores the phase, inventory and input',()=>{
 let state={map:246,hp:999,queue:0,phase:'frieza:0',beans:4,clock:20},defeats=0,clears=0;
 const mod={get canAttack(){return true;},frieza:{get encounter(){return state.phase;}},read16:a=>({[0xdc]:state.map,[0xe182]:state.hp,[0xe1f1]:state.queue})[a],cancelCombat(){},cancelInput(){clears++;},teleport:{restore(){}}};
 const retry=createBattleRetry(mod,{capture:()=>structuredClone(state),restore:s=>{state=structuredClone(s);},onDefeat:()=>defeats++});
 assert.equal(retry.check(),false);state.beans=2;state.hp=0;state.clock=300;
 assert.equal(retry.check(),true);assert.equal(retry.check(),true);assert.equal(defeats,1);
 assert.equal(retry.retry(),true);assert.deepEqual(state,{map:246,hp:999,queue:0,phase:'frieza:0',beans:4,clock:20});assert.equal(clears,1);
 state.phase='frieza:1';state.hp=700;state.beans=3;retry.check();state.hp=0;retry.check();retry.retry();
 assert.equal(state.hp,700);assert.equal(state.beans,3);assert.equal(retry.encounter,'frieza:1');
 state.map=128;state.phase=null;retry.check();state.map=246;state.hp=0;assert.equal(retry.check(),false,'Leaving the arena clears the old retry');
});
