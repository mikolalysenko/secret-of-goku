import test from 'node:test';
import assert from 'node:assert/strict';
import {partyText} from '../engine/native-story.js';
import {prepareStoryArea} from '../engine/story-areas.js';
import {worldAim,createWorldKi} from '../engine/world-ki.js';
import {beamTouchesBarrier,kiBarriers} from '../engine/native-barriers.js';
import {commandLength} from '../engine/event-codec.js';
import {parseEvent,encodeText,wrapText} from '../engine/event-codec.js';
import {storyDialogue} from '../engine/story-dialogue.js';
import {potosCommands,potosCommand} from '../engine/potos-story.js';
import {existsSync,readFileSync} from 'node:fs';

test('all Potos replacements target actual native text and the rescue edits preserve command boundaries',{
  skip:!existsSync('.local/rom/secret-of-mana-us.sfc')
},()=>{
  const rom=readFileSync('.local/rom/secret-of-mana-us.sfc'),ops=new Map();
  for(let id=0;id<0x800;id++)for(const op of parseEvent(rom,id).ops)ops.set(op.at,op);
  for(const [at,text]of Object.entries(storyDialogue)){
    assert.equal(ops.get(Number(at))?.op,'text',Number(at).toString(16));encodeText(text);
    assert.ok(wrapText(text).split('\n').every(line=>line.length<=28));
  }
  for(const [at,edit]of potosCommands)assert.deepEqual(potosCommand(ops.get(at)),edit.after);
  const potos=[...Array.from({length:21},(_,i)=>0x107+i),0x4e6,0x4e7].flatMap(id=>parseEvent(rom,id).ops).filter(op=>op.op==='text').map(op=>storyDialogue[op.at]??op.text).join('\n');
  assert.doesNotMatch(potos,/I took you in|I raised you|Your mother|too young|you yank out the sword/i);
  for(const phrase of['You killed RANDI!','You destroyed the','Oops. My bad.','you are a menace.','You saved Elliott.'])assert.ok(potos.includes(phrase),phrase);
});

test('native ASCII credits remain opaque despite letters matching event opcodes',()=>{
  const credits=[0x7d,...Buffer.from('WORLD\nSTAFF 1, 2'),0x7e,0x30,0x68,2];
  assert.equal(commandLength(credits,0),credits.length-3);
  assert.equal(commandLength(credits,credits.length-3),3);
});

test('incomplete party dialogue preserves NPC replies in mixed speaker pages',()=>{
  const page='{1}:Dyluck!\nTHANATOS:Too late!\n{0}:Let him go!\n{2}:Hey!';
  assert.equal(partyText(page,0).text,'\nTHANATOS:Too late!\n{0}:Let him go!');
  assert.equal(partyText(page,3).text,page);
  assert.equal(partyText(' and another thing...',0,true).text,'');
  assert.equal(partyText('LUKA:Find {1}.',0,true).text,'LUKA:Find Primm.');
  assert.ok(partyText(page,1).text.startsWith('{1}:'));
  assert.ok(partyText(page,2).text.endsWith('{2}:Hey!'));
});

test('early area prerequisites are local, monotone and leave Tree and final bosses untouched',()=>{
  const r=new Uint8Array(0x20000);r[0xcf24]=8;
  assert.deepEqual(prepareStoryArea(r,131),[]);
  prepareStoryArea(r,134);assert.equal(r[0xcf24],8);
  prepareStoryArea(r,432);assert.equal(r[0xcf41],2);assert.equal(r[0xcf44],1);
  assert.equal(r[0xcf46],0);assert.equal(r[0xcf4e],0);
  assert.deepEqual(prepareStoryArea(r,82),[],'castle exterior still requires an invitation or a blast');
  assert.deepEqual(prepareStoryArea(r,300),[],'witch gate is not opened just by entering');
  r[0xcf34]=3;assert.deepEqual(prepareStoryArea(r,377),[]);assert.equal(r[0xcf34],3,'the native jail encounter must not mark Metal Mantis defeated on entry');
});

test('aerial targeting uses native heading and wraps across world seams',()=>{
  for(const[heading,target]of[[0,{x:2,y:4090}],[256,{x:4090,y:2}],[512,{x:2,y:10}],[768,{x:10,y:2}]]){
    const a=worldAim({x:2,y:2},heading,target);assert.ok(Math.abs(a.along-8)<.001);assert.ok(Math.abs(a.across)<.001);
  }
  assert.ok(worldAim({x:100,y:100},0,{x:100,y:200}).along<0);
});

test('a full SSJ aerial beam can reach the distant Fortress; lesser charges retain the short range',()=>{
  const ram=new Uint8Array(0x20000),snes={ram,cart:{data:new Uint8Array(0x200000)},cpu:{cycle(){}},joypad1State:0};
  const word=(a,v)=>{ram[a]=v&255;ram[a+1]=v>>8;};
  word(0xfa,1000);word(0xfc,1000);word(0x128,1000);word(0x12a,300);ram[0xe3]=64;
  const mod={options:{enabled:true,superSaiyan:true},gokuActive:true,worldFlight:true,charge:44,charging:true,attackHeld:1,frame:100,
    beamProfile:strength=>({mega:strength===1}),playSound(){},log(){}};
  const world=createWorldKi(snes,mod);assert.equal(world.aim(),null);
  mod.charge=45;assert.equal(world.aim().id,'mana-fortress');world.tick(0);
  assert.equal(world.status.shot.mega,true);assert.equal(world.status.shot.strength,1);
  for(let i=0;i<12;i++)world.tick(0);
  assert.equal(world.status.fortressDestroyed,true);assert.equal(world.status.lastHit,'mana-fortress');
  assert.equal(world.status.explosion.mega,true);assert.equal(world.status.treeBarrierBroken,false);
});

test('scripted gates require a charged travelling wave aimed at their actual rectangle',()=>{
  for(const barrier of kiBarriers){
    const[x,y,w,h]=barrier.rect,beam={x:x+w/2,y:y+h+80,dx:0,dy:-1,width:19,strength:1,length:180};
    assert.equal(beamTouchesBarrier(beam,barrier),true);
    assert.equal(beamTouchesBarrier({...beam,dy:1},barrier),false);
    assert.equal(beamTouchesBarrier({...beam,strength:.25},barrier),false);
    assert.equal(beamTouchesBarrier({...beam,x:x-150},barrier),false);
    assert.equal(beamTouchesBarrier({...beam,length:2},barrier),false);
  }
});

test('small aerial ki blasts produce delayed distant booms without destroying landmarks or locking flight',()=>{
 const ram=new Uint8Array(0x20000),sounds=[],snes={ram,cart:{data:new Uint8Array(0x200000)},cpu:{cycle(){}},joypad1State:0x80};
 ram[0xe3]=64;ram[0xcf4e]=9;
 const mod={options:{enabled:true},gokuActive:true,worldFlight:true,charge:0,charging:false,frame:0,beamProfile:()=>({mega:false}),playSound:n=>sounds.push(n),log(){}};
 const world=createWorldKi(snes,mod);world.tick(1<<17);assert.equal(world.status.shot.ki,true);
 for(let i=0;i<11;i++)world.tick(0);assert.equal(world.status.distantBursts.length,1);assert.ok(world.status.distantBursts[0].age<0);
 const saved=world.snapshot();world.restore(saved);for(let i=0;i<20;i++)world.tick(0);
 assert.ok(sounds.includes('distantImpact'));assert.equal(world.status.fortressDestroyed,false);assert.equal(world.status.treeBarrierBroken,false);assert.equal(world.status.explosion,null);assert.equal(snes.joypad1State,0x80);
 for(let i=0;i<40;i++)world.tick(0);assert.equal(world.status.distantBursts.length,0);
});
