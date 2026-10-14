import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {installArrivalEventData} from '../engine/arrival-event-data.js';
import {createArrival} from '../engine/arrival.js';
import {decodePotosCrater} from '../engine/native-crater.js';

const path=new URL('../.local/rom/secret-of-mana-us.sfc',import.meta.url);
const local={skip:!existsSync(path)};
const cartridge=bytes=>({data:new Uint8Array(bytes),read(bank,address){return this.data[((bank&0x1f)<<16)|address];}});

test('native event overlay changes cartridge reads only, including restoring the original BOY grunt',local,async()=>{
  const rom=await readFile(path),cart=cartridge(rom),nativeRead=cart.read;
  cart.data.fill(0x80,0x92691,0x9269d);const before=cart.data.slice(),event=installArrivalEventData(cart,rom);
  assert.deepEqual(cart.data,before);
  for(let at=0x74400;at<0x75000;at++)assert.equal(cart.read(0xc7,at&0xffff),at<0x74400+event.script.length?event.script[at-0x74400]:rom[at]);
  for(let at=0x2691;at<0x269d;at++)assert.equal(cart.read(0xc9,at),rom[0x90000+at]);
  assert.equal(cart.read(0xc9,0x269f),rom[0x9269f]);
  for(const [stage,next]of [['descent','impact'],['impact','ghost'],['ghost','dialogue']]){
    assert.equal(event.classify(event.labels[`${stage}Wait`]),stage,'the native pause PC must not advance the visual phase early');
    assert.equal(event.classify(event.labels[next]),next);
  }
  assert.equal(event.classify(event.labels.finish),'finish');assert.equal(event.classify(event.resume),null);
  assert.ok(event.pages.some(page=>page.includes('Try walking.')));assert.equal(event.dispose(),true);assert.equal(cart.read,nativeRead);
});

function fixture(rom){
  const ram=new Uint8Array(0x20000),ppu={mode:1,cgram:new Uint16Array(256),renderLine(){},selectedLayer:0,getColor(){return [1234,this.selectedLayer,33];}},snes={ram,ppu,cart:cartridge(rom)};
  const mod={options:{enabled:true},read8:a=>ram[a],read16:a=>ram[a]|ram[a+1]<<8,readSigned16:a=>(ram[a]|ram[a+1]<<8)<<16>>16,write8:(a,v)=>{ram[a]=v;},write16:(a,v)=>{ram[a]=v;ram[a+1]=v>>8;}};
  mod.write16(0xdc,128);ram[0xe4]=ram[0xe5]=ram[0xe000]=1;mod.write16(0xe002,500);mod.write16(0xe004,948);mod.write16(0xe020,100);mod.write16(0xe022,120);
  const arrival=createArrival(snes,mod);arrival.load(rom);return{snes,mod,arrival,ppu,ram};
}

test('BOY becomes GOKU only at impact, and the native event resumes without inventing story flags',local,async()=>{
  const rom=await readFile(path),{mod,arrival,ram,snes}=fixture(rom),descriptor=installArrivalEventData(cartridge(rom),rom);
  const at=pc=>{mod.write16(0xd1,pc);mod.write8(0xd3,pc>>16);};
  const pc=()=>mod.read16(0xd1)|(ram[0xd3]<<16);
  assert.equal(arrival.arrived,false);at(descriptor.hook);ram[0xd0]=0x82;arrival.beforeFrame();
  assert.equal(pc(),descriptor.entry);assert.equal(arrival.phase,'queued');arrival.beforeFrame();assert.equal(arrival.phase,'queued');
  at(descriptor.labels.descentWait);arrival.beforeFrame();assert.equal(arrival.phase,'descent');assert.equal(arrival.arrived,false);
  at(descriptor.labels.impact);arrival.beforeFrame();assert.equal(arrival.arrived,true);assert.equal(arrival.crater,true);
  assert.deepEqual([...snes.ram.slice(0xcc00,0xcc06)],[0xa1,0xa9,0xa5,0xaf,0,0]);
  assert.equal(ram[0xcf10],0,'the native script, not the controller, removes the sword and advances story flags');
  for(let i=0;i<40;i++)arrival.beforeFrame();const saved=arrival.snapshot();
  arrival.restore({version:1,phase:'prologue'});assert.equal(arrival.arrived,false);arrival.restore(saved);assert.equal(arrival.ticks,40);
  at(descriptor.labels.finish);arrival.beforeFrame();assert.equal(pc(),descriptor.resume);assert.equal(ram[0xd0],1);assert.equal(arrival.phase,'complete');
  ram[0xd0]=0;ram[0x49]=0x60;arrival.beforeFrame();assert.equal(ram[0x49],0,'old completed checkpoints lose the lingering weak quake');
  ram[0x49]=0xe0;arrival.beforeFrame();assert.equal(ram[0x49],0xe0,'later effects keep their ownership');
  // Existing native checkpoints still distinguish before/after-sword progress.
  arrival.restore();assert.equal(arrival.arrived,false);ram[0xcf10]=1;arrival.restore();assert.equal(arrival.arrived,true);
  ram[0xe4]=ram[0xe5]=0;arrival.restore();arrival.beforeFrame();assert.equal(arrival.arrived,false,'uninitialized title/menu flag memory is not story progress');
});

test('native crater stays underneath OBJ and dialogue and follows the original palette flash',local,async()=>{
  const rom=await readFile(path),decoded=decodePotosCrater(rom),{arrival,ppu}=fixture(rom);
  assert.equal(decoded.opaque,782);assert.deepEqual(decoded.bounds,{x:5,y:3,width:38,height:29});
  for(let p=1;p<=6;p++)for(let i=1;i<16;i++){const at=0xc8000+26*210+(p-1)*30+(i-1)*2;ppu.cgram[p*16+i]=rom[at]|rom[at+1]<<8;}
  arrival.restore({version:1,phase:'complete',arrived:true,started:true,crater:true});ppu.renderLine(0);
  const index=decoded.pixels.findIndex(Boolean),x=100-48+(index%48)*2,y=120-32+Math.floor(index/48)*2,expected=decoded.pixels[index]-1;
  assert.equal(ppu.getColor(false,x,y)[0],expected);
  for(let i=0x6b;i<=0x6f;i++)ppu.cgram[i]=0x7fff;ppu.renderLine(0);
  assert.equal(ppu.getColor(false,x,y)[0],expected,'river palette cycling must not recolor the crater');
  for(const layer of [2,4]){ppu.selectedLayer=layer;assert.equal(ppu.getColor(false,x,y)[0],1234);}
  ppu.selectedLayer=0;ppu.cgram.fill(0x7fff);ppu.renderLine(0);assert.notEqual(ppu.getColor(false,x,y)[0],expected);
  ppu.mode=5;ppu.renderLine(0);assert.equal(ppu.getColor(false,x,y)[0],1234);
});
