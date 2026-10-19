// Exercise the assembled beam scheduler with scan workers of known cost.
// The emulator suite separately checks the real scanners against browser
// map edits and barrier events. Here a slow worker must not force a second
// slow scan, starve the other part, or lose the latest beam arguments.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
import {destroyAbi} from './abi.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const fields=['x','y','dir','len','half','taper','kind','str','layer'];
const abi=destroyAbi(['hp_id','hp_worked','hp_left','hp_turn','cl_t0','DESTROY_HIT_SPAN',
  ...fields.map(n=>'hp_'+n)]);
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  (a>>>16)===0x31&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
function harness({line=0,cost=[40,40],left=[100,100],ground=true}={}){
  const ram=Buffer.alloc(0x22000),calls=[];
  const read=n=>ram.readUInt16LE(at(abi[n]));
  const write=(n,v)=>ram.writeUInt16LE(v&65535,at(abi[n]));
  let high=false;
  const cpu=new context.Cpu({
    cpuRead:a=>{
      if(a===0x213F||a===0x2137){high=false;return 0;}
      if(a===0x213D){const v=high?line>>8:line&255;high=!high;return v;}
      return at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)];
    },
    cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;},
  });
  const ret=()=>{
    cpu.br[4]=(ram.readUInt16LE(cpu.br[3]+1)+1)&65535;
    cpu.br[3]+=2;
  };
  function run(name){
    const entry=symbols.get(name);assert(entry,`missing ${name}`);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
    cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([0,0,0,0x1FFD,entry&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    const first=calls.length;
    let n=0;
    while(cpu.br[4]!==0x7000){
      assert(++n<1000,`${name} did not return`);
      const pc=(cpu.r[1]<<16)|cpu.br[4];
      const part=pc===symbols.get('dst_scan_attack')?0:pc===symbols.get('dst_barrier_hit')?1:-1;
      if(part>=0){
        calls.push({part:part+1,args:Object.fromEntries(['id',...fields].map(k=>[k,read('arg_'+k)]))});
        line=(line+cost[part])%262;
        if(left[part]>0)left[part]--;
        if(left[part]===0){
          // Return through the real completion helper, as both scanners do.
          cpu.br[0]=part+1;cpu.br[4]=symbols.get('dst_hit_done')&65535;
        }else ret();
        continue;
      }
      if(pc===symbols.get('dst_ground_ok')){cpu.c=ground;ret();continue;}
      cpu.cyclesLeft=0;cpu.cycle();
    }
    assert.equal(cpu.br[3],0x1FFF,'balanced stack');
    assert.equal(cpu.r[0],0x7E);assert.equal(cpu.br[5],0);
    assert.equal(cpu.m,false);assert.equal(cpu.x,false);
    return calls.slice(first);
  }
  function args(id=7,extent=320){
    const a={id,x:0x123,y:0x456,dir:3,len:extent,half:64,taper:44,kind:3,str:256,layer:0xFFFF};
    for(const [n,v]of Object.entries(a))write('arg_'+n,v);
    write('cl_t0',line);
    return a;
  }
  return {read,write,run,args,calls};
}

test('beam scans share one time budget, including the video-counter wrap',()=>{
  const span=abi.DESTROY_HIT_SPAN;
  for(let line=0;line<262;line++)for(const turn of [0,1])for(const mask of [1,2,3])
    for(const used of [0,span-1,span,span+1,80]){
      const h=harness({line,cost:[used,used]});h.args();
      h.write('hp_id',7);h.write('hp_left',mask);h.write('hp_turn',turn);
      const calls=h.run('dst_hit_work').map(c=>c.part);
      const wanted=mask===3?(used<span?[turn+1,2-turn]:[turn+1]):[mask];
      assert.deepEqual(calls,wanted,JSON.stringify({line,turn,mask,used}));
      assert.equal(h.read('hp_left'),mask,'unfinished parts stay queued');
    }
});

test('a growing beam gives both slow workers progress and retains its newest arguments',()=>{
  const h=harness();
  for(let i=0;i<12;i++){
    const wanted=h.args(7,32+i*32),call=h.run('dst_hit_begin');
    assert.equal(call.length,1,'a slow first worker exhausts this call');
    assert.equal(call[0].part,i%2+1,'each part progresses every other call');
    assert.deepEqual(call[0].args,wanted);
    assert.equal(h.read('hp_id'),7);assert.equal(h.read('hp_left'),3);
    for(const n of fields)assert.equal(h.read('hp_'+n),wanted[n],`saved ${n}`);
  }
  // End the beam, overwrite combat's argument area, and let the field
  // continuation finish the saved request. The field latch prevents a
  // second scan even when the core frame counter has changed.
  const saved=Object.fromEntries(['id',...fields].map(n=>[n,h.read('hp_'+n)]));
  h.args(99,1);
  assert.equal(h.run('dst_hit_continue').length,1);
  assert.deepEqual(h.calls.at(-1).args,saved);
  assert.equal(h.read('hp_worked'),1);
  assert.equal(h.run('dst_hit_continue').length,0);
});

test('completed, replaced and cancelled requests do not leave stale beam work',()=>{
  const h=harness({cost:[20,20],left:[1,1]});
  h.args();h.run('dst_hit_begin');
  assert.equal(h.read('hp_left'),2);assert.equal(h.read('hp_id'),7);
  assert.deepEqual(h.run('dst_hit_continue').map(c=>c.part),[2]);
  assert.equal(h.read('hp_left'),0);assert.equal(h.read('hp_id'),0);
  assert.equal(h.run('dst_hit_continue').length,0);

  const replace=harness();
  replace.args(7);replace.run('dst_hit_begin');
  const wanted=replace.args(8,112);
  const call=replace.run('dst_hit_begin');
  assert.deepEqual(call.map(c=>c.part),[1],'new beam starts with terrain');
  assert.deepEqual(call[0].args,wanted);
  assert.equal(replace.read('hp_id'),8);

  const busy=harness({ground:false});
  busy.args();busy.run('dst_hit_begin');
  assert.equal(busy.run('dst_hit_continue').length,0,'events cancel background work');
  assert.equal(busy.read('hp_id'),0);assert.equal(busy.read('hp_left'),0);
});
