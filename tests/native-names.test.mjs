import test from 'node:test';
import assert from 'node:assert/strict';
import {crownGoku,displayName,nameText,withNames,createNativeNames,nameSlot,boyTail} from '../engine/native-names.js';
import {encodeText,wrapText} from '../engine/event-codec.js';

const ramWith=names=>{const ram=new Uint8Array(0x20000);names.forEach((name,n)=>name&&ram.set(encodeText(name),nameSlot(n)));return ram;};

test('the crash crowns GOKU and keeps the title-screen name for {3}',()=>{
  const ram=ramWith(['Mikola']);crownGoku(ram);
  assert.deepEqual([...ram.slice(0xcc00,0xcc06)],[0xa1,0xa9,0xa5,0xaf,0,0],'slot 0 is GOKU, terminated');
  assert.equal(nameText(ram,0),'GOKU');assert.equal(nameText(ram,3),'Mikola');
  crownGoku(ram);assert.equal(nameText(ram,3),'Mikola','crowning twice keeps the boy');
  const kept=ramWith(['BOY']);crownGoku(kept);assert.equal(nameText(kept,3),'Randi','the editor default reads as Randi');
  const old=ramWith(['GOKU']);assert.equal(nameText(old,3),'Randi','saves from before the tail existed');
});

test('companions show their native names, or the retail default before naming',()=>{
  const ram=ramWith(['GOKU','Ann']);
  ram.fill(0xff,nameSlot(2),nameSlot(3));   // a new game's unnamed slot
  assert.equal(nameText(ram,1),'Ann');assert.equal(nameText(ram,2),'Popoi');
  assert.equal(withNames(ram,'{1}:Find {2}!\n{3} too.'),'Ann:Find Popoi!\nRandi too.');
  assert.deepEqual(encodeText('{3}:Hi'),[0x57,3,...encodeText(':Hi')]);
  assert.equal(wrapText('GOKU:Bring back {3}, Dyluck and'),'GOKU:Bring back {3},\nDyluck and','a code is six letters wide');
});

test('only the cartridge name-copy loop sees the virtual slot and defaults',()=>{
  const ram=ramWith(['GOKU']);ram.set(encodeText('Kid'),boyTail);
  const rom=new Uint8Array(0x2000);rom.set([0xbd,0x00,0xcc,0x99,0x2f,0xa2],0x1866);
  const cpu={br:[0,0,0,0,0],r:[0,0xc0]},snes={ram,cpu,read(address){return ram[address&0x1ffff];}};
  const names=createNativeNames(snes);assert.equal(names.load(rom),true);
  const copy=(n,pc=0x1869)=>{cpu.br[4]=pc;const out=[];for(let i=0;i<12;i++)out.push(snes.read(0x7ecc00+n*12+i));return out;};
  assert.deepEqual(copy(3).slice(0,4),[...encodeText('Kid'),0]);
  assert.deepEqual(copy(1).slice(0,6),[...encodeText('Primm'),0]);
  assert.deepEqual(copy(0).slice(0,5),[0xa1,0xa9,0xa5,0xaf,0]);
  assert.equal(copy(3,0x2000)[0],ram[0xcc24],'other code reads the real bytes');
  assert.equal(names.load(new Uint8Array(0x2000)),false);assert.equal(copy(3)[0],ram[0xcc24],'unknown ROM: no hook');
});
