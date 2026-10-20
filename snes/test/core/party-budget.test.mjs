// Execute the assembled companion queue, including its native/flight tail.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const source=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const pending=0x7564,queuing=0x7565,map=0x7566,age0=0x7568,age1=0x7569,magic=0x756A;

function machine(){
  const rom=Buffer.from(source),ram=Buffer.alloc(0x20000),sram=Buffer.alloc(0x10000),calls=[];
  // The tail returns either width, as the real animation interpreter does.
  rom.set([0xC2,0x20,0x60],hiromToPc(0x80F512));
  let line=0,readHigh=false;
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    if(a===0x213F){readHigh=false;return 0;}
    if(a===0x2137)return 0;
    if(a===0x213D){const v=readHigh?line>>8:line&255;readHigh=!readHigh;return v;}
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{if(a>>>16===0x31){sram[a&65535]=v;return;}const r=at(a);assert(r>=0);ram[r]=v;}});
  ram.writeUInt16LE(130,0xDC);sram.writeUInt16LE(130,map);sram.writeUInt16LE(0x5150,magic);sram[0x6001]=1;
  ram[0xE200]=ram[0xE400]=1;
  function run(name,{actor=0x200,bank=0x7E,scanline=0,m8=true}={}){
    const entry=symbols.get(name);assert(entry,`missing ${name}`);line=scanline;
    cpu.reset();cpu.e=false;cpu.m=m8;cpu.x=false;cpu.r[0]=bank;cpu.r[1]=entry>>>16;
    cpu.br.set([0xABCD,actor,0xBEEF,0x1FFD,entry&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<600,`${name} failed to return: ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      if(cpu.r[1]===0x80&&cpu.br[4]===0xF512){
        calls.push(cpu.br[1]);assert(cpu.m&&!cpu.x);assert.equal(cpu.r[0],0x7E);
      }
      cpu.cyclesLeft=0;cpu.cycle();
    }
    assert.equal(cpu.br[3],0x1FFF,`${name} stack`);assert.equal(cpu.r[0],bank,`${name} bank`);
    assert.equal(cpu.br[5],0,`${name} direct page`);
  }
  return {ram,sram,calls,run};
}

test('companion work waits for time, keeps the oldest member first and has a deadline',()=>{
  const m=machine(),{ram,sram,run,calls}=m;
  sram[queuing]=1;run('core_party_queue');run('core_party_queue',{actor:0x400});
  assert.equal(sram[pending],3);assert.deepEqual(calls,[]);
  run('core_party_begin');assert.equal(sram[queuing],0);
  assert.equal(sram[age0],1);assert.equal(sram[age1],1);
  for(const scanline of [90,120,224,261])run('core_party_work',{scanline});
  assert.deepEqual(calls,[]);assert.equal(sram[pending],3);
  sram[age1]=2;run('core_party_work',{scanline:89,bank:0x80});
  assert.deepEqual(calls,[0x400]);assert.equal(sram[pending],1);assert.equal(sram[age1],0);
  sram[age0]=4;run('core_party_work',{scanline:200,bank:0});
  assert.deepEqual(calls,[0x400,0x200]);assert.equal(sram[pending],0);assert.equal(sram[age0],0);
});

test('native actors and human companions bypass queuing; ownership cancels stale work',()=>{
  for(const actor of [0,0x200,0x400,0x600,0x800]){
    const {ram,sram,calls,run}=machine();sram[queuing]=1;
    if(actor===0x200||actor===0x400){ram[0xE02C+actor]=2;sram[pending]=3;}
    run('core_party_queue',{actor});assert.deepEqual(calls,[actor]);
    assert.equal(sram[pending],actor===0x200?2:actor===0x400?1:0);
  }
  for(const actor of [0x200,0x400])for(const removed of [false,true]){
    const {ram,sram,calls,run}=machine();sram[pending]=actor===0x200?1:2;
    if(removed)ram[0xE000+actor]=0;else ram[0xE02C+actor]=2;
    run('core_party_work',{scanline:200});assert.deepEqual(calls,[]);assert.equal(sram[pending],0);
  }
});

test('scene, map, menu and load boundaries discard queued work',()=>{
  for(const [addr,value] of [[0xD0,1],[0xFF,1],[0x52,1],[0xEC,2],[0xED,0x40],
    [0xF1,0x40],[0xF1,0x80],[0xE8,4],[0xDC,131]]){
    const {ram,sram,run}=machine();sram[pending]=3;sram[age0]=sram[age1]=4;ram[addr]=value;
    run('core_party_begin');assert.equal(sram[pending],0);assert.equal(sram[age0]|sram[age1],0);
  }
  for(const [addr,value] of [[0xD0,1],[0xFF,1],[0x52,1],[0xEC,2],[0xED,0x40],
    [0xF1,0x40],[0xF1,0x80],[0xE8,4],[0xDC,131]]){
    const {ram,sram,run,calls}=machine();sram[pending]=3;ram[addr]=value;
    run('core_party_work');assert.equal(sram[pending],0);assert.deepEqual(calls,[]);
  }
  const {ram,sram,run}=machine();sram[pending]=3;sram[0x6001]=0;
  run('core_party_begin');assert.equal(sram[pending],0);
});

test('deferred work rechecks the live carry gate before resuming ground AI',()=>{
  const {ram,sram,calls,run}=machine();sram[pending]=1;
  ram[0xD96C]=3;ram[0xD900]=7;ram.writeUInt16LE(130,0xD966);
  run('core_party_work');assert.deepEqual(calls,[]);assert.equal(sram[pending],0);
  ram[0xD96C]=0;sram[pending]=1;run('core_party_work');assert.deepEqual(calls,[0x200]);
});

test('ki blasts, charging, beams, teleport and camera recovery queue companion work',()=>{
  for(const action of [0,0x10,0x11,0x12,0x13,0x14,0x15,0x18])for(const camera of [false,true]){
    const {ram,sram,calls,run}=machine();
    ram[0xD742]=action;ram[0xD932]=camera?4:0;sram[queuing]=1;
    run('fl_hook_passenger_ai');
    const deferred=camera||[0x11,0x12,0x13,0x14].includes(action);
    assert.equal(sram[pending],deferred?1:0);
    assert.deepEqual(calls,deferred?[]:[0x200]);
  }
});

test('even continuously busy frames finish each job before the next five-frame tick',()=>{
  const {sram,calls,run}=machine();
  const scheduled=[0,0];
  for(let frame=0;frame<104;frame++){
    run('core_party_begin');
    if(frame<100&&(frame%5===0||frame%5===4)){
      const member=frame%5===4?0:1,bit=1<<member;
      assert.equal(sram[pending]&bit,0,'a new tick cannot overwrite an older job');
      sram[queuing]=1;
      run('core_party_queue',{actor:(member+1)*0x200});
      sram[queuing]=0;scheduled[member]++;
    }
    assert(Math.max(sram[age0],sram[age1])<=4,'deadline exceeded');
    run('core_party_work',{scanline:200});
  }
  assert.equal(sram[pending],0);
  assert.deepEqual(scheduled,[20,20]);
  for(let member=0;member<2;member++)
    assert.equal(calls.filter(x=>x===(member+1)*0x200).length,scheduled[member]);
});

test('the first physical teleport chord reserves time before flight sets its action',()=>{
  for(const pad of [0,0x20,0x8000,0x8020,0xC020]){
    const {sram,calls,run}=machine();
    sram[queuing]=1;sram.writeUInt16LE(pad,0x748A);
    run('fl_hook_passenger_ai');
    const teleport=(pad&0x8020)===0x8020;
    assert.equal(sram[pending],teleport?1:0);
    assert.deepEqual(calls,teleport?[]:[0x200]);
  }
});

test('physical ki and charge input reserves time without delaying ordinary punches',()=>{
  for(const pad of [0,0x20,0x8000,0x4000,0xC000,0x4020,0xC020]){
    const {sram,calls,run}=machine();
    sram[queuing]=1;sram.writeUInt16LE(pad,0x748A);
    run('fl_hook_passenger_ai');
    const deferred=(pad&0x4000)!==0||(pad&0x8020)===0x8020;
    assert.equal(sram[pending],deferred?1:0);
    assert.deepEqual(calls,deferred?[]:[0x200]);
  }
});

test('ending a teleport cannot run a fresh companion alongside an older queued job',()=>{
  const {sram,calls,run}=machine();
  sram[pending]=1;sram[age0]=4;sram[queuing]=1;
  run('fl_hook_passenger_ai',{actor:0x400});
  assert.deepEqual(calls,[]);assert.equal(sram[pending],3);
  sram[queuing]=0;
  run('core_party_work',{scanline:200});
  assert.deepEqual(calls,[0x200]);assert.equal(sram[pending],2);
  run('core_party_begin');run('core_party_work',{scanline:0});
  assert.deepEqual(calls,[0x200,0x400]);assert.equal(sram[pending],0);
});

test('old-state noise and resets cannot carry jobs across actor contexts',()=>{
  for(const mode of ['core_party_begin','core_party_reset','core_party_queue']){
    const {sram,run}=machine();
    sram.fill(0xA5,0x7520,0x7562); // the adjacent water palette is not queue state
    sram[pending]=3;sram[queuing]=1;sram[age0]=sram[age1]=255;
    sram.writeUInt16LE(0,magic);
    run(mode);
    assert.equal(sram[pending],mode==='core_party_queue'?1:0);
    assert.equal(sram[age0]|sram[age1],0);
    assert.equal(sram.readUInt16LE(magic),0x5150);
    assert(sram.subarray(0x7520,0x7562).every(x=>x===0xA5));
  }
});

test('a map change inside status cannot relabel an older member job',()=>{
  const {ram,sram,run}=machine();sram[pending]=1;sram[age0]=3;
  run('core_party_begin');
  ram.writeUInt16LE(131,0xDC);sram[queuing]=1;
  run('core_party_queue',{actor:0x400});
  assert.equal(sram[pending],2);assert.equal(sram[age0]|sram[age1],0);
  assert.equal(sram.readUInt16LE(map),131);
});
