import test from 'node:test';import assert from 'node:assert/strict';
import{radarPalaces,radarTarget,radarBearing}from'../engine/dragon-radar.js';
import{encodeText,wrapText}from'../engine/event-codec.js';
test('radar follows uncollected palaces even out of order, then directs Goku to the finale',()=>{
 const rom=new Uint8Array(0x70000);for(const {map}of radarPalaces){rom[0x67a80+map*2]=50;rom[0x67a81+map*2]=80;}
 for(const mask of[0,1,3,7,15,47,63]){
  const t=radarTarget(rom,{mask});assert.ok(!(mask&1<<t.id));assert.equal(t.x,800);assert.equal(t.y,1280);
  for(const guide of['AHEAD','TURN AROUND','LAND HERE','LEFT','RIGHT']){
   const text=`RADAR 6/7  ${guide}\nNext: ${t.name}\n${t.hint}`;encodeText(text);assert.equal(wrapText(text).split('\n').length,3);
  }
 }
 assert.equal(radarTarget(rom,{mask:127},{fortress:{x:5,y:7}}).name,'Mana Fortress');
 assert.equal(radarTarget(rom,{mask:127,wished:true}),null);
});
test('radar compass is relative to flight heading and wraps the world seam',()=>{
 const origin={x:4090,y:50},target={x:10,y:50};
 assert.equal(radarBearing(origin,768,target).guide,'LAND HERE');
 assert.equal(radarBearing({x:0,y:0},0,{x:200,y:0}).guide,'RIGHT');
 assert.equal(radarBearing({x:0,y:0},256,{x:200,y:0}).guide,'TURN AROUND');
 assert.equal(radarBearing({x:0,y:0},0,{x:0,y:3800}).guide,'AHEAD');
});
