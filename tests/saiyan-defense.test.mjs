import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeHitRecovery} from '../engine/native-hit-recovery.js';
import {createNativeFeedback} from '../engine/native-feedback.js';

function setup(){
 const ram=new Uint8Array(0x20000),cpu={cycle(){},cyclesLeft:0,r:[0,0],br:[0,0,0x600,0,0]},snes={ram,cpu,frames:0};
 const sounds=[],mod={options:{enabled:true,power:true,superSaiyan:true},gokuActive:true,nativeField:true,playSound:n=>sounds.push(n),facing:1};
 const word=a=>ram[a]|ram[a+1]<<8,write=(a,v)=>{ram[a]=v;ram[a+1]=v>>8;};
 for(const a of[0xe000,0xe02c,0xe600])ram[a]=1;
 write(0xe1a5,16);write(0xe1a8,6);write(0xe182,800);
 const recovery=createNativeHitRecovery(snes,mod);
 const call=pc=>{cpu.r[1]=0;cpu.br[4]=pc;cpu.cycle();return cpu.br[4];};
 return{ram,cpu,snes,mod,sounds,word,write,recovery,call};
}
test('Saiyan defense adds to real armor, changes with form, and never stacks or restores HP',()=>{
 const f=setup(),{mod,word,write,recovery,call}=f;
 for(let i=0;i<300;i++)recovery.tick();assert.equal(word(0xe1a5),336);assert.equal(word(0xe1a8),166);assert.equal(word(0xe182),800);
 mod.options.superSaiyan=false;recovery.tick();assert.equal(word(0xe1a5),176);assert.equal(word(0xe1a8),86);
 // The native equipment/level-up routine rebuilt both totals in this frame.
 write(0xe1a5,200);write(0xe1a8,120);call(0x4afe);recovery.tick();assert.equal(word(0xe1a5),360);assert.equal(word(0xe1a8),200);
 const saved=recovery.snapshot(),ram=f.ram.slice();mod.options.superSaiyan=true;recovery.tick();assert.equal(word(0xe1a5),520);
 f.ram.set(ram);recovery.restore(saved);mod.options.superSaiyan=false;recovery.tick();assert.equal(word(0xe1a5),360);
 mod.options.power=false;recovery.tick();assert.equal(word(0xe1a5),200);assert.equal(word(0xe1a8),120);assert.equal(word(0xe182),800);
});
test('SSJ deflects some ordinary contacts through native dodge, not spells, bosses or status attacks',()=>{
 const {recovery,call,snes,sounds}=setup();
 assert.equal(call(0x514b),0x4e6f);assert.equal(recovery.reaction.kind,'deflect');
 snes.frames=30;assert.equal(call(0x514b),0x4e6f);
 snes.frames=60;assert.equal(call(0x514b),0x514b,'the third contact gets through');
 assert.equal(recovery.deflected,2);assert.deepEqual(sounds,['deflect','deflect']);
 for(const inhibit of[f=>f.write(0xe799,0x2000),f=>f.ram[0xe780]=121,f=>f.mod.challenge={dangerous:true},f=>f.mod.poisoned=true,f=>f.ram[0xd0]=1]){
  const f=setup();inhibit(f);assert.equal(f.call(0x514b),0x514b);assert.equal(f.recovery.deflected,0);
 }
});
test('unblocked injuries still enter native damage, SSJ recovers quickly, and sleep/death retain ownership',()=>{
 const {recovery,call,cpu,snes,ram,write,word}=setup();
 write(0xe1f1,60);assert.equal(call(0x4053),0x4053);assert.equal(word(0xe1f1),60);
 assert.equal(recovery.reaction.kind,'resist');ram[0xe011]=0x8d;recovery.tick();
 snes.frames=8;ram[0xe012]=30;recovery.tick();call(0xf590);assert.equal(ram[0xe012],0);
 cpu.r[1]=1;cpu.br[4]=0x8355;cpu.cycle();assert.equal(ram[0xe11f],1);assert.equal(recovery.recovered,1);
 for(const [address,value]of[[0xe190,0x10],[0xe191,0x80]]){
  ram[address]=value;ram[0xe012]=30;recovery.tick();call(0xf590);assert.equal(ram[0xe012],30);ram[address]=0;
 }
});
test('reveal flash/shake decay, replay, respect native quake ownership and never shake Mode 7',()=>{
 const ram=new Uint8Array(0x20000),ppu={mode:1,getColor:()=>[0x4210,0,1]},snes={ram,ppu,write(a,v){ram[a&0x1ffff]=v;}};
 const feedback=createNativeFeedback(snes);feedback.burst();const bright=ppu.getColor(false,0,0)[0];assert.ok(bright>0x4210);assert.equal(ram[0x49],0xe0);
 feedback.tick();const saved=feedback.snapshot();feedback.tick();const after=ppu.getColor(false,0,0)[0];feedback.restore(saved);feedback.tick();assert.equal(ppu.getColor(false,0,0)[0],after);
 for(let i=0;i<10;i++)feedback.tick();assert.equal(ppu.getColor(false,0,0)[0],0x4210);assert.equal(ram[0x49],0);
 feedback.burst();snes.write(0x7e0049,3);for(let i=0;i<20;i++)feedback.tick();assert.equal(ram[0x49],3);
 ram[0x49]=0;ppu.mode=7;feedback.burst();assert.equal(ram[0x49],0);feedback.clear();assert.equal(ppu.getColor(false,0,0)[0],0x4210);
});
