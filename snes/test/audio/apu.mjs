// Node APU harness: the cartridge's own SPC700 driver (uploaded from the ROM
// exactly as C3:002C does at boot) plus the audio module's extension, run on
// the vendored SPC700 core with the sample-accurate S-DSP model (sdsp.mjs).
// The test drives the CPU side of the port protocols directly.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SDsp} from './sdsp.mjs';
import {assemble} from '../../gen/audio-spc700.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

export function loadRom(){return new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));}
// The six boot chunks (C3:0008 sources, C3:0014 destinations).
export function driverChunks(rom){
 const u16=a=>rom[a]|rom[a+1]<<8,out=[];
 for(let i=0;i<6;i++){const src=0x30000+u16(0x30008+i*2),dst=u16(0x30014+i*2),len=u16(src);out.push({addr:dst,bytes:rom.subarray(src+2,src+2+len)});}
 return out;
}
export function extensionSegments(){
 return assemble(readFileSync(resolve(repo,'snes/src/modules/audio/spc/stream.s'),'utf8'),{name:'stream.s'});
}

export function createApu({rom=loadRom(),extension=true}={}){
 const ctx={console,Uint8Array,Uint16Array,Int8Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math,clearArray:a=>a.fill(0)};
 vm.createContext(ctx);
 ctx.Dsp=function(apu){const d=new SDsp(null);Object.defineProperty(d,'aram',{get:()=>apu.ram});return d;};
 vm.runInContext(readFileSync(resolve(repo,'vendor/snes/spc.js'),'utf8'),ctx);
 vm.runInContext(readFileSync(resolve(repo,'vendor/snes/apu.js'),'utf8'),ctx);
 const apu=new ctx.Apu(null);
 for(const c of driverChunks(rom))apu.ram.set(c.bytes,c.addr);
 let ext=null;
 if(extension){ext=extensionSegments();for(const s of ext.segments)apu.ram.set(s.bytes,s.addr);}
 apu.dspRomReadable=false;apu.spc.br[0]=0x0200;apu.spc.cyclesLeft=0;
 const h={apu,dsp:apu.dsp,ram:apu.ram,ext,cycles:0,
  cpuWrite(p,v){apu.spcReadPorts[p]=v&0xff;},
  cpuRead(p){return apu.spcWritePorts[p];},
  step(n){for(let i=0;i<n;i++)apu.cycle();h.cycles+=n;},
  ms(t){h.step(Math.round(t*1024));},
  waitFor(cond,limit=2e6){let n=0;while(!cond()){apu.cycle();h.cycles++;if(++n>limit)throw Error('APU timeout');}return n;},
  // Native command (C3:059F): ports 1-3 then command, echo, release.
  nativeCmd(cmd,p1=0,p2=0,p3=0){
   h.waitFor(()=>h.cpuRead(0)!==cmd);
   h.cpuWrite(3,p3);h.cpuWrite(2,p2);h.cpuWrite(1,p1);h.cpuWrite(0,cmd);
   h.waitFor(()=>h.cpuRead(0)===cmd);h.cpuWrite(0,0);
  },
  // Extension command $8A: records as 3-byte groups, then the end group.
  streamCmd(groups){
   h.cpuWrite(1,groups.length);h.cpuWrite(0,0x8A);
   h.waitFor(()=>h.cpuRead(0)===0x8A);
   let c=0x20;
   for(const g of [...groups,[0,0,0]]){h.cpuWrite(1,g[0]);h.cpuWrite(2,g[1]);h.cpuWrite(3,g[2]);h.cpuWrite(0,c);h.waitFor(()=>h.cpuRead(0)===c);c=c===0x7F?0x20:c+1;}
   h.cpuWrite(0,0);h.waitFor(()=>h.cpuRead(0)===0);
  },
  status(){const s=h.cpuRead(3);return {cons:[s&7,(s>>4)&7],active:[!!(s&8),!!(s&0x80)]};},
  dspReg(r){return apu.dsp.ram[r];},
  take(){return apu.dsp.take();},
 };
 return h;
}

// CPU-side stream player mirroring the 65816 module: per channel a ring of 7
// slots (channel c owns slots 7c..7c+6), at most 7 chunks in flight.
export class StreamPlayer{
 constructor(h){this.h=h;this.ch=[0,1].map(c=>({c,clip:null,next:0,wr:7*c,sent:0,inflight:0,active:false}));}
 start(c,clip,{pitch=0x0600,vol=[96,96]}={}){
  const s=this.ch[c],st=this.h.status();
  const busy=s.inflight?((s.wr-7*c-s.inflight+7)%7)+7*c:-1;
  if(busy>=0)s.wr=7*c+(busy-7*c+1)%7;
  s.clip=clip;s.next=0;s.sent=0;s.inflight=0;s.active=true;s.startedAt=this.h.cycles;
  this.pending=(this.pending??[]);
  this.pending.push([0x20|c,s.wr,0],[0x30|c,vol[0],vol[1]],[0x40|c,pitch&0xff,pitch>>8]);
  s.firstLimit=busy>=0?6:7;
 }
 stop(c){const s=this.ch[c];s.clip=null;s.active=false;this.pending=(this.pending??[]);this.pending.push([0x50|c,0,0]);}
 // One frame of service: read status, top up rings, send one command.
 frame(budget=5,startBudget=6){
  const st=this.h.status(),groups=[...(this.pending??[])];this.pending=[];
  for(const s of this.ch){
   if(!s.clip)continue;
   const cons=st.cons[s.c];s.inflight=(s.sent-cons)&7;
   if(!st.active[s.c]&&s.next>0&&!groups.length){s.clip=null;s.active=false;continue;}
   const first=s.firstLimit!==7,limit=Math.min(s.firstLimit??7,7);s.firstLimit=7;
   let room=limit-s.inflight,k=0;
   while(room>0&&k<(first?startBudget:budget)&&s.next<s.clip.chunks){
    const final=s.next===s.clip.chunks-1&&s.clip.loopChunk<0;
    groups.push([0x10|s.c,s.wr,final?1:0]);
    const base=s.next*36;for(let i=0;i<36;i+=3)groups.push([s.clip.bytes[base+i],s.clip.bytes[base+i+1],s.clip.bytes[base+i+2]]);
    s.next++;s.sent=(s.sent+1)&7;s.inflight++;room--;k++;
    s.wr=7*s.c+((s.wr-7*s.c+1)%7);
    if(s.next>=s.clip.chunks&&s.clip.loopChunk>=0)s.next=s.clip.loopChunk;
   }
  }
  this.h.streamCmd(groups);
  return groups.length;
 }
}
