import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import {restore,hash} from '../engine/state.js';
import {bossVictoryCommands,bossVictoryCue,bossVictoryTiming} from '../engine/boss-victory.js';
import {victoryTiming} from '../engine/frieza-finale.js';

test('Frieza replays the actual unmodified Mantis Ant death sound sequence',t=>{
 const rom='.local/rom/secret-of-mana-us.sfc',fixture='.local/emulator-probe/map-260-state.json';
 if(!existsSync(rom)||!existsSync(fixture)){t.skip('Private ROM and native Mantis Ant checkpoint required');return;}
 const context={console,Uint8Array,Uint16Array,Int8Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math,clearArray:a=>a.fill(0),log:()=>{},getByteRep:x=>x.toString(16),getWordRep:x=>x.toString(16),getLongRep:x=>x.toString(16)};
 vm.createContext(context);
 for(const name of['cart','dsp','spc','apu','pipu','cpu','snes'])vm.runInContext(readFileSync(`vendor/snes/${name}.js`,'utf8'),context);
 const snes=new context.Snes();snes.loadRom(new Uint8Array(readFileSync(rom)),true);snes.reset(true);
 restore(snes,{...JSON.parse(readFileSync(fixture)),romHash:hash(snes.cart.data)});
 const cpu=snes.cpu,cycle=cpu.cycle,native=[];let frame=0;
 cpu.cycle=function(){
  if(this.cyclesLeft===0&&(this.r[1]&63)===3&&this.br[4]===4)native.push({frame,command:[...snes.ram.slice(0x1e00,0x1e04)]});
  return cycle.call(this);
 };
 snes.joypad1State=0;snes.ram[0xe7ec]=snes.ram[0xe7f0]=0;snes.ram[0xe7f1]=231;snes.ram[0xe7f2]=3;
 for(;frame<500&&!native.some(c=>c.command[0]===1);frame++){snes.runFrame(true);snes.apu.dsp.sampleOffset=0;}
 const death=native.filter(c=>c.command[0]!==1),planned=[];
 for(let age=0;age<=bossVictoryTiming.bursts.at(-1);age++){const cue=bossVictoryCue(age);if(cue)planned.push({age,command:bossVictoryCommands[cue]});}
 assert.deepEqual(planned.map(c=>c.command),death.map(c=>c.command));
 for(let i=0;i<planned.length;i++)assert.ok(Math.abs(planned[i].age-(death[i].frame-death[0].frame))<=4);
 assert.deepEqual(native.find(c=>c.command[0]===1)?.command,bossVictoryCommands.jingle);
});

test('the pouch chime finishes before the song upload and the complete fanfare precedes travel',()=>{
 assert.notDeepEqual(bossVictoryCommands.death,bossVictoryCommands.acquire);
 assert.ok(victoryTiming.acquire>victoryTiming.impact+bossVictoryTiming.clear);
 assert.ok(victoryTiming.jingle-victoryTiming.acquire>=120);
 assert.ok(victoryTiming.quiet-victoryTiming.jingle>=540);
 assert.ok(victoryTiming.descent>victoryTiming.quiet);
});
