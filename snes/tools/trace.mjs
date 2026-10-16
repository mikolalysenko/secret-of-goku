// Code coverage tracer for the original cartridge. Replays private SnesJs probe
// states (.local/**.json) with light input and records every executed
// instruction's ROM offset together with the M/X/E flags it ran under, plus
// JSR/JSL call edges. Output (never committed):
//   dist/snes/analysis/coverage.bin   one flag byte per ROM offset (4 MiB)
//   dist/snes/analysis/calls.json     callee -> {count, callers}
//   dist/snes/analysis/ramcode.json   executed WRAM/IO-bank addresses
// Flag bits: 1 executed, 2 m8, 4 m16, 8 x8, 16 x16, 32 emulation, 64 mirror-bank (00-3F/80-BF) seen.
import {readFileSync,readdirSync,statSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from './w65816.mjs';
const args=process.argv.slice(2);
const frames=Number(args.find(a=>a.startsWith('--frames='))?.slice(9)??240);
const limit=Number(args.find(a=>a.startsWith('--limit='))?.slice(8)??1e9);
const romPath=args.find(a=>a.startsWith('--rom='))?.slice(6)??'rom/secret-of-mana-us.sfc';
const out=process.env.SNES_ANALYSIS??'dist/snes/analysis';mkdirSync(out,{recursive:true});
const files=[];
(function walk(d){for(const f of readdirSync(d)){const p=join(d,f);let s;try{s=statSync(p);}catch{continue;}
 if(s.isDirectory()){if(!/node_modules|^tools$/.test(f))walk(p);}else if(f.endsWith('.json')&&s.size>1e6)files.push(p);}})('.local');
const rom=new Uint8Array(readFileSync(romPath));
function core(){
 const context={console,Uint8Array,Uint16Array,Int8Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math,Map,clearArray:a=>a.fill(0),log:()=>{},getByteRep:x=>x.toString(16),getWordRep:x=>x.toString(16),getLongRep:x=>x.toString(16)};
 vm.createContext(context);
 for(const name of['cart','dsp','spc','apu','pipu','cpu','snes'])vm.runInContext(readFileSync(`vendor/snes/${name}.js`,'utf8'),context);
 const snes=new context.Snes();snes.loadRom(rom,true);snes.reset(true);return snes;
}
const {restore,hash}=await import('../../engine/state.js');
const cov=existsSync(`${out}/coverage.bin`)&&args.includes('--merge')?new Uint8Array(readFileSync(`${out}/coverage.bin`)):new Uint8Array(0x400000);
const calls=new Map(),ramcode=new Map();
function install(s){
 const cpu=s.cpu,base=cpu.cycle;
 cpu.cycle=function(){
  if(this.cyclesLeft===0&&!this.stopped&&!this.waiting){
   const k=this.r[1],pc=this.br[4],adr=(k<<16)|pc,off=hiromToPc(adr);
   const f=1|(this.m?2:4)|(this.x?8:16)|(this.e?32:0)|((k<0x40||(k>=0x80&&k<0xc0))?64:0);
   if(off>=0){cov[off]|=f;
    const op=s.cart.data[off];
    if(op===0x20||op===0x22||op===0xFC){
     let t=-1;
     if(op===0x22)t=s.cart.data[off+1]|(s.cart.data[off+2]<<8)|(s.cart.data[off+3]<<16);
     else if(op===0x20)t=(k<<16)|s.cart.data[off+1]|(s.cart.data[off+2]<<8);
     if(t>=0){let e=calls.get(t);if(!e){e={count:0,callers:new Set()};calls.set(t,e);}e.count++;if(e.callers.size<64)e.callers.add(adr);}
    }
   }else{ramcode.set(adr,(ramcode.get(adr)??0)+1);}
  }
  return base.call(this);
 };
 cpu.setBreakpointGate?.(false);
}
let used=0;
for(const f of files){
 if(used>=limit)break;
 let st;try{st=JSON.parse(readFileSync(f,'utf8'));}catch{continue;}
 if(st?.format!=='SnesJs-probe-v1')continue;
 const s=core();
 try{restore(s,{...st,romHash:hash(s.cart.data)});}catch{continue;}
 install(s);used++;
 // Light deterministic input: walk, confirm, menus.
 for(let i=0;i<frames;i++){const p=i%96;s.joypad1State=p<20?0x0100:p<24?0x8000:p<44?0x0200:p<48?0x0080:p<70?0x0400:p<90?0x0800:0;s.runFrame(true);}
 if(used%20===0)console.error('states',used);
}
writeFileSync(`${out}/coverage.bin`,cov);
writeFileSync(`${out}/calls.json`,JSON.stringify(Object.fromEntries([...calls].sort((a,b)=>a[0]-b[0]).map(([t,e])=>[t.toString(16).toUpperCase().padStart(6,'0'),{count:e.count,callers:[...e.callers].map(c=>c.toString(16).toUpperCase().padStart(6,'0'))}])),null,0));
writeFileSync(`${out}/ramcode.json`,JSON.stringify(Object.fromEntries([...ramcode].sort((a,b)=>a[0]-b[0]).map(([a,n])=>[a.toString(16).toUpperCase().padStart(6,'0'),n]))));
let n=0;for(const b of cov)if(b)n++;
console.log('states',used,'instructions covered',n,'callees',calls.size);
