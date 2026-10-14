import test from'node:test';import assert from'node:assert/strict';import{createNativeFlight}from'../engine/native-flight.js';
test('world NMI repairs a skipped sky setup without altering overhead flight, ground Mode 7 or native sky frames',()=>{
 for(const kind of['lag','sky','overhead','ground','disabled']){
  const ram=new Uint8Array(0x20000),writes=[],cpu={r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}};
  ram.set([0x5c,0xcf,0x88,0,0x5c,0x4b,0x8a,0],0x100);ram[0xa9]=0x56;ram[0xaa]=0x34;
  const snes={ram,cpu,ppu:{mode:kind==='sky'?1:7},writeBBus(a,v){writes.push([a,v]);}};cpu.br[4]=0x8903;
  if(kind==='overhead')ram[0xf2]=128;if(kind==='ground')ram[0x101]=0xa8;
  const saved=ram.slice(),hook=createNativeFlight(snes,{enabled:()=>kind!=='disabled'});cpu.cycle();
  assert.deepEqual(writes,kind==='lag'?[[5,1],[13,0x56],[13,0x34]]:[]);assert.deepEqual(ram,saved);hook.dispose();
 }
});
