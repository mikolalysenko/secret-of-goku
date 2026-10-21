import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu} from './apu.mjs';
import {customSegments,isResident7} from './cartridge.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'),skip=!isResident7(rom);
const tuple=(h,id)=>{
 const p=0x2C00+id*4+(id===0xE7?2:0),track=h.ram[p]|h.ram[p+1]<<8;
 assert.equal(h.ram[track+6],0xE9);
 return id===0xE5?[h.ram[track+7],h.ram[track+12],h.ram[track+10]]:[h.ram[track+7]];
};
test('swings have six combinations; hit and blast have independent three-pitch cycles',{skip},()=>{
 const h=createApu({rom});h.ms(60);
 const rows=new Map([0xE5,0xE7,0xDE].map(id=>[id,[]]));
 for(let i=0;i<8;i++)for(const id of rows.keys()){
  h.take();h.nativeCmd(2,id,15,0x88);
  let firstPitch,peakVolume=0,noiseClock;
  for(let ms=0;ms<800;ms++){
   h.ms(1);
   for(let v=0;v<8;v++)if((h.ram[0xAE]&(1<<v))&&h.ram[0xFF80+v]===id&&h.dspReg(v*16+8)>0){
    peakVolume=Math.max(peakVolume,h.dspReg(v*16));
    if(h.dspReg(0x3D)&(1<<v))noiseClock=h.dspReg(0x6C)&31;
    else if(firstPitch===undefined)firstPitch=h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8);
   }
  }
  const {l,r}=h.take();assert.ok(l.some(x=>x!==0));assert.ok([...l,...r].every(x=>Math.abs(x)<32767));
  assert.equal(h.ram[0xAE],0,'all effect voices returned');
  assert.equal(noiseClock,id===0xE7?31:undefined,'pitch rotation must not retune shared noise');
  rows.get(id).push({tuple:tuple(h,id),firstPitch,peakVolume});
 }
 const rates=[0,9,0xFA];
 for(const [id,plays] of rows){
  assert.deepEqual(plays.map(p=>p.tuple[0]),Array.from({length:8},(_,i)=>rates[i%3]));
  assert.ok(plays[1].firstPitch>plays[0].firstPitch&&plays[0].firstPitch>plays[2].firstPitch,'audible pitch follows the rate cycle');
  if(id===0xE5){
   assert.equal(new Set(plays.slice(0,6).map(p=>p.tuple.join(','))).size,6);
   assert.deepEqual(plays.slice(0,2).map(p=>p.tuple),plays.slice(6).map(p=>p.tuple));
   assert.deepEqual(plays.map(p=>p.tuple.slice(1)),Array.from({length:8},(_,i)=>i%2?[3,0xF7]:[6,0xFB]));
  }else assert.equal(new Set(plays.map(p=>p.peakVolume)).size,1,'rotation preserves authored contact/launch gain');
 }
});
test('variation storage is immutable and leaves the native stack room across every retail effect',{skip},()=>{
 const h=createApu({rom}),helper=customSegments(rom).find(s=>s.addr===0x180);
 assert.ok(helper&&helper.addr+helper.bytes.length<=0x1C0);
 let stackLow=0x200;
 const write=h.apu.write;
 h.apu.write=function(a,v){
  assert.ok(a<0x180||a>=0x1C0,'native state or stack collided with variation code');
  if(a>=0x1C0&&a<=0x1FF)stackLow=Math.min(stackLow,a);
  return write.call(this,a,v);
 };
 h.ms(60);
 for(let id=0;id<=0xF0;id++){h.nativeCmd(2,id,15,0x88);h.ms(80);}
 assert.ok(stackLow>=0x1E0,'retain at least 32 unused stack bytes below the observed low-water mark');
 assert.deepEqual(Buffer.from(h.ram.slice(helper.addr,helper.addr+helper.bytes.length)),Buffer.from(helper.bytes));
});
