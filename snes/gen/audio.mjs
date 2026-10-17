// Audio module generator: SPC700 driver extension upload, DBZ effect /
// voice stream bank and cue tables. Output in dist/snes/gen/audio/.
// Cue gains, clips and rates come straight from the browser mod
// (engine/ki-sound.js, engine/kamehameha-voice.js) and its WAV assets.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assemble} from './audio-spc700.mjs';
import {readWav,resample} from './audio-brr.mjs';
import {buildStreamClip,CHUNK_BYTES,CHUNK_SAMPLES} from './audio-stream.mjs';

export const STREAM_RATE=12000;
export const STREAM_PITCH=Math.round(STREAM_RATE*4096/32000); // $0600
// Volume: a full-scale clip at VOL v peaks at ≈ v/162 of full scale (MVOL 127).
// Effects ran through the browser's .55 master, the Kamehameha voice did not.
const VOL_EFFECT=0.55*162*0.8,VOL_VOICE=162*0.8;
const ASSET_BANKS=[0xFC,0xFD,0xFE,0xFF];

// Stable API ids (docs/agents/snes-port/audio.md). One-shots 1..,
// loops are addressed 0..3 by audio_loop.
export const SHOTS=[
 'swing','kickSwing','hit','kick','blast','impact','distantImpact','beam','charged','transform',
 'revert','powerBurst','deflect','balloonPop','iceBreak','teleport','teleportIn','flight','landing',
 'friezaOrb','friezaDisc','friezaLaser','friezaBeam','friezaImpact','fortressBreak','friezaRush','vegetaBeam',
 'friezaLaugh','vegetaFinalFlash','vegetaKakarot','kameCharge','kameRelease',
];
export const LOOPS=['charge','aura','air','friezaCharge'];
// Higher wins a channel. Voices prefer channel 0, everything else channel 1.
const PRIORITY={transform:9,powerBurst:9,beam:8,vegetaBeam:8,friezaBeam:8,fortressBreak:8,friezaOrb:7,revert:7,
 teleport:6,teleportIn:6,kick:5,hit:5,impact:5,friezaImpact:5,blast:4,friezaLaser:4,friezaDisc:4,deflect:4,charged:4,
 balloonPop:4,iceBreak:4,flight:3,landing:3,friezaRush:3,kickSwing:2,swing:2,distantImpact:1,
 friezaLaugh:10,vegetaFinalFlash:10,vegetaKakarot:10,kameCharge:10,kameRelease:11};
const VOICE_CLASS=new Set(['friezaLaugh','vegetaFinalFlash','vegetaKakarot','kameCharge','kameRelease']);
const LOOP_PRIORITY={charge:4,aura:3,friezaCharge:2,air:1};

export async function loadCues(repo){
 const {cues}=await import(resolve(repo,'engine/ki-sound.js'));
 return {...cues,
  kameCharge:{clips:['@kamehameha-charge'],gain:.32,voice:true},
  kameRelease:{clips:['@kamehameha-release'],gain:.36,voice:true}};
}
const wavPath=(repo,clip)=>clip.startsWith('@')?resolve(repo,`assets/audio/${clip.slice(1)}.wav`):resolve(repo,`assets/audio/dbz/${clip}.wav`);

// Render one clip at the stream rate. rate > 1.1 is baked in (keeps chunk
// durations long enough for the SPC's chunk handler); smaller rates are
// played through the DSP pitch.
export function renderClip(repo,clip,{rate=1,loop=false}={}){
 const {rate:src,pcm}=readWav(readFileSync(wavPath(repo,clip)));
 if(loop){
  const length=Math.max(CHUNK_SAMPLES,Math.round(pcm.length*STREAM_RATE/src/CHUNK_SAMPLES)*CHUNK_SAMPLES);
  return resample(pcm,src,STREAM_RATE,{length,circular:true});
 }
 return resample(pcm,src*rate,STREAM_RATE);
}

export async function buildBank(repo){
 const cues=await loadCues(repo),clips=[],byKey=new Map();
 const clipFor=(name,{rate=1,loop=false})=>{
  const key=`${name}@${rate}${loop?'L':''}`;
  if(byKey.has(key))return byKey.get(key);
  const pcm=renderClip(repo,name,{rate,loop}),built=buildStreamClip(pcm,{loop});
  const id=clips.length;clips.push({key,name,rate,loop,...built,seconds:pcm.length/STREAM_RATE});byKey.set(key,id);return id;
 };
 const shots=SHOTS.map((name,i)=>{
  const c=cues[name];if(!c||c.loop)throw Error(`audio: no one-shot cue ${name}`);
  const bake=(c.rate??1)>1.1,pitchRate=bake?1:(c.rate??1);
  const ids=c.clips.map(clip=>clipFor(clip,{rate:bake?c.rate:1}));
  const variants=['hit','swing','blast'].includes(name);
  const vol=Math.min(127,Math.round(c.gain*(c.voice?VOL_VOICE:VOL_EFFECT)));
  return {id:i+1,name,clips:ids,vol,pitch:Math.round(STREAM_PITCH*pitchRate),variants,prio:PRIORITY[name]??3,voice:VOICE_CLASS.has(name)};
 });
 const loops=LOOPS.map((name,i)=>{
  const c=cues[name];if(!c?.loop)throw Error(`audio: no loop cue ${name}`);
  return {id:i,name,clip:clipFor(c.clips[0],{loop:true}),vol:Math.min(127,Math.round(c.gain*VOL_EFFECT)),prio:LOOP_PRIORITY[name]};
 });
 // Pack clips into the asset banks; a clip never crosses a bank.
 const banks=ASSET_BANKS.map(b=>({bank:b,data:[],used:0}));
 let bi=0;
 for(const c of clips){
  while(bi<banks.length&&banks[bi].used+c.bytes.length>0x10000)bi++;
  if(bi>=banks.length)throw Error(`audio: stream bank full at ${c.key}`);
  c.bank=banks[bi].bank;c.addr=banks[bi].used;banks[bi].data.push(c.bytes);banks[bi].used+=c.bytes.length;
 }
 return {cues,clips,shots,loops,banks};
}

// SPC700 extension: segments, with the original driver bytes at every patch
// site asserted against the cartridge's own driver image.
export const DRIVER_PATCHES=new Map([[0x020A,[0xF0]],[0x0279,[0x3F,0xAF,0x0C]],[0x0299,[0xDA,0xF6]],[0x02E1,[0xE4,0xAE,0xC4,0x02]],
 [0x02F4,[0x5F,0x79,0x02]],[0x0378,[0xE4,0xAE,0xC4,0x02]],[0x14C6,[0xDD,0x12]]]);
export function buildExtension(repo,rom){
 const src=readFileSync(resolve(repo,'snes/src/modules/audio/spc/stream.s'),'utf8');
 const {segments,symbols}=assemble(src,{name:'stream.s'});
 const u16=a=>rom[a]|rom[a+1]<<8,driver=new Uint8Array(0x10000);
 for(let i=0;i<6;i++){const s=0x30000+u16(0x30008+i*2),d=u16(0x30014+i*2),n=u16(s);driver.set(rom.subarray(s+2,s+2+n),d);}
 for(const s of segments){
  const want=DRIVER_PATCHES.get(s.addr);
  if(want){if(want.length!==s.bytes.length||want.some((v,i)=>driver[s.addr+i]!==v))throw Error(`audio: driver bytes at $${s.addr.toString(16)} differ`);continue;}
  for(let i=0;i<s.bytes.length;i++)if(driver[s.addr+i])throw Error(`audio: extension overlaps driver data at $${(s.addr+i).toString(16)}`);
 }
 // Upload blob: [u16 addr][u16 len][bytes]… [u16 0][u16 0]
 const out=[];
 for(const s of segments){out.push(s.addr&255,s.addr>>8,s.bytes.length&255,s.bytes.length>>8,...s.bytes);}
 out.push(0,0,0,0);
 return {segments,symbols,upload:Uint8Array.from(out)};
}

export async function generate({rom,repo,outDir}){
 const ext=buildExtension(repo,rom);
 writeFileSync(resolve(outDir,'upload.bin'),ext.upload);
 const bank=await buildBank(repo);
 const asm=[`; generated by snes/gen/audio.mjs — do not edit`];
 for(const b of bank.banks){
  const data=new Uint8Array(b.used);let o=0;for(const d of b.data){data.set(d,o);o+=d.length;}
  writeFileSync(resolve(outDir,`clips_${b.bank.toString(16)}.bin`),data);
  if(b.used)asm.push(`pushpc`,`org $${b.bank.toString(16).toUpperCase()}0000`,`incbin "audio/clips_${b.bank.toString(16)}.bin"`,`pullpc`);
 }
 const hex=(v,n=2)=>'$'+v.toString(16).toUpperCase().padStart(n,'0');
 asm.push(`!AUDIO_STREAM_PITCH = ${hex(STREAM_PITCH,4)}`,`!AUDIO_NCLIPS = ${bank.clips.length}`,`!AUDIO_NSHOTS = ${bank.shots.length}`,`!AUDIO_NLOOPS = ${bank.loops.length}`);
 // Clip table: 8 bytes each (addr.w, bank.b, flags.b(bit0 loop), chunks.w, pad.w)
 asm.push(`audio_clip_table:`);
 for(const c of bank.clips)asm.push(`\tdw ${hex(c.addr,4)} : db ${hex(c.bank)},${c.loop?1:0} : dw ${c.chunks},0 ; ${c.key} ${c.seconds.toFixed(2)}s snr ${c.snr.toFixed(1)}`);
 // Shot table: 8 bytes (clip0, clip1, clip2, nclips, vol, prio, flags(bit0 variants, bit1 voice), pad) + pitch table
 asm.push(`audio_shot_table:`,`\tdb 0,0,0,0,0,0,0,0 ; id 0: none`);
 for(const s of bank.shots){const c=[...s.clips,s.clips[0],s.clips[0]].slice(0,3);asm.push(`\tdb ${c.join(',')},${s.clips.length},${s.vol},${s.prio},${(s.variants?1:0)|(s.voice?2:0)},0 ; ${s.id} ${s.name}`);}
 asm.push(`audio_shot_pitch:`,`\tdw 0`);
 for(const s of bank.shots)asm.push(`\tdw ${hex(s.pitch,4)} ; ${s.name}`);
 asm.push(`audio_loop_table:`);
 for(const l of bank.loops)asm.push(`\tdb ${l.clip},${l.vol},${l.prio},0 ; loop ${l.id} ${l.name}`);
 writeFileSync(resolve(outDir,'tables.asm'),asm.join('\n')+'\n');
 const ids=[`; Audio cue ids for other modules: incsrc "audio/ids.asm"`,`if not(defined("AUDIO_IDS"))`,`!AUDIO_IDS = 1`];
 for(const s of bank.shots)ids.push(`!AUDIO_SFX_${s.name.replace(/[A-Z]/g,m=>'_'+m).toUpperCase()} = ${s.id}`);
 for(const l of bank.loops)ids.push(`!AUDIO_LOOP_${l.name.replace(/[A-Z]/g,m=>'_'+m).toUpperCase()} = ${l.id}`);
 ids.push('endif');
 writeFileSync(resolve(outDir,'ids.asm'),ids.join('\n')+'\n');
 const used=bank.banks.reduce((a,b)=>a+b.used,0);
 writeFileSync(resolve(outDir,'report.json'),JSON.stringify({extension:ext.segments.map(s=>({addr:s.addr,len:s.bytes.length})),streamBytes:used,
  banks:bank.banks.map(b=>({bank:b.bank,used:b.used})),clips:bank.clips.map(c=>({key:c.key,bank:c.bank,addr:c.addr,chunks:c.chunks,seconds:c.seconds,snr:c.snr}))},null,1));
}
