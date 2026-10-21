// Exercise the shipping ROM's actual boot table on the real SPC driver.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,loadRom,driverChunks,loadSong} from './apu.mjs';
import {effectRam,trackBytes,residentLayout} from '../../gen/audio-resident-storage.mjs';
import {NATIVE_IDS as DEFAULT_IDS,RESIDENT,effectVoices} from '../../gen/audio-resident.mjs';
import {isCustom,isResident7,sampleFloor,nativeEffectVoices,nativeIds} from './cartridge.mjs';
import {songNoise} from './audit.mjs';
import {measure} from './punch.mjs';

const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const custom=isCustom(rom),NATIVE_IDS=nativeIds(rom,DEFAULT_IDS);
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
test('every mapped effect is audible, within its voice budget and self-terminating',()=>{
  const peaks=new Map();
  for(const id of new Set(NATIVE_IDS.slice(1,28))){
    const h=createApu({rom,extension:false});h.ms(60);h.take();
    h.nativeCmd(2,id,15,0x88);
    let used=0,last=0,maxVoices=0;
    for(let ms=0;ms<3000;ms+=5){
      h.ms(5);const mask=h.ram[0xAE];
      const voices=mask.toString(2).replaceAll('0','').length;
      maxVoices=Math.max(maxVoices,voices);
      assert.ok(voices<=nativeEffectVoices(rom,id),`${id.toString(16)} exceeds its voice budget`);
      used|=mask;if(mask)last=ms;
    }
    assert.ok(used,`effect ${id.toString(16)} never started`);
    assert.equal(maxVoices,nativeEffectVoices(rom,id));
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
test('contacts have immediate crunch and bass, and the wave sustains its roar',()=>{
  for(const id of [NATIVE_IDS[3],NATIVE_IDS[4]]){
    const m=measure(rom,id);
    assert.ok(m.timeToPeakMs<12,`late contact peak: ${m.timeToPeakMs}`);
    assert.ok(m.peakDbFS>-10&&m.peakDbFS<(isResident7(rom)?-2.5:-3),`contact headroom: ${m.peakDbFS}`);
    assert.ok(m.low80Energy>.3&&m.high30Energy>.035,'bass body and broadband attack');
    assert.ok(m.durationMs>=(isResident7(rom)?90:120)&&m.durationMs<=250,'short contact tail');
    assert.ok(m.voiceMs<=(custom?350:250),'second voice only steals music for a short transient');
  }
  const beam=measure(rom,NATIVE_IDS[8],{echo:true});
  assert.ok(beam.durationMs>=1050&&beam.durationMs<1400);
  assert.ok(beam.low80Energy>.2&&(isResident7(rom)||beam.high30Energy>(custom?.0001:.01)));
  assert.ok(beam.ownershipMs>=1040&&beam.ownershipMs<1150);
});
test('repeated impacts and a wave beside every arrangement retain output headroom',()=>{
  const songs=JSON.parse(readFileSync('dist/snes/gen/audio/songs.json','utf8'));
  if(custom)for(const s of songs)s.echo.edl=Math.min(s.echo.edl,Math.floor((0xFA00-1-sampleFloor(rom)-s.sampleBytes)/0x800));
  for(const s of songs){
    const h=createApu({rom});h.ms(60);
    loadSong(h,rom,{blob:readFileSync(`dist/snes/gen/audio/song_${s.id.toString(16)}.bin`),instruments:s.instruments.map(i=>i.id),echo:s.echo,song:s.id,p2:0x10,p3:0xff});
    h.waitFor(()=>h.ram[0xAD]===0xFF&&h.dspReg(0x2C)===s.echo.evol,4e7);h.ms(300);h.take();
    const samples=h.ram.slice(0x4800,0xFA00-0x800*s.echo.edl);
    // Rapid mixed contacts, plus impacts over the sustained wave, at four
    // different musical phases. Requests never exceed one per video frame.
    for(let cycle=0;cycle<4;cycle++){
      for(const cue of [1,3,2,4,5,6,3,4]){h.nativeCmd(2,NATIVE_IDS[cue],15,0x88);h.ms(90);}
      h.nativeCmd(2,NATIVE_IDS[8],15,0x88);
      // The full wave damages a surviving target every six video frames.
      // Its roar and impact share the hardware's single noise clock.
      for(let pulse=0;pulse<9;pulse++){h.ms(6000/60.0988);h.nativeCmd(2,NATIVE_IDS[6],15,0x88);}
      h.ms(500);
    }
    h.ms(1600);
    assert.equal(h.ram[0xAD],0xFF,'music tracks alive');
    assert.equal(h.ram[0xAE],0,'all effect voices returned');
    assert.equal(h.dspReg(0x3D),0,'no lingering noise');
    assert.deepEqual(h.ram.slice(0x4800,0xFA00-0x800*s.echo.edl),samples,'samples unchanged');
    const {l,r}=h.take();let peak=0,clipped=0;
    for(const a of [l,r])for(const v of a){peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>=32767)clipped++;}
    assert.equal(clipped,0,`song $${s.id.toString(16)} clips`);
    assert.ok(peak<30000,`song $${s.id.toString(16)} has too little headroom: ${peak}`);
    console.log(`resident mix $${s.id.toString(16)} peak ${(20*Math.log10(peak/32768)).toFixed(2)} dBFS`);
  }
});
test('noise cues restore the song clock on completion and release ownership on interruption',()=>{
  for(const source of [loadRom(),rom]){
    const songs=songNoise(source);
    assert.equal(songs.length,64);
    for(const s of songs){assert.ok(s.commands>0);assert.deepEqual(s.noise,[],`song ${s.id} uses global noise`);}
  }
  for(const id of [0xEB,0xE7,0xE8,0xEA,0x38])for(const stop of ['end','replace','stop']){
    const h=createApu({rom,extension:false});h.ms(60);
    // A nonzero music noise clock proves restoration rather than reset to 0.
    h.ram[0xC5]=13;h.ram[0xBB]=(h.ram[0xBB]&0xE0)|13;
    h.nativeCmd(2,id,15,0x88);h.ms(60);
    if(id===0xEB&&!isResident7(rom)){assert.equal(h.dspReg(0x6C)&31,28);assert.ok(h.dspReg(0x3D));}
    if(stop==='replace'){h.nativeCmd(2,id,15,0x88);h.ms(60);}
    if(stop==='stop')h.nativeCmd(0xF2);
    h.ms(1200);
    assert.equal(h.ram[0xAE],0,'voice returned');
    assert.equal(h.dspReg(0x3D),0,'NON cleared');
    if(stop!=='stop')assert.equal(h.dspReg(0x6C)&31,13,'music noise clock restored');
    // The retail global-stop command leaves FLG's last clock but clears NON
    // and the effect-priority bit. No shipping song uses noise; its next
    // DD/DE would select C5 again. Do not patch the driver to change this.
    else assert.equal(h.ram[0xB1]&16,0,'global stop released noise priority');
    assert.equal(h.dspReg(0x2D),0,'PMON clear');
  }
});
