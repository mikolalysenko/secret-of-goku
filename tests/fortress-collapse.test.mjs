import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldKi,fortressDeflectionMessages} from '../engine/world-ki.js';
import {createFortressCollapse} from '../engine/fortress-collapse.js';
import {encodeText,wrapText} from '../engine/event-codec.js';

test('all normal-form and partial SSJ beams rebound without advancing the destruction route',()=>{
  for(const [superSaiyan,charge]of[[false,90],[false,45],[true,44],[true,12],[true,45]]){
    const ram=new Uint8Array(0x20000),sounds=[],messages=[],scars=[];
    const snes={ram,cpu:{cycle(){}},cart:{data:new Uint8Array(0x200000)},joypad1State:0};
    const w=(a,n)=>{ram[a]=n;ram[a+1]=n>>8;};
    w(0xfa,1000);w(0xfc,1000);w(0x128,1000);w(0x12a,700);ram[0xe3]=64;
    const m={options:{enabled:true,superSaiyan},gokuActive:true,worldFlight:true,charge,charging:true,attackHeld:1,frame:0,
      beamProfile:strength=>({mega:superSaiyan&&strength===1}),playSound:n=>sounds.push(n),log(){},
      radio:{interrupt:text=>messages.push(text)},worldScars:{targets:()=>[],strike:target=>scars.push(target),snapshot:()=>scars,restore(){}}};
    const ki=createWorldKi(snes,m),tick=n=>{for(let i=0;i<n;i++){m.frame++;ki.tick(0);}};
    tick(15);
    if(superSaiyan&&charge===45){assert.equal(ki.status.fortressDestroyed,true);assert.equal(scars.length,1);continue;}
    assert.ok(ki.status.shot.deflected);assert.equal(ki.status.fortressDestroyed,false);
    assert.equal(ki.status.lastHit,null);assert.equal(ki.status.explosion,null);assert.equal(scars.length,0);
    assert.deepEqual(messages,[fortressDeflectionMessages]);assert.ok(sounds.includes('deflect'));
    const saved=ki.snapshot();tick(18);const after=ki.snapshot();ki.restore(saved);tick(18);assert.deepEqual(ki.snapshot(),after);
    tick(30);m.charging=true;m.charge=charge;tick(15);
    assert.equal(messages.length,1,'Rapid retries must not repeat the warning/reply');
    tick(200);assert.equal(ki.status.landingQueued,false);assert.equal(ki.status.finaleQueued,false);assert.equal(ki.cinematic,null);
  }
  for(const text of fortressDeflectionMessages){encodeText(text);assert.ok(wrapText(text).split('\n').length<=3);}
});

test('collapse damages only the deck presentation, preserves native menus and replays exactly',()=>{
  const ram=new Uint8Array(0x20000),cpu={r:new Uint8Array(2),br:new Uint16Array(5),cyclesLeft:0,cycle(){}},sounds=[];
  let layer=0;
  const ppu={mode:1,bgHoff:[0,0,0,0],bgVoff:[0,0,0,0],getColor:()=>[0x4631,layer,1]},snes={ram,cpu,ppu};
  const m={frame:0,options:{enabled:true},gokuActive:true,nativeField:true,worldFlight:false,nativeFlight:false,
    status:{x:128,y:160,cameraX:0,cameraY:0},localFlightHook:{canLand:(x,y)=>x>=16&&x<240&&y>=24&&y<208},playSound:n=>sounds.push(n)};
  const collapse=createFortressCollapse(snes,m,()=>true),tick=n=>{for(let i=0;i<n;i++){m.frame++;collapse.tick();}};
  ram[0xdc]=255;ram[0xe000]=1;const original=ram.slice();tick(40);
  assert.ok(collapse.status.scars>=4);assert.ok(collapse.status.bursts>0);assert.ok(sounds.includes('fortressBreak'));assert.deepEqual(ram,original);
  assert.notEqual(ppu.getColor(false,80,100)[0],0x4631);
  for(layer of[2,4,5])assert.equal(ppu.getColor(false,80,100)[0],0x4631,'Text, characters, HUD and backdrop keep their colors');
  layer=0;assert.equal(ppu.getColor(true,80,100)[0],0x4631);ppu.mode=7;assert.equal(ppu.getColor(false,80,100)[0],0x4631);ppu.mode=1;
  const saved=collapse.snapshot();tick(50);const expected=collapse.snapshot(),color=ppu.getColor(false,80,100);
  collapse.restore(saved);tick(50);assert.deepEqual(collapse.snapshot(),expected);assert.deepEqual(ppu.getColor(false,80,100),color);
  assert.equal(saved.age,40,'Snapshots must not be mutated by later blasts');
  // Actual native JSL entry: only a music request on the damaged deck changes.
  cpu.r[1]=0xc3;cpu.br[4]=4;ram.set([1,0x26,0x15,0x8f],0x1e00);cpu.cycle();
  assert.deepEqual([...ram.slice(0x1e00,0x1e04)],[1,0x1b,0x13,0x8f]);assert.equal(collapse.status.music,0x1b);
  ram.set([2,0x20,0x12,0x88],0x1e00);cpu.cycle();assert.equal(ram[0x1e01],0x20,'Preserve native sound effects');
  ram[0xdc]=253;tick(1);assert.equal(collapse.status.active,false);assert.equal(ppu.getColor(false,80,100)[0],0x4631);
  ram.set([1,0x39,0x14,0xff],0x1e00);cpu.cycle();assert.equal(ram[0x1e01],0x39,'Preserve the following boss music');
});
