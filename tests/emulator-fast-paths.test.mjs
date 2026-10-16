import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {restore,hash} from '../engine/state.js';

// The SnesJs core has three bypasses for speed: batched idle master cycles,
// a scanline compositor, and gates that skip mod hook chains where no hook
// can act. Each must be indistinguishable from the original slow path.
const rom=new Uint8Array(readFileSync('rom/secret-of-mana-us.sfc'));
function core(){
 const context={console,Uint8Array,Uint16Array,Int8Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math,Map,clearArray:a=>a.fill(0),log:()=>{},getByteRep:x=>x.toString(16),getWordRep:x=>x.toString(16),getLongRep:x=>x.toString(16)};
 vm.createContext(context);
 for(const name of['cart','dsp','spc','apu','pipu','cpu','snes'])vm.runInContext(readFileSync(`vendor/snes/${name}.js`,'utf8'),context);
 const snes=new context.Snes();snes.loadRom(rom,true);snes.reset(true);return snes;
}
const digest=bytes=>{let h=2166136261;for(let i=0;i<bytes.length;i++)h=Math.imul(h^bytes[i],16777619);return h>>>0;};
const frameState=s=>[digest(s.ppu.pixelOutput),digest(s.ram),digest(s.apu.ram),digest(s.ppu.vram),s.cpu.br[4],s.xPos,s.yPos];
// Start reaches the title, the opening and naming; directions and buttons
// add menus and movement. Deterministic, identical for every core.
const input=i=>i%200<6?0x1000:i%40<18?((i*2654435761)>>>20)&0xff0:0;
function lockstep(a,b,frames,label,step=(s,i)=>{s.joypad1State=input(i);s.runFrame(false);}){
 for(let i=0;i<frames;i++){
  step(a,i);step(b,i);
  assert.deepEqual(frameState(b),frameState(a),`${label}: frame ${i}`);
 }
}
const fixtures=existsSync('.local/emulator-probe')?readdirSync('.local/emulator-probe').filter(f=>f.endsWith('.json')).map(f=>`.local/emulator-probe/${f}`)
 .filter(f=>{try{return JSON.parse(readFileSync(f,'utf8')).format==='SnesJs-probe-v1';}catch{return false;}}):[];

test('scanline compositor matches per-pixel rendering from power-on',()=>{
 const fast=core(),slow=core();slow.ppu.setLineComposer(false);
 const modes=new Set();
 lockstep(slow,fast,600,'power-on',(s,i)=>{s.joypad1State=input(i);s.runFrame(false);if(s===fast)modes.add(s.ppu.mode);});
 assert.ok(modes.has(1)&&modes.has(3),`covered modes ${[...modes]}`);
});
test('scanline compositor matches per-pixel rendering in saved menu, field and Mode 7 states',t=>{
 if(!fixtures.length){t.skip('Private emulator states not present');return;}
 for(const f of fixtures){
  const fast=core(),slow=core();slow.ppu.setLineComposer(false);
  const st=JSON.parse(readFileSync(f,'utf8'));for(const s of[fast,slow])restore(s,{...st,romHash:hash(s.cart.data)});
  lockstep(slow,fast,12,f);
 }
});
test('batched idle cycles match cycle-by-cycle stepping, including skipped pictures',()=>{
 const fast=core(),slow=core();
 // The original frame loop: one cycle() per master-cycle pair.
 slow.runFrame=function(noPpu){do{this.cycle(noPpu);}while(!(this.xPos===0&&this.yPos===0));};
 lockstep(slow,fast,300,'stepping',(s,i)=>{s.joypad1State=input(i);s.runFrame(i%3===1);});
 assert.equal(fast.apuCatchCycles,slow.apuCatchCycles,'APU catch-up stays bit-identical');
});
test('instruction hooks run at registered breakpoints, and unregistered hooks see every instruction',()=>{
 // Watch two instructions that the opening really executes, one rarely.
 const probe=core(),counts=new Map(),previousProbe=probe.cpu.cycle;
 probe.cpu.cycle=function(){const key=((this.r[1]&63)<<16)|this.br[4];counts.set(key,(counts.get(key)??0)+1);return previousProbe.call(this);};
 for(let i=0;i<120;i++){probe.joypad1State=input(i);probe.runFrame(false);}
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]),watched=[ranked[0][0],ranked.find(([,n])=>n<50)[0]];
 const gated=core(),plain=core();
 const install=(s,register)=>{
  const cpu=s.cpu,previous=cpu.cycle,hits=[];let total=0;
  cpu.cycle=function(){total++;const key=((this.r[1]&63)<<16)|this.br[4];if(watched.includes(key))hits.push(key);return previous.call(this);};
  if(register)cpu.registerBreakpoints(cpu.cycle,previous,watched.map(key=>[key>>16,key&0xffff]));
  return{hits,get total(){return total;}};
 };
 const a=install(gated,true),b=install(plain,false);
 lockstep(plain,gated,120,'breakpoints');
 assert.deepEqual(a.hits,b.hits);assert.ok(a.hits.length>0);
 assert.ok(a.total<b.total/2,`gated hook ran ${a.total} of ${b.total} instructions`);
 // always() keeps a hook on every instruction while it reports true.
 const cpu=gated.cpu,previous=cpu.cycle;let calls=0,armed=true;
 cpu.cycle=function(){calls++;return previous.call(this);};cpu.registerBreakpoints(cpu.cycle,previous,[],()=>armed);
 gated.runFrame(false);const armedCalls=calls;armed=false;calls=0;gated.runFrame(false);
 assert.ok(armedCalls>1000&&calls<armedCalls/50,`${armedCalls} armed, ${calls} idle`);
 // An unregistered wrapper on top disables the gate for the whole chain.
 const head=cpu.cycle;let outer=0;cpu.cycle=function(){outer++;return head.call(this);};calls=0;gated.runFrame(false);
 assert.equal(calls,outer);
});
test('cartridge read hooks run for every watched address and never elsewhere',()=>{
 const gated=core(),plain=core();
 const install=(s,register)=>{
  const cart=s.cart,previous=cart.read,log=[];
  cart.read=function(bank,adr){const off=((bank&63)<<16)|adr;if((bank&0xc0)===0xc0&&off>=0x8000&&off<0x8100){log.push(off);return previous.call(this,bank,adr)^1;}return previous.call(this,bank,adr);};
  if(register)cart.registerReadHook(cart.read,previous,m=>m.hirom(0x8000,0x8100));
  return log;
 };
 const a=install(gated,true),b=install(plain,false);
 lockstep(plain,gated,240,'reads');
 assert.deepEqual(a,b);
});
