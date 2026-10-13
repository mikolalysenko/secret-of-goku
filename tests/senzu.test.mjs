import test from 'node:test';
import assert from 'node:assert/strict';
import {renameSenzu,createNativeSenzu} from '../engine/native-senzu.js';
import {encodeText,decodeText} from '../engine/event-codec.js';
test('Senzu naming covers singular, plural and wrapped dialogue',()=>{
 assert.equal(renameSenzu('Found a Cup of Wishes! Cups of\nWishes revive allies.'),'Found a Senzu Bean! Senzu Beans revive allies.');
});
test('native item table overlay changes the shared name without editing cartridge data',()=>{
 const data=new Uint8Array(0x200000);data.set(encodeText('Cup of Wishes'),0xaa120);
 const cart={data,read:(bank,address)=>data[(bank&63)*65536+address]},mod={options:{enabled:true}},snes={ram:new Uint8Array(0x20000),cpu:{cycle(){}},cart};
 createNativeSenzu(snes,mod).load();
 assert.match(decodeText(Uint8Array.from({length:10},(_,i)=>cart.read(0xca,0xa120+i))),/^Senzu Bean/);
 assert.equal(decodeText(data.slice(0xaa120,0xaa12d)),'Cup of Wishes');
 mod.options.enabled=false;assert.equal(cart.read(0xca,0xa120),encodeText('C')[0]);
});
