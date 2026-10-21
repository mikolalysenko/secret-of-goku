// Cold-boot SPC evidence from the core's own savestate and audio callbacks.
// No ARAM/driver injection: only the existing main-thread sound queue is
// written. Locate ARAM by ROM signatures, not core-specific state offsets.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {driverChunks} from '../audio/apu.mjs';
import {uploadSegments} from '../audio/cartridge.mjs';

export function stateAram(state,rom){
  const chunks=driverChunks(rom),sample=chunks.find(c=>c.addr===0x4800);
  const signature=sample.bytes.subarray(0,128),hits=[];
  for(let at=state.indexOf(signature);at>=0;at=state.indexOf(signature,at+1)){
    const base=at-sample.addr;
    if(base<0||base+65536>state.length)continue;
    const ram=state.subarray(base,base+65536);
    if(!Buffer.from(ram.subarray(0x4800,0x4DF1)).equals(Buffer.from(sample.bytes)))continue;
    hits.push({base,ram});
  }
  assert.equal(hits.length,1,'find exactly one complete native effect sample bank in the core state');
  return hits[0];
}

export async function playAudio(h,{rom,state}){
  const res={checks:[],plays:[]};
  const check=(name,pass,detail='')=>res.checks.push({name,pass:!!pass,detail});
  await h.step({op:'loadstate',file:state});
  const read=async name=>{
    await h.step({op:'savestate',name});
    const found=stateAram(readFileSync(join(h.out,name+'.state')),rom);
    res.aramOffset=found.base;return found.ram;
  };
  const immutable=uploadSegments(rom).filter(s=>![0xE3,0x1818,0x1930,0x187C].includes(s.addr));
  const intact=ram=>immutable.every(s=>Buffer.from(ram.subarray(s.addr,s.addr+s.bytes.length)).equals(Buffer.from(s.bytes)));
  const boot=await read('boot');
  check('audio_boot_upload',intact(boot),'all immutable extension/sample/helper bytes match this ROM');
  await h.audio(true);await h.wait(12);
  res.music=await h.audio(true);
  check('audio_boot_music',boot[0xAD]!==0&&res.music.nonzero>100&&res.music.peak>500,
    `music mask $${boot[0xAD].toString(16)}, peak ${res.music.peak}, ${res.music.nonzero} nonzero stereo frames`);
  const send=async bytes=>{
    const head=await h.sram(0x348C,2),tail=await h.sram(0x348E,2);
    assert.equal(head,tail,'sound queue idle before the probe');
    const next=(tail+1)&7;
    await h.write('sram',0x34A0+tail*4,bytes);
    await h.write('sram',0x348E,[next,0]);
    assert.ok(await h.waitFor(async()=>await h.sram(0x348C,2)===next,12),'main thread consumed sound request');
  };
  // Isolate effects so nonzero output cannot be supplied by background music.
  await send([0xF0,0,0,0]);await h.wait(90);
  const silent=await read('stopped');
  check('audio_stop_music',silent[0xAD]===0&&silent[0xAE]===0,'native global stop returned all voices');
  const rates=[0,9,0xFA],variation=immutable.some(s=>s.addr===0x180);
  for(let i=0;i<(variation?6:1);i++)for(const id of [0xE5,0xE7,0xDE]){
    await h.audio(true);await send([2,id,15,0x88]);await h.wait(8);
    const ram=await read(`cue-${id.toString(16)}-${i}`);
    const p=0x2C00+id*4+(id===0xE7?2:0),track=ram.readUInt16LE(p);
    const tune=ram[track+7],tuple=id===0xE5?[tune,ram[track+12],ram[track+10]]:[tune];
    await h.wait(40);const sound=await h.audio();
    const pass=sound.nonzero>100&&sound.peak>500&&sound.clipped===0&&
      (!variation||(ram[track+6]===0xE9&&tune===rates[i%3]&&
        (id!==0xE5||(tuple[1]===(i%2?3:6)&&tuple[2]===(i%2?0xF7:0xFB)))));
    res.plays.push({id,play:i,tuple,sound});
    check(`audio_cue_${id.toString(16)}_${i}`,pass,`tuple ${tuple.join('/')}, peak ${sound.peak}, clipped ${sound.clipped}`);
  }
  // Both finisher ids must work from the core's cold boot, release the
  // preceding whoosh and return their two voices (including the new F1).
  const finishers=boot.readUInt16LE(0x2FC4)===boot.readUInt16LE(0x2F9C)?[0xE8,0xF1]:[0xE8];
  for(const id of finishers){
    await h.audio(true);await send([2,0xE6,15,0x88]);await h.wait(1);
    await send([2,id,15,0x88]);await h.wait(3);
    const playing=await read(`kick-${id.toString(16)}`);
    const ids=Array.from({length:8},(_,v)=>v).filter(v=>playing[0xAE]&(1<<v)).map(v=>playing[0xFF80+v]);
    await h.wait(35);const sound=await h.audio();
    const stopped=await read(`kick-${id.toString(16)}-ended`);
    check(`audio_kick_${id.toString(16)}`,ids.length>=1&&ids.every(v=>v===id)&&stopped[0xAE]===0&&sound.nonzero>100&&sound.clipped===0,
      `voices ${ids.join('/')}, returned ${stopped[0xAE]===0}, peak ${sound.peak}, clipped ${sound.clipped}`);
    res.plays.push({id,sound});
  }
  const after=await read('after');
  check('audio_bank_preserved',intact(after)&&after[0xAE]===0,'helper/bank intact; all effect voices returned');
  writeFileSync(join(h.out,'audio.json'),JSON.stringify(res,null,1));
  return res;
}
