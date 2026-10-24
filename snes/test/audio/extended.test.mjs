import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,StreamPlayer} from './apu.mjs';
import {extendedInfo,customSegments} from './cartridge.mjs';
import {brrEncode} from '../../gen/audio-brr.mjs';
import {silentSong,fieldEcho} from './cues9.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'),ext=extendedInfo(rom);

test('idle prefetch writes exact records across pages without changing voices or stream slots',{skip:!ext},()=>{
 const h=createApu({rom});h.ms(60);
 const immutable=customSegments(rom).filter(s=>s.addr!==0x187C).map(s=>({...s,before:Buffer.from(h.ram.slice(s.addr,s.addr+s.bytes.length))}));
 const flags=Buffer.from(h.ram.slice(0x1818,0x1826));
 const bytes=Uint8Array.from({length:36},(_,i)=>(i*71+19)&255);
 for(const dst of [0x6000,0x60F1,0x7FF0,0xCFFE]){
  const before=h.ram.slice(dst-1,dst+37),groups=[[0x60,dst&255,dst>>8]];
  for(let i=0;i<36;i+=3)groups.push(Array.from(bytes.slice(i,i+3)));
  h.streamCmd(groups);h.ms(1);
  assert.deepEqual(h.ram.slice(dst,dst+36),bytes);
  assert.equal(h.ram[dst-1],before[0]);assert.equal(h.ram[dst+36],before[37]);
  assert.equal(h.ram[0xAE],0);assert.equal(h.cpuRead(0),0);
 }
 assert.deepEqual(Buffer.from(h.ram.slice(0x1818,0x1826)),flags);
 for(const s of immutable)assert.deepEqual(Buffer.from(h.ram.slice(s.addr,s.addr+s.bytes.length)),s.before);
 h.nativeCmd(2,0xE7,15,0x88);h.ms(30);assert.ok(h.cpuRead(3)&0x80,'activation guard sees native effects');
 h.ms(400);assert.equal(h.cpuRead(3)&0x80,0,'guard releases when music owns the voices again');
});

test('prefetch opcode leaves rare channel-zero records and release intact',{skip:!ext},()=>{
 const h=createApu({rom});h.ms(60);const player=new StreamPlayer(h);
 const pcm=Float32Array.from({length:640},(_,i)=>Math.sin(i*.31)*.25),b=brrEncode(pcm).bytes;
 const bytes=new Uint8Array(360);bytes.set(b);for(let i=27;i<360;i+=36)bytes[i]|=3;
 bytes[351]=1;
 player.start(0,{bytes,chunks:10,loopChunk:-1},{pitch:0x300});
 for(let f=0;f<45;f++){player.frame(2,2);h.ms(1000/60.0988);}
 player.stop(0);player.frame();h.ms(100);
 assert.equal(h.ram[0xAE],0);assert.equal(h.ram[0xEC],255);assert.equal(h.cpuRead(3)&0x88,0);
 const {l}=h.take();assert.ok(l.some(v=>Math.abs(v)>500));
});

// Install exactly the ROM descriptor's data and relocated words, as the
// completed preload does. This exercises full clips, not the compact bank.
function extendedApu(extended=true){
 const h=createApu({rom});h.ms(60);silentSong(h,rom,fieldEcho(rom));
 if(!extended)return h;
 const base=0xA000;
 h.ram.set(ext.bytes,base);
 for(let i=0;i<12;i++){
  const a=[0x19C8,0x2FA8,0x2FBC][i>>2]+(i&3)*2;
  const v=ext.words[i]+((ext.relocation>>i)&1?base:0);
  h.ram[a]=v&255;h.ram[a+1]=v>>8;
 }
 return h;
}
test('both teleports are dry one-shots, return their voice promptly and keep arrival quieter',{skip:!ext},()=>{
 for(const extended of [false,true]){
  const rows=[];
  for(const id of [0xEB,0xEF]){
   const h=extendedApu(extended);h.take();h.nativeCmd(2,id,15,0x88);
   let maxVoices=0,lastOwned=0;
   for(let ms=0;ms<400;ms++){
    h.ms(1);const mask=h.ram[0xAE];
    maxVoices=Math.max(maxVoices,mask.toString(2).replaceAll('0','').length);
    if(mask)lastOwned=ms;
    assert.equal(h.dspReg(0x4D)&mask,0,'no effect echo, even when the song has echo');
    assert.equal(h.dspReg(0x3D),0,'no shared DSP noise');
   }
   const {l,r}=h.take();let last=0,peak=0;
   for(const a of [l,r])for(let i=0;i<a.length;i++){peak=Math.max(peak,Math.abs(a[i]));if(Math.abs(a[i])>24)last=Math.max(last,i);}
   assert.ok(last/32>(extended?150:80)&&last/32<(extended?210:125),`short tail ${last/32} ms`);
   assert.ok(lastOwned<(extended?260:190),`prompt voice return ${lastOwned} ms`);
   assert.equal(maxVoices,1);assert.equal(h.ram[0xAE],0);
   assert.ok(l.slice(32000*.25).every(v=>v===0),'no lingering tail after 250 ms');
   assert.ok(peak>3000&&peak<16000,'audible transient with overlap headroom');rows.push(peak);
  }
  assert.ok(rows[1]/rows[0]>.55&&rows[1]/rows[0]<.70,'teleportIn is quieter');
 }
});
test('extended arc and SSJ wave remain bounded and return both voices',{skip:!ext},()=>{
 for(const id of [0xEA,0xF0]){
  const h=extendedApu();h.take();h.nativeCmd(2,id,15,0x88);h.ms(1300);
  const {l,r}=h.take();let peak=0;
  for(const a of [l,r])for(const v of a)peak=Math.max(peak,Math.abs(v));
  assert.ok(peak>10000&&peak<30000,`arc peak ${peak}`);
  assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
  assert.deepEqual(h.ram.slice(0xA000,0xA000+ext.length),new Uint8Array(ext.bytes));
 }
});
