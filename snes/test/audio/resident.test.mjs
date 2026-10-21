// Exercise the shipping ROM's actual boot table on the real SPC driver.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,loadRom,driverChunks} from './apu.mjs';
import {effectRam,trackBytes,residentLayout} from '../../gen/audio-resident-storage.mjs';
import {NATIVE_IDS,RESIDENT} from '../../gen/audio-resident.mjs';

const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
test('resident effects preserve retail sequences and samples',()=>{
  const original=loadRom(),old=driverChunks(original),now=driverChunks(rom);
  const allowed=new Set(residentLayout(original,RESIDENT).patches.flatMap(p=>p.bytes.map((_,i)=>p.addr+i)));
  for(let c=0;c<old.length;c++){
    assert.equal(now[c].addr,old[c].addr);
    assert.equal(now[c].bytes.length,old[c].bytes.length);
    for(let i=0;i<old[c].bytes.length;i++){
      const a=old[c].addr+i;
      if(!allowed.has(a))assert.equal(now[c].bytes[i],old[c].bytes[i],`ARAM $${a.toString(16)}`);
    }
  }
  const before=effectRam(original),after=effectRam(rom);
  for(let id=0;id<0xDC;id++)for(let v=0;v<2;v++){
    const a=0x2C00+id*4+v*2,p=before[a]|before[a+1]<<8,q=after[a]|after[a+1]<<8;
    assert.deepEqual(trackBytes(after,q),trackBytes(before,p),`retail $${id.toString(16)} voice ${v}`);
  }
});
test('every mapped effect is audible, single-voice and self-terminating',()=>{
  const peaks=new Map();
  for(const id of new Set(NATIVE_IDS.slice(1,28))){
    const h=createApu({rom,extension:false});h.ms(60);h.take();
    h.nativeCmd(2,id,15,0x88);
    let used=0,last=0;
    for(let ms=0;ms<3000;ms+=5){
      h.ms(5);const mask=h.ram[0xAE];
      assert.ok((mask&(mask-1))===0,`${id.toString(16)} steals more than one voice`);
      used|=mask;if(mask)last=ms;
    }
    assert.ok(used,`effect ${id.toString(16)} never started`);
    assert.ok(last<2700,`effect ${id.toString(16)} still running at ${last} ms`);
    assert.equal(h.ram[0xAE],0,'voice returned to music');
    const {l}=h.take();let peak=0,tail=0;
    for(const v of l)peak=Math.max(peak,Math.abs(v));
    for(const v of l.slice(-3200))tail=Math.max(tail,Math.abs(v));
    assert.ok(peak>500&&peak<24000,`effect ${id.toString(16)} peak ${peak}`);
    assert.equal(tail,0,'no lingering rumble after the sequence ends');
    peaks.set(id,peak);
  }
  assert.ok(peaks.get(NATIVE_IDS[3])>peaks.get(NATIVE_IDS[1]),'contact is stronger than an empty swing');
  assert.equal(new Set(NATIVE_IDS.slice(20,23)).size,3,'orb, disc and laser have distinct timbres');
  assert.notEqual(NATIVE_IDS[25],NATIVE_IDS[8],'Fortress break is a burst');
  const layout=residentLayout(loadRom(),RESIDENT);assert.ok(layout.used<=layout.capacity);
});
