import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function core(){
 const Stub=class{reset(){}},context={Cpu:Stub,Ppu:Stub,Apu:Stub,Uint8Array,Uint16Array,clearArray:a=>a.fill(0)};
 vm.runInNewContext(readFileSync(new URL('../vendor/snes/snes.js',import.meta.url),'utf8'),context);
 const snes=new context.Snes(),memory=new Uint8Array(65536),writes=[];
 snes.read=address=>memory[address&65535];snes.writeBBus=(address,value)=>writes.push([address,value]);
 snes.dmaAadr[6]=0x100;snes.dmaBadr[6]=0x21;
 return{snes,memory,writes};
}
test('an empty HDMA table cannot write bytes beyond its terminator into CGRAM',()=>{
 const{snes,memory,writes}=core();memory.set([0,0x73,0x99],0x100);snes.hdmaActive[6]=true;snes.initHdma();
 for(let i=0;i<240;i++)snes.handleHdma();assert.deepEqual(writes,[]);assert.equal(snes.hdmaTableAdr[6],0x101);
});
test('late HDMA enable waits for table setup instead of underflowing the stale zero line counter',()=>{
 const{snes,memory,writes}=core();memory.set([1,0,0],0x100);snes.hdmaTableAdr[6]=0x400;memory.fill(0x91,0x400,0x600);
 snes.initHdma();snes.writeReg(0x420c,0x40);for(let i=0;i<224;i++)snes.handleHdma();assert.deepEqual(writes,[]);
 snes.initHdma();snes.handleHdma();assert.deepEqual(writes,[[0x21,0]]);assert.equal(snes.hdmaTerminated[6],true);
});
