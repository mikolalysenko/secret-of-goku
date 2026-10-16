import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {trainingBeamPalettes} from '../engine/vegeta-clash.js';
const context={window:{},Uint8Array,Uint16Array,Set,Math};
vm.runInNewContext(readFileSync(new URL('../engine/sprite-layer.js',import.meta.url),'utf8'),context);

test('a full Final Flash spans the viewport with yellow body, edge sparks and hand energy',()=>{
 const layer=new context.window.ManaSpriteLayer({ppu:{}},{}),stamps=[];layer.stamp=(...args)=>stamps.push(args);
 layer.giantBeam(8,112,1,0,640,80,0,{palette:trainingBeamPalettes.gold,gold:true});
 const pixels=Array.from(layer.surface).filter(Boolean);
 assert.ok(pixels.length>30000,'The solid wave covers most of the viewport');
 assert.deepEqual(new Set(pixels),new Set(trainingBeamPalettes.gold));
 assert.equal(layer.surface[112*256+255],0x8000,'The white-hot core reaches the far screen edge');
 assert.ok(stamps.some(([group])=>group==='gold-spark'));
 assert.ok(stamps.some(([group])=>group==='gold-arc'));
 assert.ok(stamps.some(([group])=>group==='gold-charge-orb'));
 assert.ok(stamps.every(([group])=>group.startsWith('gold-')),'No blue or purple accents leak into the yellow wave');
});
