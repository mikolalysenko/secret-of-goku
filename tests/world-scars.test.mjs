import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldScars,blastTowns} from '../engine/world-scars.js';
import {encodeText,wrapText} from '../engine/event-codec.js';

function fixture(){
  const ram=new Uint8Array(0x20000),rom=new Uint8Array(0x200000),messages=[];
  blastTowns.forEach(([map],i)=>{rom[0x67a80+map*2]=20+(i%4)*55;rom[0x67a81+map*2]=20+Math.floor(i/4)*70;});
  const snes={ram,cart:{data:rom},ppu:{renderLine(){},getColor(){return[0,0,0];}}};
  const mod={radio:{say:t=>messages.push(t)},read16:a=>ram[a]|ram[a+1]<<8};
  const scars=createWorldScars(snes,mod);return{scars,messages};
}
test('a town blast leaves a saved crater and Goku promises to wish everyone back',()=>{
  const{scars,messages}=fixture(),potos=scars.targets()[0];scars.strike(potos,true);
  assert.equal(scars.status.length,1);assert.ok(scars.status[0].towns.includes(131));
  assert.ok(!scars.targets().some(t=>t.map===131));assert.match(messages.join('\n'),/Potos/);assert.match(messages.join('\n'),/wish\neveryone back/);
  for(const text of messages){encodeText(text);assert.ok(wrapText(text).split('\n').length<=3);}
  const saved=scars.snapshot();scars.restore();assert.equal(scars.status.length,0);scars.restore(saved);
  scars.strike(potos);assert.deepEqual(scars.status,saved);assert.equal(messages.length,2,'Repeated shots do not repeat the apology or erase the crater');
});
test('nearby blasts enlarge a crater while distant destruction stays recorded',()=>{
  const{scars}=fixture();scars.strike({x:4090,y:20});scars.strike({x:2,y:20},true);
  assert.equal(scars.status.length,1);assert.equal(scars.status[0].size,224);
  scars.strike({x:2000,y:2000});assert.equal(scars.status.length,2);
  const saved=scars.snapshot();scars.restore(saved);scars.strike({x:3000,y:1000});assert.equal(saved.length,2);
});
