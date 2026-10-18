// Scene-select presets (snes/src/modules/debug) on the libretro cores next to
// Mesen, for `run.mjs --presets[=late,flight,...]`: the same title code,
// cursor and B as snes/test/debug/preset.lua (which Mesen runs unchanged as
// the reference), the end state at the recipe's capture point, and pictures
// at +0, +60 and +240 frames (each a 5-frame window on the cores).
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
export const PRESET_SHOTS=[0,60,240];
const hex=(v,n=2)=>v.toString(16).toUpperCase().padStart(n,'0');
// HiROM save RAM: CPU $20-$3F:6000-7FFF -> battery offset.
const sramOff=a=>(((a>>>16)&0x1F)*0x2000+(a&0xFFFF)-0x6000)&0x7FFF;

export function presetSetup(romFile){
  const catalog=JSON.parse(readFileSync(join(repo,'dist/snes/gen/debug/catalog.json'),'utf8'));
  const symFile=romFile.replace(/\.sfc$/,'.sym');
  const m=existsSync(symFile)?readFileSync(symFile,'utf8').match(/^([0-9A-F]{2}):([0-9A-F]{4}) debug_addresses$/m):null;
  return {kinds:catalog.presets.map(p=>p.kind),work:m?parseInt(m[1]+m[2],16):0x317600};
}
export const maxFramesOf=kind=>kind==='sword'?26000:16000;

// The state preset.lua records at the capture point.
async function presetState(h){
  const r8=a=>h.r8(a),r16=a=>h.r16(a);
  const dump=async(mem,a,n)=>(await h.bytes(mem,a,n)).map(v=>hex(v)).join('');
  const s={};
  s.map=await r16(0x7E00DC);
  s.d0=await r8(0x7E00D0);
  s.ptr=`${hex(await r8(0x7E00D3))}:${hex(await r16(0x7E00D1),4)}`;
  s.mode=await r16(0x7ED720);
  s.nmi=hex(await r8(0x7E0103))+hex(await r8(0x7E0102))+hex(await r8(0x7E0101));
  s.flags=await dump('wram',0x7ECF00,256);
  s.names=await dump('wram',0x7ECC00,48);
  s.items=await dump('wram',0x7ECC48,24);
  s.persist=await dump('sram',sramOff(0x316000),0x60);
  s.title_arrival=await h.sram(sramOff(0x316300));
  s.goku_form=await r8(0x7ED740);
  s.party=[];
  for(let i=0;i<3;i++){
    const b=0x7EE000+i*0x200;
    s.party.push({active:(await r8(b))&1,x:await r16(b+2),y:await r16(b+4),species:await r8(b+0x180),
      level:await r8(b+0x181),hp:await r16(b+0x182),maxhp:await r16(b+0x184),status:await r16(b+0x190)});
  }
  s.world={fa:await r16(0x7E00FA),fc:await r16(0x7E00FC),f6:await r16(0x7E00F6),f8:await r8(0x7E00F8)};
  return s;
}

// preset.lua's steps on a RetroHost. Frame numbers match the Lua harness
// (its first resume is frame 1, so H.wait(200) ends on frame 201).
export async function playPreset(h,{index,work,maxFrames}){
  const s8=a=>h.sram(sramOff(a)),s16=a=>h.sram(sramOff(a),2);
  const res={};
  await h.wait(201);
  for(const b of ['up','up','down','down','left','right','left','right'])await h.tap(b,4,8);
  if(!await h.waitFor(async()=>(await s8(work+0x1D))===1,60))return {error:'scene select did not open'};
  await h.wait(10);
  if(index>=11)await h.tap('right',4,8);
  for(let i=0;i<index%11;i++)await h.tap('down',4,8);
  res.cursor=await s8(work+0x18);
  await h.tap('b',4,4);
  if(!await h.waitFor(async()=>(await s16(work))===0x4244,120))return {...res,error:'preset not armed'};
  const started=h.frame;
  let status=1,last='';
  res.trace=[];
  for(let i=0;i<maxFrames&&status===1;i++){
    await h.wait(1);
    const w=await h.bytes('sram',sramOff(work),0x10);
    status=w[0x0C];
    const ph=w[3],pc=w[4]|w[5]<<8;
    if(`${ph}:${pc}`!==last&&res.trace.length<400){
      last=`${ph}:${pc}`;
      res.trace.push(`f${h.frame-started} ph${ph} pc${hex(pc,4)} map${await h.r16(0x7E00DC)} d0${hex(await h.r8(0x7E00D0))}`);
    }
  }
  res.status=status;
  res.err=await s8(work+0x0D);
  res.err_pc=await s16(work+0x0E);
  res.frames=await s16(work+0x0A);
  res.boot_frame=await s16(work+0x36);
  res.soft=await s16(work+0x3A);
  res.wall_frames=h.frame-started;
  res.end=h.frame;
  res.state=await presetState(h);
  // +0: two frames back from the ring, this frame, two more; +60, +240.
  for(const k of [-2,-1,0]){await h.step({op:'shot',name:`frame-00000${k<0?'':'+'}${k}`,back:-k});}
  for(const k of [1,2]){await h.wait(1);await h.shot(`frame-00000+${k}`);}
  for(const at of PRESET_SHOTS.slice(1)){
    await h.wait(res.end+at-2-h.frame);
    for(let k=-2;k<=2;k++){
      if(k>-2)await h.wait(1);
      await h.shot(`frame-${String(at).padStart(5,'0')}${k<0?'':'+'}${k}`);
    }
  }
  return res;
}

// Power-on RAM for preset comparisons: zeros everywhere, in the cores (host
// fills) and in Mesen (its RamPowerOnState), so a difference is the
// emulators', not power-on noise. Native code reads some RAM it never
// initialises (e.g. C2:B0D9 seeds the moving Fortress from 7E:0126, which
// the flight preset's WORLDAIM follows); --power-on measures that apart.
export const PRESET_POWER_ON={sram:'zero',wramInit:'zero'};
export const MESEN_POWER_ON=['--snes.ramPowerOnState=AllZeros'];

// Mesen reference: snes/test/debug/preset.lua unchanged, every frame
// rendered, zeroed power-on RAM, cached per ROM and preset.
export async function mesenPreset({kind,index,work,romFile,romSha,outRoot}){
  const lua=readFileSync(join(repo,'snes/test/debug/preset.lua'),'utf8');
  const prelude=`DBG_WORK=${work}\nPRESET=${index}\nMAXF=${maxFramesOf(kind)}\nSHOTS={60,240}\n`;
  const m=await import('../mesen.mjs');
  const dir=join(outRoot,'mesen-presets',kind);
  const switches=[...m.EXACT_FRAMES,...MESEN_POWER_ON];
  const key=romSha+':'+createHash('sha256').update(prelude+lua+switches.join(' ')).digest('hex');
  const keyFile=join(dir,'key.txt');
  if(existsSync(keyFile)&&readFileSync(keyFile,'utf8')===key&&existsSync(join(dir,'results.json')))
    return {dir,results:JSON.parse(readFileSync(join(dir,'results.json'),'utf8')),cached:true};
  const {privateRom,cleanupRom}=await import('../checkpoints.mjs');
  const copy=privateRom(romFile,`emu-${kind}`);
  const r=await m.runMesen({rom:copy,test:prelude+lua,outDir:dir,timeoutMs:900000,args:switches});
  cleanupRom(copy);
  if(r.code!==0||!r.results||r.results.error)return {dir,error:r.results?.error??r.output.slice(-1500)};
  mkdirSync(dir,{recursive:true});
  writeFileSync(keyFile,key);
  return {dir,results:r.results,cached:false};
}

// Field-by-field differences between two preset states.
export function stateDiffs(a,b){
  const out=[];
  const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?flat(v,`${p}${k}.`):[[`${p}${k}`,v]]);
  const fa=new Map(flat(a)),fb=new Map(flat(b));
  for(const [k,v] of fa){
    const w=fb.get(k);
    if(v===w)continue;
    if(typeof v==='string'&&typeof w==='string'&&v.length===w.length&&/^[0-9A-F]+$/.test(v)&&v.length>8){
      const bytes=[];
      for(let i=0;i<v.length;i+=2)if(v.slice(i,i+2)!==w.slice(i,i+2))bytes.push(`+${hex(i/2)} ${v.slice(i,i+2)}/${w.slice(i,i+2)}`);
      out.push({k,detail:bytes.slice(0,12).join(' ')+(bytes.length>12?` (+${bytes.length-12})`:'')});
    }else out.push({k,detail:`${v} / ${w}`});
  }
  return out;
}
