import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createNativeRadio,radioPixels,kaiWarnings,firstFlightMessages,treeBlastMessages,barrierReactions} from '../engine/native-radio.js';
import {createDragonQuest,dragonBallGrant} from '../engine/dragon-quest.js';
import {ceilingExits,ceilingExitFor} from '../engine/ceiling-exits.js';
import {encodeText,wrapText,parseEvent} from '../engine/event-codec.js';

function radioFixture(){
  const ram=new Uint8Array(0x20000),rom=new Uint8Array(0x200000),snes={ram,cart:{data:rom},ppu:{forcedBlank:false,getColor(){return[17,0,1];}}};
  const mod={options:{enabled:true,superSaiyan:true},gokuActive:true,canAttack:true,charging:true,charge:45,frame:0,read16:()=>131};
  const radio=createNativeRadio(snes,mod),tick=(n=1)=>{for(let i=0;i<n;i++){mod.frame++;radio.tick();}};
  return{mod,snes,rom,radio,tick};
}
test('King Kai speaks once after full charge is held, stays quiet on release, and checkpoints preserve that limit',()=>{
  const{mod,snes,radio,tick}=radioFixture();mod.charge=44;snes.joypad1State=0x81;
  tick(400);assert.equal(radio.status.warning,0);mod.charge=45;
  tick(89);assert.equal(radio.status.current,null);tick();assert.match(radio.status.current.text,/KING KAI/);
  assert.equal(mod.charge,45);assert.equal(snes.joypad1State,0x81);assert.equal(snes.ram[0xd0],0);
  const saved=radio.snapshot(),serialized=JSON.stringify(saved);tick(900);const next=radio.snapshot();assert.equal(next.warning,1);assert.equal(next.current,null);
  radio.restore(saved);tick(900);assert.deepEqual(radio.snapshot(),next);assert.equal(JSON.stringify(saved),serialized);
  radio.restore(saved);tick(900);assert.deepEqual(radio.snapshot(),next);
  radio.restore(saved);mod.action={kind:'beam'};mod.charging=false;tick();
  assert.equal(radio.status.current.text,saved.current.text,'release does not replace the aside with another complaint');
  tick(300);assert.equal(radio.status.current,null);assert.equal(radio.status.warning,1);
  mod.charging=true;mod.action={kind:'charge'};tick(89);assert.equal(radio.status.warning,1);tick();assert.equal(radio.status.warning,2);
});
test('native conversations hide and pause telepathy; base Goku does not trigger SSJ warnings',()=>{
  const{mod,snes,radio,tick}=radioFixture();tick(100);const before=radio.snapshot();
  mod.canAttack=false;snes.ram[0xd0]=0x82;tick(300);assert.equal(radio.status.visible,false);assert.deepEqual(radio.snapshot(),before);
  mod.canAttack=true;snes.ram[0xd0]=0;mod.options.superSaiyan=false;radio.restore();tick(1000);assert.equal(radio.status.warning,0);
});
test('first-use power banter cannot add a second King Kai remark to a held charge',()=>{
  const{mod,radio,tick}=radioFixture();mod.charging=false;
  radio.say('KING KAI:New hair?',{kind:'power-intro'});tick();const before=radio.status.current.remaining;
  mod.charging=true;tick(800);assert.equal(radio.status.warning,1);assert.equal(radio.status.current,null);assert.equal(radio.status.queued,1);
  mod.charging=false;mod.action={kind:'beam'};tick(70);assert.equal(radio.status.current,null);
  mod.action=null;tick();assert.equal(radio.status.current.remaining,before);assert.equal(radio.status.current.kind,'power-intro');
});
test('ordinary scenery, switches, orbs and flight never queue barrier chatter or consume its cooldown',()=>{
  const{mod,radio,tick}=radioFixture();mod.charging=false;
  for(const map of[28,131,139,291,420])for(const[id,kind]of[['scenery','vines'],['nearby-rock','obstacle'],['flight-gap','flight'],['orb-570','orb'],['tile-0-15-53-1777','switch'],['haunted-forest','switch']]){
    assert.equal(radio.defeatedBarrier(id,{map,kind}),false);tick(500);
    assert.equal(radio.status.current,null);assert.equal(radio.status.queued,0);
  }
  assert.equal(radio.status.barrierCount,0);assert.deepEqual(radio.snapshot().barriers,[]);
  assert.equal(radio.defeatedBarrier('gold-tower'),true);
});
test('shortcut reactions wait for native scenes and attacks, coalesce breaches, and remember them in saves',()=>{
  const{mod,snes,radio,tick}=radioFixture();mod.charging=false;snes.joypad1State=0x80;
  assert.equal(radio.defeatedBarrier('gold-tower'),true);
  assert.equal(radio.defeatedBarrier('gold-tower'),false);
  assert.equal(radio.defeatedBarrier('palace-combination'),false);
  mod.canAttack=false;snes.ram[0xd0]=0x83;tick(500);assert.equal(radio.status.current,null);assert.equal(radio.status.queued,1);
  mod.canAttack=true;snes.ram[0xd0]=0;mod.action={kind:'beam'};tick(30);assert.equal(radio.status.current,null);
  mod.action=null;tick();assert.equal(radio.status.current.text,barrierReactions['gold-tower'][0]);assert.equal(radio.status.visible,true);
  const saved=radio.snapshot();mod.charging=true;tick(800);
  assert.equal(radio.status.warning,1);assert.equal(radio.status.current,null);assert.equal(radio.status.queued,1);
  mod.charging=false;tick(500);const after=radio.snapshot();assert.equal(radio.status.barrierCount,1);
  radio.restore(saved);mod.charging=true;tick(800);mod.charging=false;tick(500);assert.deepEqual(radio.snapshot(),after);
  assert.equal(radio.defeatedBarrier('gold-tower'),false);assert.equal(radio.defeatedBarrier('palace-combination'),false);
  assert.equal(radio.defeatedBarrier('northtown-ruins-seal'),true);tick();assert.match(radio.status.current.text,/dark seal/);
  assert.equal(snes.joypad1State,0x80);assert.equal(snes.ram[0xd0],0);
});
test('old checkpoints discard generic barrier chatter but keep rewards and allow a new shortcut remark',()=>{
  const{mod,radio,tick}=radioFixture();mod.charging=false;
  radio.restore({current:{kind:'barrier',text:'Old rock joke',remaining:100},queue:[{kind:'barrier',text:'Old gap joke',remaining:100},{kind:'reward',text:'Found a Dragon Ball!',remaining:100}],barrierCooldown:480,barriers:['131:scenery']});
  assert.equal(radio.status.current,null);assert.equal(radio.status.queued,1);
  tick();assert.equal(radio.status.current.text,'Found a Dragon Ball!');assert.equal(radio.defeatedBarrier('gold-tower'),true);
  tick(100);assert.equal(radio.status.current.text,barrierReactions['gold-tower'][0]);
});
test('a shortcut remark does not follow Goku into another room',()=>{
  const{mod,radio,tick}=radioFixture();mod.charging=false;
  radio.defeatedBarrier('gold-tower');tick();assert.equal(radio.status.current.kind,'barrier');
  mod.read16=()=>82;tick();assert.equal(radio.status.current,null);
  tick(500);mod.action={kind:'beam'};radio.defeatedBarrier('northtown-castle');tick();assert.equal(radio.status.queued,1);
  mod.read16=()=>131;mod.action=null;tick();assert.equal(radio.status.current,null);assert.equal(radio.status.queued,0);
});
test('a demolition quip happens at most once per dungeon, including after a save and a room change',()=>{
 const{mod,radio,tick}=radioFixture();mod.charging=false;mod.read16=()=>312;
 assert.equal(radio.defeatedBarrier('dungeon-wall-earth',{map:312,onceKey:'dungeon:earth'}),true);tick(600);
 const saved=radio.snapshot();radio.restore(saved);mod.read16=()=>313;
 assert.equal(radio.defeatedBarrier('dungeon-wall-earth',{map:313,onceKey:'dungeon:earth'}),false);assert.equal(radio.status.queued,0);
 assert.equal(radio.defeatedBarrier('dungeon-wall-fire',{map:327,onceKey:'dungeon:fire'}),true);
});
test('first-flight advice happens once and obsolete Fortress advice is discarded after destruction',()=>{
  const{mod,snes,radio,tick}=radioFixture();mod.worldFlight=true;snes.ram[0x2c]=128;mod.charging=false;tick();assert.equal(radio.status.firstFlight,true);assert.equal(radio.status.queued,3);
  assert.equal(snes.ppu.getColor(false,16,160)[0],0x2c00);assert.equal(snes.ppu.getColor(false,16,16)[0],17,'The aerial beam and sky stay visible');
  mod.worldKi={status:{fortressDestroyed:true}};tick();assert.equal(radio.status.queued,0);assert.equal(radio.status.current,null);
  radio.restore(radio.snapshot());tick(1000);assert.equal(radio.status.queued,0);
});
test('radio uses the ROM font pixels and every authored page fits the original three-line frame',()=>{
  const{rom}=radioFixture();const code=encodeText('A')[0];rom[0x12d600+code*12]=0x40;
  const pixels=radioPixels(rom,'A');assert.equal(pixels[10*240+9],0x8000);assert.equal(pixels[9*240+9],1);
  for(const text of [...kaiWarnings,...firstFlightMessages,...treeBlastMessages,...Object.values(barrierReactions).flat()]){encodeText(text);assert.ok(wrapText(text).split('\n').length<=3,text);}
  assert.throws(()=>radioPixels(rom,'1\n2\n3\n4'));
});
test('the Tree catastrophe interrupts stale flight advice, keeps rewards, and survives a checkpoint',()=>{
 const{mod,radio,tick}=radioFixture();mod.charging=false;mod.worldFlight=true;
 tick();radio.say('Found a Dragon Ball!',{kind:'reward'});radio.defeatedBarrier('gold-tower');
 radio.interrupt(treeBlastMessages,{kind:'tree-blast',frames:40});tick();
 assert.equal(radio.status.current.text,treeBlastMessages[0]);assert.equal(radio.status.queued,3);
 const saved=radio.snapshot();tick(120);const after=radio.snapshot();
 assert.equal(radio.status.current.text,'Found a Dragon Ball!');radio.restore(saved);tick(120);assert.deepEqual(radio.snapshot(),after);
});
test('Dragon Balls collect once, survive broken seed seals, and the emergency wish repairs roofs',()=>{
  const notices=[],mod={read8:()=>0,radio:{say:s=>notices.push(s)},ceiling:{repair(){this.repaired=true;}}};
  const quest=createDragonQuest(mod);quest.restore();quest.wish();assert.equal(quest.status.wished,false);
  assert.equal(quest.collect(2),true);assert.equal(quest.collect(2),false);assert.equal(notices.length,1);
  const saved=quest.snapshot();quest.collect(3);quest.restore(saved);assert.equal(quest.status.count,1);
  assert.equal(quest.deliver(),6);assert.equal(quest.status.count,7);quest.wish();assert.equal(quest.status.wished,true);assert.equal(mod.ceiling.repaired,true);
  assert.equal(dragonBallGrant(0xa8562,0x30),null,'Tree mass blessing is not collection');
  assert.equal(dragonBallGrant(0xa7360,0x30),null,'Dryad is not an eighth ball');
});
test('all ceiling exits and Dragon Ball reward markers match the supplied native ROM', {skip:!existsSync('.local/rom/secret-of-mana-us.sfc')},()=>{
  const rom=readFileSync('.local/rom/secret-of-mana-us.sfc'),rooms=new Set();
  for(const exit of ceilingExits){const at=0x83000+exit.door*4;assert.equal(rom[at]|(rom[at+1]&1)<<8,exit.map);const h=0x80000+(rom[0x87000+exit.map*2]|rom[0x87001+exit.map*2]<<8);assert.ok(rom[h+4]&0x80,exit.name);for(const room of exit.rooms){assert.ok(!rooms.has(room));rooms.add(room);}}
  for(const unsafe of [0,131,260,246,253,511])assert.equal(ceilingExitFor(unsafe),null);
  const found=new Set();for(let id=0;id<0x800;id++)for(const op of parseEvent(rom,id).ops){const ball=dragonBallGrant(op.at,op.op);if(ball!==null){assert.deepEqual(op.bytes,[0x30,0x90+ball,1]);found.add(ball);}}
  assert.equal(found.size,7);assert.ok(rooms.size>150);
});
