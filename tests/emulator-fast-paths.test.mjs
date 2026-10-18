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
 const context={console,Uint8Array,Uint8ClampedArray,Uint16Array,Int8Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math,Map,clearArray:a=>a.fill(0),log:()=>{},getByteRep:x=>x.toString(16),getWordRep:x=>x.toString(16),getLongRep:x=>x.toString(16)};
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
test('scanline compositor matches per-pixel rendering under random PPU settings',()=>{
 // Color math, clipping, windows, mosaic, hires, brightness and scroll the
 // game may never combine, over noise VRAM, palettes and sprites so that
 // every layer is busy and overlaps the others.
 const s=core(),p=s.ppu;
 let seed=0x2545f491;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;},ri=n=>Math.floor(rnd()*n),rb=(q=.5)=>rnd()<q;
 const render=on=>{p.setLineComposer(on);p.renderLine(0);for(let l=1;l<225;l++)p.renderLine(l);return digest(p.pixelOutput);};
 for(let t=0;t<120;t++){
  if(t%20===0){
   // Mostly transparent tile rows, so that lower layers show through.
   for(let i=0;i<p.vram.length;i++)p.vram[i]=rb(.4)?ri(65536):0;
   for(let i=0;i<256;i++)p.cgram[i]=ri(32768);
   for(let i=0;i<256;i++)p.oam[i]=ri(65536);for(let i=0;i<16;i++)p.highOam[i]=ri(65536);
   p.invalidateLineCaches();
  }
  p.mode=[0,1,1,1,3,5,7,1][ri(8)];
  for(let l=0;l<5;l++)p.mainScreenEnabled[l]=rb(.7),p.subScreenEnabled[l]=rb(),p.mainScreenWindow[l]=rb(.3),p.subScreenWindow[l]=rb(.3),p.mosaicEnabled[l]=rb(.15);
  for(let l=0;l<6;l++)p.mathEnabled[l]=rb(),p.window1Enabled[l]=rb(.3),p.window2Enabled[l]=rb(.3),p.window1Inversed[l]=rb(),p.window2Inversed[l]=rb(),p.windowMaskLogic[l]=ri(4);
  for(let l=0;l<4;l++)p.bgHoff[l]=ri(1024),p.bgVoff[l]=ri(1024);
  Object.assign(p,{mosaicSize:1+ri(16),window1Left:ri(256),window1Right:ri(256),window2Left:ri(256),window2Right:ri(256),addSub:rb(),halfColors:rb(),subtractColors:rb(.3),
   fixedColorR:ri(32),fixedColorG:ri(32),fixedColorB:ri(32),colorClip:rb()?0:ri(4),preventMath:rb()?0:ri(4),pseudoHires:rb(.15),directColor:rb(.15),layer3Prio:rb(.3),brightness:1+ri(15),forcedBlank:false,
   objSize:ri(8),sprAdr1:ri(4)<<13,sprAdr2:ri(4)<<12});
  for(let l=0;l<4;l++)p.tilemapAdr[l]=ri(64)<<10,p.tileAdr[l]=ri(16)<<12,p.bigTiles[l]=rb(.2),p.tilemapWider[l]=rb(),p.tilemapHigher[l]=rb();
  for(const k of['mode7A','mode7B','mode7C','mode7D','mode7X','mode7Y','mode7Hoff','mode7Voff'])p[k]=ri(8192)-4096;
  Object.assign(p,{mode7LargeField:rb(),mode7Char0fill:rb(),mode7FlipX:rb(),mode7FlipY:rb(),mode7ExBg:rb(.2)});
  p.invalidateLineCaches();
  assert.equal(render(true),render(false),`trial ${t}`);
 }
 p.setLineComposer(true);
});
test('paint and channel line ops match the per-pixel wrappers they describe',()=>{
 const install=s=>{
  const p=s.ppu,inner=p.getColor,colors=new Uint16Array(256),tint=new Int32Array(32);
  for(let x=0;x<256;x++)colors[x]=x%5?((x*97)&0x7fff)+1:0;for(let c=0;c<32;c++)tint[c]=31-c;
  // Inner: repaint main BG1/OBJ pixels as BG3 pixel 7; outer: invert every non-backdrop pixel.
  p.getColor=function(sub,x,y){const r=inner.call(this,sub,x,y);if(!sub&&(r[1]===0||r[1]===4)&&colors[x]){r[0]=colors[x]-1;r[1]=2;r[2]=7;}return r;};
  p.registerLineHook('getColor',p.getColor,inner,()=>false,{plan:(ppu,line,plan)=>{plan.extra.push({type:'paint',layers:0x11,colors,skipZero:true,layer:2,pixel:7,mainOnly:true});plan.skipPost=true;return true;}});
  const mid=p.getColor;
  p.getColor=function(sub,x,y){const r=mid.call(this,sub,x,y);if(r[1]!==5){const c=r[0];r[0]=tint[c&31]|(tint[c>>5&31]<<5)|(tint[c>>10&31]<<10);}return r;};
  p.registerLineHook('getColor',p.getColor,mid,()=>false,{plan:(ppu,line,plan)=>{plan.extra.push({type:'channels',layers:0x1f,r:tint,g:tint,b:tint,layer:-1,pixel:0,mainOnly:false});plan.skipPost=true;return true;}});
 };
 const pair=()=>{const fast=core(),slow=core();install(fast);install(slow);slow.ppu.setLineComposer(false);return[slow,fast];};
 const [slow,fast]=pair();
 let composed=0;const can=fast.ppu.canComposeLine;fast.ppu.canComposeLine=function(line){const ok=can.call(this,line);if(ok)composed++;return ok;};
 lockstep(slow,fast,400,'line ops');
 assert.ok(composed>40000,`${composed} composed lines`);
 // The opening shows no sprites; saved field states (when present) do.
 for(const f of fixtures){
  const [a,b]=pair(),st=JSON.parse(readFileSync(f,'utf8'));for(const s of[a,b])restore(s,{...st,romHash:hash(s.cart.data)});
  lockstep(a,b,8,`line ops ${f}`);
 }
});
test('the compositor sees a temporary unregistered getColor wrapper and its removal',()=>{
 // A registered (idle) hook, then an unregistered wrapper on top for frames
 // 40-79 that changes colours: those lines must render per pixel, exactly.
 const setup=s=>{const p=s.ppu,inner=p.getColor;p.getColor=function(sub,x,y){return inner.call(this,sub,x,y);};p.registerLineHook('getColor',p.getColor,inner,()=>true);};
 const fast=core(),slow=core();setup(fast);setup(slow);slow.ppu.setLineComposer(false);
 lockstep(slow,fast,120,'temporary wrapper',(s,i)=>{
  if(i===40){const p=s.ppu,head=p.getColor;s.__head=head;p.getColor=function(sub,x,y){const r=head.call(this,sub,x,y);r[0]^=0x7fff;return r;};}
  if(i===80)s.ppu.getColor=s.__head;
  s.joypad1State=input(i);s.runFrame(false);
 });
});
test('setPixels writes ImageData words with the same bytes as its byte loop',()=>{
 const ppu=core().ppu,p=ppu.pixelOutput;
 for(let trial=0;trial<16;trial++){
  // Out-of-range channels must clamp as Uint8ClampedArray stores do.
  for(let i=0;i<p.length;i++)p[i]=(Math.imul(i+1,2654435761+trial)>>>23)%(trial%4===3?300:256);
  Object.assign(ppu,{frameOverscan:!!(trial&1),frameInterlace:!!(trial&2),evenFrame:!!(trial&4)});
  const before=Uint8ClampedArray.from({length:512*480*4},(_,i)=>(i*31+trial)&255),words=new Uint8ClampedArray(before),bytes=Array.from(before);
  ppu.setPixels(words);ppu.setPixels(bytes);
  const at=bytes.findIndex((v,i)=>Math.min(255,v)!==words[i]);
  assert.equal(at,-1,`trial ${trial}: byte ${at}`);
 }
});
test('batched idle cycles match cycle-by-cycle stepping, including skipped pictures',()=>{
 const fast=core(),slow=core();
 // The original frame loop: one cycle() per master-cycle pair.
 slow.runFrame=function(noPpu){do{this.cycle(noPpu);}while(!(this.xPos===0&&this.yPos===0));};
 lockstep(slow,fast,300,'stepping',(s,i)=>{s.joypad1State=input(i);s.runFrame(i%3===1);});
 assert.equal(fast.apuCatchCycles,slow.apuCatchCycles,'APU catch-up stays bit-identical');
});
// Wait loops in work RAM ($7E:2000, 8-bit registers, no interrupts) that
// meet each edge a batch must not cross blindly. Counters at $10-$12 record
// when every loop exits.
const waitPrograms={
 // HVBJOY polls: vblank end, then a count to vblank start; the auto-joypad
 // read, then a count to hblank; hblank end, then a count to hblank.
 polls:[0xaf,0x12,0x42,0x00,0x29,0x80,0xd0,0xf8, 0xe8,0xaf,0x12,0x42,0x00,0x29,0x80,0xf0,0xf7, 0x8e,0x10,0x00,
  0xaf,0x12,0x42,0x00,0x29,0x01,0xd0,0xf8, 0xc8,0xaf,0x12,0x42,0x00,0x29,0x40,0xf0,0xf7, 0x8c,0x11,0x00,
  0xaf,0x12,0x42,0x00,0x29,0x40,0xd0,0xf8, 0xe8,0xaf,0x12,0x42,0x00,0x29,0x40,0xf0,0xf7, 0x8e,0x12,0x00, 0x80,0xc2],
 // BIT $EC / BNE on a flag that HDMA channel 0 clears through WMDATA at
 // line 0's hblank (table at $7E:2100), then a count to vblank start, and
 // the flag and WMADD re-armed.
 hdmaFlag:[0xa9,0x00,0x8d,0x00,0x43, 0xa9,0x80,0x8d,0x01,0x43, 0xa9,0x00,0x8d,0x02,0x43, 0xa9,0x21,0x8d,0x03,0x43,
  0xa9,0x7e,0x8d,0x04,0x43, 0xa9,0x01,0x8d,0x0c,0x42,
  0xa9,0xec,0x8d,0x81,0x21, 0x9c,0x82,0x21, 0x9c,0x83,0x21, 0xa9,0xff,0x85,0xec,
  0x24,0xec,0xd0,0xfc, 0xe8,0xaf,0x12,0x42,0x00,0x29,0x80,0xf0,0xf7, 0x8e,0x10,0x00, 0x80,0xdf],
};
function runProgram(s,bytes){
 s.ram.set(bytes,0x2000);s.ram.set([0x01,0x00,0x00],0x2100);
 const c=s.cpu;Object.assign(c,{m:true,x:true,e:false,i:true,d:false,waiting:false,stopped:false,irqWanted:false,nmiWanted:false});
 c.r[0]=0;c.r[1]=0x7e;c.br[1]=c.br[2]=0;c.br[3]=0x1ff;c.br[4]=0x2000;c.br[5]=0;
 Object.assign(s,{nmiEnabled:false,hIrqEnabled:false,vIrqEnabled:false,autoJoyRead:true});
}
test('wait loops are skipped exactly, and not under an instruction hook that sees them',t=>{
 const state=s=>[...frameState(s),s.apuCatchCycles,s.readSerial(),s.openBus,s.cpu.cyclesLeft,s.autoJoyTimer];
 // Pairs skipped per loop opcode: 0x24 (BIT dp / BNE) or 0xaf (an HVBJOY poll).
 const counted=s=>{const by=new Map(),spin=s.spinWait;
  s.spinWait=function(x,pc,...a){const p=spin.call(this,x,pc,...a);if(p>0){const bank=pc>>16,op=bank===0x7e?this.ram[pc&0xffff]:this.cart.peek(bank,pc&0xffff);by.set(op,(by.get(op)??0)+p);}return p;};
  return op=>by.get(op)??0;};
 const compare=(fast,slow,frames,label,step=(s,i)=>{s.joypad1State=input(i);s.runFrame(i%3===1);})=>{
  for(let i=0;i<frames;i++){step(slow,i);step(fast,i);assert.deepEqual(state(fast),state(slow),`${label}: frame ${i}`);}
 };
 // From power-on: the title and the opening poll HVBJOY.
 {const fast=core(),slow=core();slow.setSpinWait(false);const batched=counted(fast);compare(fast,slow,300,'power-on');
  assert.ok(batched(0xaf)>100000,`${batched(0xaf)} poll pairs skipped`);}
 for(const [name,op] of [['polls',0xaf],['hdmaFlag',0x24]]){
  const fast=core(),slow=core();slow.setSpinWait(false);
  for(const s of[fast,slow]){for(let i=0;i<4;i++)s.runFrame(false);runProgram(s,waitPrograms[name]);}
  const batched=counted(fast);compare(fast,slow,30,name);
  assert.ok(batched(op)>100000,`${name}: ${batched(op)} pairs skipped`);
 }
 // The game's main loop waits in BIT $EC / BNE in field and story scenes.
 if(!fixtures.length){t.skip('Private emulator states not present');return;}
 let total=0,loop=-1,loopState=null;
 for(const f of fixtures){
  const fast=core(),slow=core();slow.setSpinWait(false);const st=JSON.parse(readFileSync(f,'utf8'));
  for(const s of[fast,slow])restore(s,{...st,romHash:hash(s.cart.data)});
  const batched=counted(fast),spin=fast.spinWait;
  fast.spinWait=function(x,pc,...a){const p=spin.call(this,x,pc,...a);if(p>0&&loop<0){loop=pc;loopState=st;}return p;};
  compare(fast,slow,12,f);total+=batched(0x24);
 }
 assert.ok(total>100000,`${total} BIT/BNE pairs skipped`);
 // An instruction hook with a breakpoint on the loop sees every iteration.
 const hooked=(s,register)=>{const cpu=s.cpu,previous=cpu.cycle;let hits=0;
  cpu.cycle=function(){if((((this.r[1]&63)<<16)|this.br[4])===(loop&0x3fffff))hits++;return previous.call(this);};
  if(register)cpu.registerBreakpoints(cpu.cycle,previous,[[loop>>16,loop&0xffff]]);return()=>hits;};
 const a=core(),b=core();b.setSpinWait(false);for(const s of[a,b])restore(s,{...loopState,romHash:hash(s.cart.data)});
 const ha=hooked(a,true),hb=hooked(b,true);
 lockstep(b,a,30,'hooked loop');
 assert.ok(ha()>1000&&ha()===hb(),`${ha()} vs ${hb()} hook calls`);
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
test('removing a temporary unregistered wrapper restores exact gating for both gates',()=>{
 // Watch bank 0 code reads and one hot instruction, counting per frame.
 const probe=core(),counts=new Map(),previousProbe=probe.cpu.cycle;
 probe.cpu.cycle=function(){const key=((this.r[1]&63)<<16)|this.br[4];counts.set(key,(counts.get(key)??0)+1);return previousProbe.call(this);};
 for(let i=0;i<120;i++){probe.joypad1State=input(i);probe.runFrame(false);}
 const hot=[...counts].sort((a,b)=>b[1]-a[1])[0][0];
 const install=(s,register)=>{
  const cart=s.cart,previous=cart.read,cpu=s.cpu,prevCycle=cpu.cycle,seen={reads:0,steps:0};
  cart.read=function(bank,adr){if((bank&63)===0&&adr>=0x8000)seen.reads++;return previous.call(this,bank,adr);};
  if(register)cart.registerReadHook(cart.read,previous,m=>m.bank(0,0x8000,0x10000));
  cpu.cycle=function(){if((((this.r[1]&63)<<16)|this.br[4])===hot)seen.steps++;return prevCycle.call(this);};
  if(register)cpu.registerBreakpoints(cpu.cycle,prevCycle,[[hot>>16,hot&0xffff]]);
  return seen;
 };
 const a=install(gated=core(),true),b=install(plain=core(),false);
 var gated,plain;
 const step=(s,i)=>{
  // Frames 40-79 run under an extra, unregistered read wrapper and
  // instruction wrapper (like a temporary scene hook), then remove them.
  if(i===40){for(const [t,key] of[[s.cart,'read'],[s.cpu,'cycle']]){const head=t[key];t['__'+key]=head;t[key]=function(...args){return head.apply(this,args);};}}
  if(i===80){s.cart.read=s.cart.__read;s.cpu.cycle=s.cpu.__cycle;}
  s.joypad1State=input(i);s.runFrame(false);
  if(s===gated&&i>=80)assert.deepEqual([a.reads,a.steps],[b.reads,b.steps],`frame ${i}`);
 };
 for(let i=0;i<140;i++){step(plain,i);step(gated,i);}
 assert.ok(a.reads>100&&a.steps>100,JSON.stringify(a));
});
test('CPU reads reach bus read wrappers exactly at registered offsets; DMA reads always do',()=>{
 const install=(s,register)=>{
  const previous=s.read,seen={cpu:[],dma:0};
  s.read=function(adr,dma){const value=previous.call(this,adr,dma);if(dma)seen.dma++;else if((adr&0xffff)>=0x0040&&(adr&0xffff)<0x0060)seen.cpu.push(adr);return value;};
  if(register)s.registerBusReadHook(s.read,previous,m=>m.offsets(0x0040,0x0060));
  return seen;
 };
 const gated=core(),plain=core(),a=install(gated,true),b=install(plain,false);
 lockstep(plain,gated,240,'bus reads');
 assert.deepEqual(a,b);assert.ok(a.cpu.length>0&&a.dma>0,`${a.cpu.length} CPU, ${a.dma} DMA reads`);
});
