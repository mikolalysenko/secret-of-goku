// Compare the assembled batched clamp/tail hook with the original loop
// and JSL/return-address wrapper, including the real Heavy Gi adjustment.
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
const flags=['c','z','i','d','x','m','v','n'];
const scalar=Buffer.from(source),adjust=symbols.get('cb_agility_stats');
scalar.set([0xA9,0x05,0x85,0xA4],hiromToPc(0xC04BD7,scalar.length));
const legacy=Buffer.from(scalar);
assert.equal(adjust>>>16,0xA2);
assert(symbols.get('combat_bind_end')<0xA2FF00);
// Original cb_hook_attr_clamp, relocated within the same program bank.
// Its JSR still calls this build's unchanged agility routine.
const wrapper=Buffer.from([
  ...Buffer.from('F00C08C22048A9DA4B830468286BA6BDD02508C23048DA5A8BF47E7EABABE220AD57D8F00B9C57D8C220A9010020','hex'),
  adjust&255,(adjust>>>8)&255,
  ...Buffer.from('C230AB7AFA68286B','hex'),
]);
legacy.set(wrapper,hiromToPc(0xA2FF00,legacy.length));
legacy.set([0x22,0x00,0xFF,0xA2],hiromToPc(0xC04BF2,legacy.length));

function runner(rom){
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}`);ram[p]=v;},
  });
  return ({slot=3,actor=slot*512,values=[0,1,99,100,255],status=0,p=0x20,dp=0x300,db=0x7E,
    fresh=0,active=1,gi=0x16,alive=1,acc=0xABCD}={})=>{
    ram.fill(0);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    ram.writeUInt16LE(actor,dp+0xBD);
    ram.set(values,0xE188+actor);ram[0xE190+actor]=status;
    ram[0xD857]=fresh;ram[0xD8CB]=active;ram[0xE1E1]=gi;ram[0xE000]=alive;
    // Preserve the byte beside the loop counter and the accumulator high byte.
    ram[dp+0xA5]=0xB7;ram.writeUInt16LE(0x6FFF,0x1FFE);
    cpu.r[0]=db;cpu.r[1]=0xC0;
    cpu.br.set([acc,actor,p&16?0xEF:0xBEEF,0x1FFD,0x4BBE,dp]);
    let n=0,cycles=0,adjustments=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0xC0){
      assert(++n<4000,'attribute clamp did not return');
      if(((cpu.r[1]<<16)|cpu.br[4])===adjust)adjustments++;
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000); // inactive stack bytes are not outputs
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,cycles,adjustments};
  };
}
const before=runner(legacy),loop=runner(scalar),after=runner(source);
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert(a.ram.equals(b.ram),`RAM ${why}`);
  assert.equal(b.adjustments,a.adjustments,`agility calls ${why}`);
  return {before:a.cycles,after:b.cycles,ram:b.ram,adjustments:b.adjustments};
}

test('tail jumps retain every attribute byte, flag and native scratch output',t=>{
  for(let value=0;value<256;value++)for(let slot=0;slot<6;slot++)for(const status of [0,8]){
    const p=0x20|((value<<1)&0xCF);
    compare({slot,values:Array.from({length:5},(_,i)=>(value+i*61)&255),status,p,
      dp:value&1?0:0x300});
  }
  for(let p=0;p<256;p++)if((p&0x30)===0x20)compare({p});
  const result=compare({});
  assert(result.after<result.before*.75,`${result.before} -> ${result.after} cycles`);
  t.diagnostic(`five-attribute clamp: ${result.before} -> ${result.after} CPU cycles`);
  if(symbols.has('cb_attr_batch')){
    const old=loop({}).cycles;
    assert(result.after<old*.75,`${old} -> ${result.after} cycles`);
    t.diagnostic(`tail-jump loop -> batched clamp: ${old} -> ${result.after} CPU cycles`);
  }
});

test('a fresh Goku rebuild applies Heavy Gi once after clamping, including minimum agility',()=>{
  for(let value=0;value<256;value++)for(const fresh of [0,1])for(const active of [0,1])
    for(const gi of [0,0x16])for(const alive of [0,1]){
      const result=compare({slot:0,values:[value,value,value,value,value],fresh,active,gi,alive});
      const clamped=Math.max(1,Math.min(99,value));
      const expected=fresh&&active&&gi===0x16&&alive?Math.max(1,Math.floor(clamped*4/5)):clamped;
      assert.equal(result.ram[0xE189],expected);
      assert.equal(result.adjustments,fresh?1:0);
      assert.equal(result.ram[0xD857],0);
    }
});

test('batched attributes retain narrow-index wrapping and decimal/flag contexts',()=>{
  for(let p=0;p<256;p++)if(p&0x20){
    for(const actor of p&16?[0,1,0xFB,0xFC,0xFD,0xFE,0xFF]:[0,1,0x1E00])
      for(const status of [0,8])for(const dp of [0,0x300,0x1234])
        compare({actor,p,status,dp,acc:(p<<8)|0x67});
  }
});
