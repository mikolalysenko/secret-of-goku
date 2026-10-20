// Exercise the shipping ROM's actual boot table on the real SPC driver.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,loadRom,driverChunks} from './apu.mjs';

const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
test('resident effects preserve retail sequences and samples',()=>{
  const old=driverChunks(loadRom()),now=driverChunks(rom);
  for(let c=0;c<old.length;c++){
    assert.equal(now[c].addr,old[c].addr);
    assert.equal(now[c].bytes.length,old[c].bytes.length);
    for(let i=0;i<old[c].bytes.length;i++){
      const a=old[c].addr+i;
      if(a<0x2F70||a>=0x3000)assert.equal(now[c].bytes[i],old[c].bytes[i],`ARAM $${a.toString(16)}`);
      else assert.equal(old[c].bytes[i],0,'only unused table bytes replaced');
    }
  }
});
test('every gameplay effect is audible, single-voice and ends within half a second',()=>{
  const peaks=[];
  for(let id=0xDC;id<=0xE2;id++){
    const h=createApu({rom,extension:false});h.ms(60);h.take();
    h.nativeCmd(2,id,15,0x88);
    let used=0,last=0;
    for(let ms=0;ms<800;ms+=5){
      h.ms(5);const mask=h.ram[0xAE];
      assert.ok((mask&(mask-1))===0,`${id.toString(16)} steals more than one voice`);
      used|=mask;if(mask)last=ms;
    }
    assert.ok(used,`effect ${id.toString(16)} never started`);
    assert.ok(last<500,`effect ${id.toString(16)} still running at ${last} ms`);
    assert.equal(h.ram[0xAE],0,'voice returned to music');
    const {l}=h.take();let peak=0,tail=0;
    for(const v of l)peak=Math.max(peak,Math.abs(v));
    for(const v of l.slice(-3200))tail=Math.max(tail,Math.abs(v));
    assert.ok(peak>1000&&peak<16000,`effect ${id.toString(16)} peak ${peak}`);
    assert.equal(tail,0,'no lingering rumble after the sequence ends');
    peaks.push(peak);
  }
  assert.ok(peaks[1]>peaks[0]*1.5,'contact is stronger than an empty swing');
});
