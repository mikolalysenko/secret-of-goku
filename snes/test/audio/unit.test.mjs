// Unit tests for the audio module's generators: SPC700 assembler/disassembler,
// BRR codec, sequence codec and DSP model.  node --test snes/test/audio/
import test from 'node:test';
import assert from 'node:assert/strict';
import {assemble,decode,opLength} from '../../gen/audio-spc700.mjs';

test('SPC700: every opcode disassembles and reassembles to the same bytes',()=>{
 for(let op=0;op<256;op++){
  const bytes=[op,0x34,0x12,0,0];const pc=0x0400;
  const read=a=>a>=pc&&a<pc+bytes.length?bytes[a-pc]:0;
  const d=decode(read,pc);
  assert.equal(d.len,opLength(op));
  const {segments}=assemble(`org $${pc.toString(16)}\n ${d.text}`);
  assert.deepEqual(segments[0].bytes,bytes.slice(0,d.len),`${op.toString(16)} ${d.text}`);
 }
});

test('SPC700: labels, expressions and directives',()=>{
 const src=`
  base = $1598
  org base
start:   MOV A,#<table
         MOV Y,#>table
         MOV A,!table+1+X
         BNE start
         CBNE $3C+X,start
         BBS $B1.7,start
         MOV $F2,#$7C
         MOV $34,$35
         CALL !start
         MOV1 C,$00B1.3
table:   db 1,2,3
         dw start,table
  `;
 const {segments,symbols}=assemble(src);
 const b=segments[0].bytes,table=symbols.get('table');
 assert.equal(segments[0].addr,0x1598);
 assert.deepEqual(b.slice(0,4),[0xE8,table&0xff,0x8D,table>>8]);
 assert.deepEqual(b.slice(4,7),[0xF5,(table+1)&0xff,(table+1)>>8]);
 assert.deepEqual(b.slice(7,9),[0xD0,(0x1598-(0x1598+9))&0xff]);
 assert.equal(b[9],0xDE);assert.equal(b[12],0xE3);
 assert.deepEqual(b.slice(15,18),[0x8F,0x7C,0xF2]);
 assert.deepEqual(b.slice(18,21),[0xFA,0x35,0x34]);
 assert.deepEqual(b.slice(24,27),[0xAA,0xB1,0x60]);
 assert.deepEqual(b.slice(table-0x1598),[1,2,3,0x98,0x15,table&0xff,table>>8]);
 assert.throws(()=>assemble('org 0\n BNE far\n ds 200\nfar: NOP'),/branch out of range/);
 assert.throws(()=>assemble('org 0\n MOV A,$1234'),/out of range/);
});

import {brrEncode,brrDecode,resample} from '../../gen/audio-brr.mjs';
import {SDsp} from './sdsp.mjs';
import {decodeBrr as manaDecode} from '../../../engine/mana-instruments.js';

test('BRR: encoder round-trips a sine at high SNR and matches the browser decoder',()=>{
 const n=4096,pcm=new Float32Array(n);
 for(let i=0;i<n;i++)pcm[i]=0.6*Math.sin(2*Math.PI*440*i/12000)+0.2*Math.sin(2*Math.PI*1830*i/12000);
 const {bytes,blocks,snr}=brrEncode(pcm);
 assert.equal(blocks,256);assert.ok(snr>30,`snr ${snr}`);
 bytes[(blocks-1)*9]|=1;
 const {pcm:dec}=brrDecode(bytes);
 assert.deepEqual(Array.from(dec),Array.from(manaDecode(bytes,0,bytes.length)));
 let err=0,sig=0;for(let i=0;i<n;i++){err+=(dec[i]/16384-pcm[i])**2;sig+=pcm[i]**2;}
 assert.ok(10*Math.log10(sig/err)>30);
});

test('BRR: resampler keeps level and frequency',()=>{
 const pcm=new Float32Array(16000);for(let i=0;i<pcm.length;i++)pcm[i]=0.5*Math.sin(2*Math.PI*1000*i/16000);
 const out=resample(pcm,16000,12000);
 assert.equal(out.length,12000);
 let zc=0;for(let i=1;i<out.length;i++)if(out[i-1]<0&&out[i]>=0)zc++;
 assert.ok(Math.abs(zc-1000)<=2,`zero crossings ${zc}`);
 let peak=0;for(let i=200;i<out.length-200;i++)peak=Math.max(peak,Math.abs(out[i]));
 assert.ok(Math.abs(peak-0.5)<0.01,`peak ${peak}`);
});

function dspWith(sample,{loop=0,pitch=0x1000,adsr=[0x8F,0xE0]}={}){
 const aram=new Uint8Array(0x10000),dsp=new SDsp(aram);
 aram.set(sample,0x2000);aram[0x1000]=0x00;aram[0x1001]=0x20;const la=0x2000+loop*9;aram[0x1002]=la&0xff;aram[0x1003]=la>>8;
 const w=(r,v)=>dsp.write(r,v);
 w(0x6C,0x20);w(0x5D,0x10);w(0x0C,127);w(0x1C,127);w(0x00,127);w(0x01,127);w(0x04,0);w(0x02,pitch&0xff);w(0x03,pitch>>8);w(0x05,adsr[0]);w(0x06,adsr[1]);
 return {aram,dsp,w};
}
test('DSP model: unity pitch reproduces the BRR samples; END without LOOP silences; ENDX on jump',()=>{
 const pcm=new Float32Array(32*16);for(let i=0;i<pcm.length;i++)pcm[i]=0.5*Math.sin(2*Math.PI*i/32);
 const {bytes}=brrEncode(pcm);const sample=new Uint8Array(bytes.length+9);sample.set(bytes);sample[bytes.length]=0x01;// silent END block
 const {dsp,w}=dspWith(sample);
 w(0x4C,1);
 for(let i=0;i<600;i++)dsp.cycle();
 const {l}=dsp.take();
 // after KON delay + attack, the output follows the sine (period 32 samples)
 let zc=0;for(let i=40;i<500;i++)if(l[i-1]<0&&l[i]>=0)zc++;
 assert.ok(zc>=13&&zc<=15,`zero crossings ${zc}`);
 let tail=0;for(let i=560;i<600;i++)tail=Math.max(tail,Math.abs(l[i]));
 assert.equal(tail,0,'END block silences the voice');
 assert.equal(dsp.read(0x7C)&1,1,'ENDX set after the END block');
});
test('DSP model: looping sample keeps playing and echo writes the ring',()=>{
 const pcm=new Float32Array(64);for(let i=0;i<64;i++)pcm[i]=0.5*Math.sin(2*Math.PI*i/16);
 const {bytes}=brrEncode(pcm);bytes[9*3]|=3;// END|LOOP on the 4th block
 const {aram,dsp,w}=dspWith(bytes,{loop:0});
 w(0x6D,0x80);w(0x7D,1);w(0x4D,1);w(0x0D,0x40);w(0x2C,0x40);w(0x3C,0x40);w(0x7F,0x7F);w(0x6C,0x00);
 w(0x4C,1);for(let i=0;i<4000;i++)dsp.cycle();
 const {l}=dsp.take();let rms=0;for(let i=3000;i<4000;i++)rms+=l[i]*l[i];rms=Math.sqrt(rms/1000);
 assert.ok(rms>3000,`loop rms ${rms}`);
 let nz=0;for(let i=0x8000;i<0x8800;i++)if(aram[i])nz++;assert.ok(nz>100,'echo ring written');
});

import {createApu,StreamPlayer,extensionSegments,driverChunks,loadRom} from './apu.mjs';
import {buildStreamClip,CHUNK_BYTES} from '../../gen/audio-stream.mjs';

const tone=(hz,sec,rate=12000,amp=0.5)=>{const n=Math.round(rate*sec),p=new Float32Array(n);for(let i=0;i<n;i++)p[i]=amp*Math.sin(2*Math.PI*hz*i/rate)*Math.min(1,i/60,(n-i)/60);return p;};
const rmsWindows=(l,win=320)=>{const r=[];for(let i=0;i+win<=l.length;i+=win){let e=0;for(let j=i;j<i+win;j++)e+=l[j]*l[j];r.push(Math.sqrt(e/win));}return r;};
const zeroCrossHz=(l,a,b)=>{let zc=0;for(let i=a+1;i<b;i++)if(l[i-1]<0&&l[i]>=0)zc++;return zc/((b-a)/32000);};

test('stream extension stays inside ARAM the driver never uses',()=>{
 const {segments}=extensionSegments();
 const allowed=[[0x1598,0x17FF],[0xFF89,0xFFFF],[0x1818,0x183F],[0x1898,0x18BF],[0x1930,0x197F],[0x00E3,0x00EF]];
 const patches=new Map([[0x020A,[0xF0]],[0x0279,[0x3F,0xAF,0x0C]],[0x0299,[0xDA,0xF6]],[0x02E1,[0xE4,0xAE,0xC4,0x02]],[0x02F4,[0x5F,0x79,0x02]],[0x0378,[0xE4,0xAE,0xC4,0x02]],[0x14C6,[0xDD,0x12]]]);
 const driver=new Uint8Array(0x10000);for(const c of driverChunks(loadRom()))driver.set(c.bytes,c.addr);
 for(const s of segments){
  const end=s.addr+s.bytes.length-1;
  if(patches.has(s.addr)){assert.deepEqual(Array.from(driver.subarray(s.addr,end+1)),patches.get(s.addr),`original bytes at ${s.addr.toString(16)}`);continue;}
  assert.ok(allowed.some(([a,b])=>s.addr>=a&&end<=b),`segment ${s.addr.toString(16)}-${end.toString(16)}`);
  for(let i=s.addr;i<=end;i++)assert.equal(driver[i],0,`driver image has data at ${i.toString(16)}`);
 }
});

test('stream: a streamed tone plays without gaps on voice 7, then the voice returns to the driver',()=>{
 const h=createApu();h.ms(60);
 const clip=buildStreamClip(tone(440,0.5));
 const p=new StreamPlayer(h);h.take();p.start(0,clip,{pitch:0x0600,vol:[100,100]});
 let peakVoice=-1;
 for(let f=0;f<45;f++){p.frame();if(f===10){peakVoice=h.ram[0xEC];assert.equal(h.ram[0xAE]&0x80,0x80);}h.ms(16.7);}
 assert.equal(peakVoice,7);
 const {l}=h.take(),r=rmsWindows(l);
 const body=r.slice(5,50);assert.ok(Math.min(...body)>0.9*Math.max(...body),`steady level ${Math.min(...body)} ${Math.max(...body)}`);
 assert.ok(Math.abs(zeroCrossHz(l,3200,12800)-440)<4);
 assert.equal(h.ram[0xAE]&0x80,0,'voice handed back');assert.equal(h.ram[0xEC],0xFF);
 assert.deepEqual(h.status().active,[false,false]);
});

test('stream: a command the CPU withdraws is cancelled, taken or not',()=>{
 for(const extension of [true,false]){
  const h=createApu({extension});h.ms(60);
  // withdrawn before the driver polled the ports
  h.cpuWrite(1,3);h.cpuWrite(0,0x8A);h.cpuWrite(0,0);h.ms(10);
  assert.equal(h.cpuRead(0),0);
  // the driver echoed $8A, then the CPU gave up: the command returns at once
  h.cpuWrite(1,3);h.cpuWrite(0,0x8A);h.waitFor(()=>h.cpuRead(0)===0x8A);h.cpuWrite(0,0);h.ms(10);
  assert.equal(h.cpuRead(0),0,'driver back in its main loop');
  if(extension){
   const p=new StreamPlayer(h),clip=buildStreamClip(tone(440,0.3));
   h.take();p.start(0,clip);
   for(let f=0;f<20;f++){p.frame();h.ms(16.7);}
   const {l}=h.take();
   assert.ok(Math.abs(zeroCrossHz(l,3200,6400)-440)<6,`streams still play (${zeroCrossHz(l,3200,6400).toFixed(0)} Hz)`);
  }
  h.dsp.keyOns.length=0;h.nativeCmd(2,0x50,0x0F,0x88);h.ms(40);
  assert.ok(h.dsp.keyOns.length>0,'native effects still play');
 }
});

test('stream: native effects keep working beside two streams; stop releases a loop',()=>{
 const h=createApu();h.ms(60);
 const p=new StreamPlayer(h);
 const loop=buildStreamClip(tone(300,64*40/12000),{loop:true}),shot=buildStreamClip(tone(660,0.4));
 p.start(0,loop);p.start(1,shot);
 for(let f=0;f<6;f++){p.frame();h.ms(16.7);}
 assert.equal(h.ram[0xEC],7);assert.equal(h.ram[0xED],6);assert.equal(h.ram[0xAE]&0xC0,0xC0);
 h.dsp.keyOns.length=0;
 h.nativeCmd(2,0x50,0x0F,0x88);           // the game's hit effect
 h.ms(40);
 const kons=h.dsp.keyOns.reduce((m,k)=>m|k.mask,0);
 assert.ok(kons&0x30,`native effect keyed a free voice (${kons.toString(16)})`);
 assert.equal(kons&0xC0,0,'stream voices untouched by the native effect');
 for(let f=0;f<6;f++){p.frame();h.ms(16.7);}
 assert.ok(h.status().active[0]);
 p.stop(0);p.frame();h.ms(20);
 assert.equal(h.dsp.ram[0x5C]&0x80,0,'KOF register cleared again after the tick');
 assert.equal(h.ram[0xAE]&0x80,0,'loop voice released after its KOF');
 assert.ok(!h.status().active[0]);
});
