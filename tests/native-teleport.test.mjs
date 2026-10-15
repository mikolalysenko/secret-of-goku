import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeTeleport} from '../engine/native-teleport.js';

test('fractional custom enemies and older checkpoints cannot leave a subpixel camera lock',()=>{
 const ram=new Uint8Array(0x20000),cpu={cyclesLeft:0,r:[0,0],br:[0,0,0,0,0],cycle(){}},snes={ram,cpu,frames:0};
 const write16=(a,v)=>{ram[a]=v;ram[a+1]=v>>8;},word=a=>ram[a]|ram[a+1]<<8;
 const mod={options:{enabled:true},write16},collision={canLand:()=>true,tileAt:()=>({behavior:0,flags:2})};
 write16(0xc0,1024);write16(0xc2,1024);
 const hook=createNativeTeleport(snes,mod,collision),landing=hook.findLanding({x:400.2,y:450.7,terrain:2},{x:200,y:300});
 assert.ok(Number.isInteger(landing.x)&&Number.isInteger(landing.y));hook.follow(landing);
 const saved=hook.snapshot();assert.ok(Number.isInteger(saved.x)&&Number.isInteger(saved.y));
 hook.restore({...saved,x:saved.x+.2,y:saved.y+.2});
 for(let i=0;i<60&&hook.pending;i++){
  snes.frames++;cpu.br[4]=0xd651;cpu.cycle();
  if(cpu.br[4]===0xd6ac){const signed=v=>v&128?-(v&127):v;write16(0xa8,word(0xa8)+signed(ram[0x84]));write16(0xaa,word(0xaa)+signed(ram[0x86]));}
 }
 assert.equal(hook.pending,false);assert.equal(word(0xa8),saved.x);assert.equal(word(0xaa),saved.y);
});

test('IT can hover beside Frieza over destroyed deck while ordinary targets and outer walls remain blocked',()=>{
 const ram=new Uint8Array(0x20000),cpu={cycle(){}},snes={ram,cpu};
 const collision={canLand:()=>false,canFly:(x,y)=>x>100&&x<300&&y>100&&y<300,tileAt:()=>({behavior:0,flags:2})};
 const hook=createNativeTeleport(snes,{write16(){}},collision),target={x:200,y:200,terrain:2,custom:'frieza'};
 assert.equal(hook.findLanding(target,{x:100,y:200}).air,true);
 assert.equal(hook.findLanding({...target,custom:null},{x:100,y:200}),null);
 assert.equal(hook.findLanding({...target,x:400},{x:100,y:200}),null);
 collision.tileAt=()=>({behavior:0x10,flags:2});assert.equal(hook.findLanding(target,{x:100,y:200}),null,'Scripted seams remain forbidden');
});
