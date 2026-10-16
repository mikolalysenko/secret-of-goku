import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeEquipment,TRAINING_GI,NO_BODY_ARMOR} from '../engine/native-equipment.js';

function setup(){
 const snes={ram:new Uint8Array(0x20000),cpu:{cycle(){},br:new Uint16Array(8),r:new Uint8Array(4)}},mod={options:{enabled:true,power:true},gokuActive:true};
 const r=snes.ram;r[0xe000]=1;r[0xe189]=100;r[0xe1e1]=TRAINING_GI;r[0xcc2c]=0x40|TRAINING_GI;r[0xcc2d]=0x80|23;
 return{snes,r,mod,gear:createNativeEquipment(snes,mod)};
}
test('weighted agility does not stack across frames, native rebuilds, forms, or checkpoint restores',()=>{
 const {gear,r,mod,snes}=setup();for(let i=0;i<600;i++)gear.tick();assert.equal(r[0xe189],80);assert.equal(gear.powerScale,.9);
 const saved=gear.snapshot();gear.restore(saved);gear.tick();assert.equal(r[0xe189],80);
 mod.options.superSaiyan=true;gear.tick();assert.equal(r[0xe189],80);
 // The full native rebuild writes a fresh value, even if it happens to
 // equal the old penalized value. Apply after armor/spell bonuses, not at
 // the intermediate level-table load.
 r[0xe189]=80;snes.cpu.cyclesLeft=0;snes.cpu.br[4]=0x4699;snes.cpu.cycle();assert.equal(r[0xe189],80);
 snes.cpu.br[4]=0x4bf6;snes.cpu.cycle();gear.tick();assert.equal(r[0xe189],64);
 snes.cpu.cycle();gear.tick();assert.equal(r[0xe189],64,'a weapon-only rebuild does not apply weight twice');
 r[0xe1e1]=0;gear.tick();assert.equal(r[0xe189],80);assert.equal(gear.powerScale,1);
 r[0xe1e1]=TRAINING_GI;gear.tick();assert.equal(r[0xe189],64);
 mod.options.enabled=false;gear.tick();assert.equal(r[0xe189],80);assert.equal(gear.powerScale,1);
});
test('confiscating training clothes unequips without losing inventory or touching companions',()=>{
 const {gear,r}=setup();gear.tick();assert.equal(gear.confiscate(),true);
 assert.equal(r[0xe1e1],NO_BODY_ARMOR);assert.equal(r[0xe189],100);assert.equal(gear.powerScale,1);
 assert.equal(r[0xcc2c],TRAINING_GI);assert.equal(r[0xcc2d],0x80|23);
 assert.equal(gear.confiscate(),false);
 r[0xe1e1]=23;assert.equal(gear.confiscate(),false);assert.equal(r[0xe1e1],23);
});
