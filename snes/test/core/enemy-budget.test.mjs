// Execute the assembled flight scheduler and real post-status hook. Native
// AI/animation is an observed return stub; status is deliberately not called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const deferred=resolve(root,process.env.ENEMY_DEFER_ROM??'.local/snes-test/enemy-budget/deferred.sfc');
if(!process.env.ENEMY_DEFER_ROM){
  mkdirSync(resolve(root,'.local/snes-test/enemy-budget'),{recursive:true});
  execFileSync(process.execPath,['snes/build.mjs','--strict','--quiet',
    `--out=${deferred}`,'-DCORE_ENEMY_DEFER=1'],{cwd:root,stdio:'pipe'});
}
const images=[path,deferred].map(path=>({source:readFileSync(path),
  symbols:new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
    .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]))}));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const pending=0x75EC,map=0x75F0,magic=0x75F2;

function machine(defer=true){
  const {source,symbols}=images[Number(defer)];
  const rom=Buffer.from(source),ram=Buffer.alloc(0x20000),sram=Buffer.alloc(0x10000),calls=[];
  rom.set([0xC2,0x20,0x60],hiromToPc(0x80F512));
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{if(a>>>16===0x31){sram[a&65535]=v;return;}const r=at(a);assert(r>=0);ram[r]=v;}});
  ram.writeUInt16LE(130,0xDC);sram.writeUInt16LE(130,map);sram.writeUInt16LE(0x5145,magic);
  sram[0x6001]=1;ram[0xED]=0x80;ram[0xD96C]=3;ram[0xD900]=7;ram.writeUInt16LE(130,0xD966);
  ram[0xE800]=ram[0xEA00]=1;ram[0xE980]=5;ram[0xEB80]=6;
  function run(name,{actor=0x800,bank=0x7E,phase=1,m8=true}={}){
    const entry=symbols.get(name);assert(entry,`missing ${name}`);ram[0x56]=phase;
    cpu.reset();cpu.e=false;cpu.m=m8;cpu.x=false;cpu.r[0]=bank;cpu.r[1]=entry>>>16;
    cpu.br.set([0xABCD,actor,0xBEEF,0x1FFD,entry&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<600,`${name} failed to return: ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      if(cpu.r[1]===0x80&&cpu.br[4]===0xF512){
        calls.push({actor:cpu.br[1],phase});assert(cpu.m&&!cpu.x);assert.equal(cpu.r[0],0x7E);
      }
      cpu.cyclesLeft=0;cpu.cycle();
    }
    assert.equal(cpu.br[3],0x1FFF,`${name} stack`);assert.equal(cpu.r[0],bank,`${name} bank`);
    assert.equal(cpu.br[5],0,`${name} direct page`);
  }
  return {ram,sram,calls,run};
}

test('production keeps enemy decisions on their native phases during flight',()=>{
  const {ram,sram,calls,run}=machine(false),expected=[];
  for(let frame=0;frame<500;frame++){
    const phase=frame%5;ram[0xD96C]=Math.floor(frame/7)%2?0:3;
    if(phase===1||phase===2){
      const actor=phase===1?0x800:0xA00;
      expected.push({actor,phase});run('fl_hook_passenger_ai',{actor,phase});
      assert.deepEqual(calls,expected,'native AI must finish in the submitting update');
    }
    run('core_enemy_work',{phase});
    assert.equal(sram[pending],0);assert.deepEqual(calls,expected);
  }
});

test('airborne enemy AI moves from phases 1/2 to 3/4 exactly once',()=>{
  const {sram,calls,run}=machine();
  run('fl_hook_passenger_ai');run('fl_hook_passenger_ai',{actor:0xA00,phase:2});
  assert.equal(sram[pending],3);assert.deepEqual(calls,[]);
  for(const phase of [0,1,2])run('core_enemy_work',{phase});
  assert.deepEqual(calls,[]);
  run('core_enemy_work',{phase:3,bank:0x80});
  assert.equal(sram[pending],2);assert.deepEqual(calls,[{actor:0x800,phase:3}]);
  run('core_enemy_work',{phase:4,bank:0});run('core_enemy_work',{phase:4});
  assert.equal(sram[pending],0);assert.deepEqual(calls,[{actor:0x800,phase:3},{actor:0xA00,phase:4}]);
});

test('landing or handing a companion to player two finishes pending work',()=>{
  for(const addr of [0xD96C,0xD900,0xE22C,0xE42C]){
    const {ram,sram,calls,run}=machine();run('fl_hook_passenger_ai');
    ram[addr]=addr>=0xE000?2:0;run('core_enemy_work',{phase:3});
    assert.equal(sram[pending],0);assert.deepEqual(calls,[{actor:0x800,phase:3}]);
    run('fl_hook_passenger_ai');assert.equal(sram[pending],0);
    assert.deepEqual(calls,[{actor:0x800,phase:3},{actor:0x800,phase:1}]);
  }
});

test('scene, map, mode and special native updates cancel pending work',()=>{
  for(const [addr,value] of [[0xD0,1],[0xFF,1],[0x52,1],[0xEC,2],[0xED,0xC0],
    [0xED,0],[0xF1,0x40],[0xF1,0x80],[0xE8,4],[0x5C,0x80],[0xDC,131]]){
    const {ram,sram,calls,run}=machine();run('fl_hook_passenger_ai');ram[addr]=value;
    run('core_enemy_work',{phase:3});assert.equal(sram[pending],0);assert.deepEqual(calls,[]);
    run('fl_hook_passenger_ai');assert.deepEqual(calls,[{actor:0x800,phase:1}]);
  }
  for(const reset of ['core_enemy_reset','core_safe_clear']){
    const {sram,calls,run}=machine();run('fl_hook_passenger_ai');run(reset,{m8:false});
    assert.equal(sram[pending],0);run('core_enemy_work',{phase:3});assert.deepEqual(calls,[]);
  }
  const {sram,calls,run}=machine();run('fl_hook_passenger_ai');sram[0x6001]=0;
  run('core_enemy_work',{phase:3});assert.equal(sram[pending],0);assert.deepEqual(calls,[]);
});

test('bosses, NPCs, ground actors and incomplete carry states keep the native phase',()=>{
  for(const species of [0x54,0x55,0x57,0x7F,0x80,0xF9,0xFF]){
    const {ram,sram,calls,run}=machine();ram[0xE980]=species;run('fl_hook_passenger_ai');
    assert.equal(sram[pending],0);assert.deepEqual(calls,[{actor:0x800,phase:1}]);
  }
  for(const [addr,value] of [[0xD96C,0],[0xD96C,1],[0xD96C,2],[0xD900,3],
    [0xD900,5],[0xD900,6],[0xD976,1],[0xD977,1],[0xD966,131],[0xE22C,2],[0xE42C,2]]){
    const {ram,sram,calls,run}=machine();ram[addr]=value;run('fl_hook_passenger_ai');
    assert.equal(sram[pending],0);assert.deepEqual(calls,[{actor:0x800,phase:1}]);
  }
  for(const actor of [0,0x600,0xC00,0xE00]){
    const {sram,calls,run}=machine();run('fl_hook_passenger_ai',{actor});
    assert.equal(sram[pending],0);assert.deepEqual(calls,[{actor,phase:1}]);
  }
});

test('enemy removal, defeat sheets and slot reuse cannot replay an old animation',()=>{
  for(const [addr,value] of [[0xE800,0],[0xE980,6],[0xE980,0xF9]]){
    const {ram,sram,calls,run}=machine();run('fl_hook_passenger_ai');ram[addr]=value;
    run('core_enemy_work',{phase:3});assert.equal(sram[pending],0);assert.deepEqual(calls,[]);
  }
  const {sram,calls,run}=machine();run('fl_hook_passenger_ai');
  run('fl_hook_passenger_ai',{phase:2});run('core_enemy_work',{phase:3});
  assert.equal(sram[pending],0);assert.deepEqual(calls,[{actor:0x800,phase:2}]);
});

test('map changes during status and older-state noise cannot relabel pending jobs',()=>{
  const {ram,sram,calls,run}=machine();run('fl_hook_passenger_ai');
  ram.writeUInt16LE(131,0xDC);ram.writeUInt16LE(131,0xD966);
  run('fl_hook_passenger_ai',{actor:0xA00,phase:2});assert.equal(sram[pending],2);
  run('core_enemy_work',{phase:3});run('core_enemy_work',{phase:4});
  assert.deepEqual(calls,[{actor:0xA00,phase:4}]);
  sram.fill(0xA5,0x75EC,0x7600);run('fl_hook_passenger_ai');
  assert.equal(sram[pending],1);assert.equal(sram.readUInt16LE(magic),0x5145);
  assert(sram.subarray(0x75F4,0x7600).every(x=>x===0xA5));
});

test('continuous flight and repeated takeoffs never lose or duplicate a native tick',()=>{
  for(const period of [1,2,3,5,7,1000]){
    const {ram,sram,calls,run}=machine();const submissions=[];
    for(let frame=0;frame<502;frame++){
      const phase=frame%5;ram[0xD96C]=Math.floor(frame/period)%2?0:3;
      if(frame<500&&(phase===1||phase===2)){
        const actor=phase===1?0x800:0xA00,bit=phase===1?1:2;
        assert.equal(sram[pending]&bit,0,'new tick overwrote an older job');
        submissions.push(actor);run('fl_hook_passenger_ai',{actor,phase});
      }
      run('core_enemy_work',{phase});
    }
    assert.equal(sram[pending],0);
    for(const actor of [0x800,0xA00])
      assert.equal(calls.filter(c=>c.actor===actor).length,submissions.filter(a=>a===actor).length);
  }
});
