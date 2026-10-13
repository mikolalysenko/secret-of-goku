import test from 'node:test';
import assert from 'node:assert/strict';
import {createCeilingEscape} from '../engine/ceiling-escape.js';
import {ceilingExitFor} from '../engine/ceiling-exits.js';

test('peaceful palace and shop rooms have native exterior routes too',()=>{
  for(const [map,outside]of [[135,136],[137,136],[139,136],[142,136],[257,131],[259,131],[279,132],[261,144],[274,224],[282,224],[287,25],[293,25],[298,228],[376,89],[125,113],[342,63],[51,24]]){
    assert.equal(ceilingExitFor(map)?.map,outside,`Roof exit for room ${map}`);
  }
});
test('roof exits respect live bosses, native dialogue, and an escape already underway',()=>{
  let dead=false,enemies=[];
  const mod={options:{enabled:true},gokuActive:true,canAttack:true,read16:()=>139,read8:()=>dead?128:0,
    entities:()=>enemies,status:{map:139,x:440,y:960},cancelCombat(){},playSound(){}};
  const ceiling=createCeilingEscape(mod);
  mod.canAttack=false;assert.equal(ceiling.request(),false);mod.canAttack=true;
  enemies=[{index:3,base:0xe600,active:true,species:127,hp:40000}];assert.equal(ceiling.request(),false);
  dead=true;assert.equal(ceiling.request(),true);assert.equal(ceiling.request(),false);assert.equal(ceiling.status.holes,0);
  ceiling.restore();dead=false;enemies[0].species=0;
  assert.equal(ceiling.request(),true,'Ordinary monsters do not prevent taking off');
});
