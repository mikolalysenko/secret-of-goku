import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {bootLateGame} from '../engine/quick-boot.js';
import {isQuickStart,isLateStart} from '../engine/quick-start.js';

test('only explicit test-scene query names are accepted',()=>{
 for(const name of['late','battle','beast','explosion','good-ending'])assert.ok(isQuickStart(name)&&isLateStart(name));
 assert.ok(isQuickStart('sword'));assert.equal(isLateStart('sword'),false);
 for(const name of['constructor','__proto__','unknown',null,undefined])assert.equal(isQuickStart(name),false);
});
test('test boot restores its temporary native events on success and failure',{skip:!existsSync('.local/rom/secret-of-mana-us.sfc')},async()=>{
 const original=readFileSync('.local/rom/secret-of-mana-us.sfc');
 for(const fail of[false,true]){
  const rom=Uint8Array.from(original),mod={snes:{cart:{data:rom},ram:new Uint8Array(0x20000)},nameEditor:true,status:{map:431},canAttack:true,cancelInput(){}};
  let calls=0;
  const run=()=>bootLateGame({mod,pump:async()=>{calls++;assert.notDeepEqual(Buffer.from(rom),original);if(fail)throw Error('Interrupted boot');}});
  if(fail)await assert.rejects(run,/Interrupted boot/);else{await run();assert.ok(calls>=6);}
  assert.deepEqual(Buffer.from(rom),original,'No temporary cartridge bytes reach the checkpoint or next normal game');
 }
});
