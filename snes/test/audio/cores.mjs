// All five cues on the actual libretro SPC implementations, with complete
// ARAM byte checks from their serialized states. Run emulators/run.mjs first
// to create this worktree's waterfall battery saves. No state-format offsets
// are assumed: identify ARAM by two unchanged driver instruction spans.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {RetroHost,buildHost,findCore} from '../emulators/retro.mjs';
import {playBatteryLoad} from '../emulators/scenario.mjs';
import {driverChunks,romSong,romInstrument} from './apu.mjs';
const repo=resolve(import.meta.dirname,'../../..');
const romFile=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
const rom=readFileSync(romFile),driver=Buffer.from(driverChunks(rom)[0].bytes);
const signature=driver.subarray(0x200,0x280),second=driver.subarray(0x400,0x480);
const root=join(repo,'.local/snes-test/audio/cores'),host=buildHost();
const variants=[
 ['snes9x','snes9x',{}],['bsnes','bsnes',{bsnes_entropy:'None'}],
 ['bsnes-accurate','bsnes',{bsnes_entropy:'None',bsnes_ppu_fast:'OFF',bsnes_dsp_fast:'OFF'}],
];
const rows=await Promise.all(variants.map(async([name,core,options])=>{
 const out=join(root,name),sram=join(repo,'.local/snes-test/emulators',name,'sram.bin');
 assert.ok(existsSync(sram),'run snes/test/emulators/run.mjs first');mkdirSync(out,{recursive:true});
 const h=await RetroHost.start({host,core:findCore(core),rom:romFile,out,options,sram,wramInit:'zero'});
 const songs=[];
 try{
  const loaded=await playBatteryLoad(h,{});
  assert.ok(loaded.checks.every(c=>c.pass),JSON.stringify(loaded.checks));
  await h.wait(40);
  const native=await h.r8(0x7E1E05);
  for(const id of [0x3B,0x3C,0x3D,0x3E,0x3F,native]){
   const frame=h.frame,service=await h.r16(0x7ED72C);
   await h.write('wram',0x7EDD16,[id===native?9:3,id]);
   assert.ok(await h.waitFor(async()=>await h.r8(0x7E1E05)===id,120),`song ${id} selected`);
   await h.wait(120);
   const stalled=h.frame-frame-((await h.r16(0x7ED72C)-service)&0xFFFF);
   assert.ok(stalled<90,`song ${id} CPU stalled for ${stalled} frames`);
   const tag=`song-${id.toString(16)}`;
   await h.step({op:'savestate',name:tag});
   const path=join(out,tag+'.state'),state=readFileSync(path);
   const at=state.indexOf(signature),base=at-0x400;
   assert.ok(base>=0&&base+0x10000<=state.length,'contiguous ARAM found');
   assert.equal(state.indexOf(signature,at+1),-1,'unique driver signature');
   assert.deepEqual(state.subarray(base+0x600,base+0x680),second,'second driver signature');
   const ram=state.subarray(base,base+0x10000),word=a=>ram.readUInt16LE(a);
   const song=romSong(rom,id);
   assert.deepEqual(ram.subarray(0x1A00,0x1A00+song.blob.length),Buffer.from(song.blob),'complete sequence');
   song.instruments.forEach((ins,k)=>{
    const sample=romInstrument(rom,ins),dst=word(0x1980+4*k);
    assert.deepEqual(ram.subarray(dst,dst+sample.brr.length),Buffer.from(sample.brr),`instrument ${ins}`);
    assert.equal(word(0x1982+4*k),dst+sample.loop);assert.equal(word(0x1840+2*k),sample.tune);assert.equal(word(0x18C0+2*k),sample.adsr);
   });
   assert.ok(ram[0xAD]!==0,'music tracks alive');
   assert.equal(word(0x1420),0x1263);assert.equal(word(0x1426),0x1270);
   songs.push({id,stallFrames:stalled,aramOffset:base,tracks:ram[0xAD]});
   rmSync(path);
  }
  console.log(`audio cores ${name}: pass (${songs.map(s=>s.stallFrames).join('/')} stall frames)`);
  return {name,pass:true,songs};
 }catch(e){console.log(`audio cores ${name}: FAIL ${e.message}`);return {name,pass:false,error:e.message,songs};}
 finally{await h.close();}
}));
writeFileSync(join(root,'summary.json'),JSON.stringify(rows,null,2));
process.exit(rows.every(r=>r.pass)?0:1);
