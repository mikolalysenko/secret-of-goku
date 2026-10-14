import test from 'node:test';
import assert from 'node:assert/strict';
import {newFriezaArena,fractureFortress,tickFriezaArena,ruinMask} from '../engine/frieza-arena.js';

test('Fortress fractures affect only verified floor cells and survive replay without map writes',()=>{
 const a=newFriezaArena(),safe=(x,y)=>x>=64&&x<160&&y>=48&&y<176;
 fractureFortress(a,67,100,40,safe);const saved=structuredClone(a),mask=ruinMask(a,0,0);
 assert.ok(mask.some(Boolean));
 for(let y=0;y<224;y++)for(let x=0;x<256;x++)if(mask[y*256+x])assert.ok(safe(x,y),`unsafe scar ${x},${y}`);
 assert.deepEqual(ruinMask(structuredClone(saved),0,0),mask);
 for(let i=0;i<70;i++)tickFriezaArena(a);
 assert.equal(a.bursts.length,0);assert.deepEqual(a.scars,saved.scars,'rubble clears while the damaged floor remains');
 assert.deepEqual(ruinMask(a,0,0),mask,'animation cannot damage source map or grow the footprint');
});

test('many impacts stay bounded, and camera-relative cracks follow world position',()=>{
 const a=newFriezaArena();for(let i=0;i<60;i++)fractureFortress(a,160+i%8,120,25,()=>true);
 assert.equal(a.scars.length,20);assert.equal(a.bursts.length,12);
 const first=ruinMask(a,0,0),moved=ruinMask(a,20,10);
 for(let y=0;y<214;y++)for(let x=0;x<236;x++)assert.equal(moved[y*256+x],first[(y+10)*256+x+20]);
});
