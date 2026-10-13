import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createNativeRadio,radioPixels,kaiWarnings,firstFlightMessages} from '../engine/native-radio.js';
import {createDragonQuest,dragonBallGrant} from '../engine/dragon-quest.js';
import {ceilingExits,ceilingExitFor} from '../engine/ceiling-exits.js';
import {encodeText,wrapText,parseEvent} from '../engine/event-codec.js';

function radioFixture(){
  const ram=new Uint8Array(0x20000),rom=new Uint8Array(0x200000),snes={ram,cart:{data:rom},ppu:{forcedBlank:false,getColor(){return[17,0,1];}}};
  const mod={options:{enabled:true,superSaiyan:true},gokuActive:true,canAttack:true,charging:true,frame:0,read16:()=>131};
  const radio=createNativeRadio(snes,mod),tick=(n=1)=>{for(let i=0;i<n;i++){mod.frame++;radio.tick();}};
  return{mod,snes,rom,radio,tick};
}
test('King Kai escalates without touching the charge or native input, and checkpoint timing replays',()=>{
  const{mod,snes,radio,tick}=radioFixture();mod.charge=45;snes.joypad1State=0x81;
  tick(89);assert.equal(radio.status.current,null);tick();assert.match(radio.status.current.text,/KING KAI/);
  assert.equal(mod.charge,45);assert.equal(snes.joypad1State,0x81);assert.equal(snes.ram[0xd0],0);
  const saved=radio.snapshot(),serialized=JSON.stringify(saved);tick(370);const next=radio.snapshot();assert.equal(next.warning,2);
  radio.restore(saved);tick(370);assert.deepEqual(radio.snapshot(),next);assert.equal(JSON.stringify(saved),serialized);
  radio.restore(saved);tick(370);assert.deepEqual(radio.snapshot(),next);
  mod.action={kind:'beam'};mod.charging=false;tick();assert.match(radio.status.current.text,/NOT A COUNTDOWN/);
});
test('native conversations hide and pause telepathy; base Goku does not trigger SSJ warnings',()=>{
  const{mod,snes,radio,tick}=radioFixture();tick(100);const before=radio.snapshot();
  mod.canAttack=false;snes.ram[0xd0]=0x82;tick(300);assert.equal(radio.status.visible,false);assert.deepEqual(radio.snapshot(),before);
  mod.canAttack=true;snes.ram[0xd0]=0;mod.options.superSaiyan=false;radio.restore();tick(1000);assert.equal(radio.status.warning,0);
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
  for(const text of [...kaiWarnings,...firstFlightMessages]){encodeText(text);assert.ok(wrapText(text).split('\n').length<=3,text);}
  assert.throws(()=>radioPixels(rom,'1\n2\n3\n4'));
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
