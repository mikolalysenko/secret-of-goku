import test from 'node:test';
import assert from 'node:assert/strict';
import {drawKiAura,friezaKiPalette} from '../engine/ki-aura.js';

const effects={
 'charge-orb':[Uint16Array.from([0,29397,31577,32733,32768])],
 'gold-arc':[Uint16Array.from([0,500,633,797,12288,32768])]
};
function draw(age,options={},x=128,y=112){
 const pixels=new Map();
 drawKiAura(effects,x,y,age,(px,py,c)=>{
  assert.ok(Number.isInteger(px)&&Number.isInteger(py));
  pixels.set(`${px},${py}`,c);
 },options);
 return pixels;
}
function bounds(pixels){
 const points=[...pixels.keys()].map(s=>s.split(',').map(Number));
 return{left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
}

test('ki flames animate their silhouette on a whole-pixel grid, with stable feet and native colors',()=>{
 for(const height of[16,32,40])for(const tone of['blue','gold','pink']){
  const palette=new Set(tone==='pink'?friezaKiPalette:effects[tone==='gold'?'gold-arc':'charge-orb'][0]),silhouettes=new Set(),feet=new Set();
  for(let age=0;age<36;age+=3){
   const pixels=draw(age,{height,tone,clock:0}),b=bounds(pixels);
   assert.ok(pixels.size>50);for(const c of pixels.values())assert.ok(palette.has(c));
   assert.ok(![...pixels.values()].includes(32768),'Sustained auras must not use a solid white core');
   silhouettes.add([...pixels.keys()].join(';'));feet.add(b.bottom);
   assert.ok(b.left>=128-height&&b.right<=128+height);
   assert.ok(b.top>=112-height*1.5&&b.bottom<=112+height/2+1);
   // No artificial body-shaped cutout. The caller puts the real opaque
   // fighter in front, leaving flame in gaps between arms, hair and feet.
   for(let y=-Math.floor(height/4);y<Math.floor(height/4);y++)assert.equal(pixels.has(`128,${112+y}`),true);
  }
  assert.equal(feet.size,1);assert.ok(silhouettes.size>=10,'Motion must change the flame shape, not only cycle colors');
 }
});

test('ghost-style flashing alternates a complete aura with the untouched scene',()=>{
 for(const height of[16,32,40])for(const tone of['blue','gold','pink']){
  for(let clock=0;clock<12;clock++){
   const pixels=draw(6,{height,tone,clock});
   if(clock&1)assert.equal(pixels.size,0);
   else assert.deepEqual(pixels,draw(6,{height,tone,clock:0}));
  }
 }
});

test('aura growth, translation and checkpoint replay remain deterministic without mutating effects',()=>{
 const before=structuredClone(effects);
 for(const height of[16,32,40]){
  let previous=0;
  for(let level=1;level<=8;level++){
   const pixels=draw(9,{height,power:level/8,clock:0}),b=bounds(pixels),span=b.bottom-b.top;
   assert.ok(span>=previous);previous=span;
  }
  const start=draw(14,{height}),shifted=draw(14,{height},143.2,102.1);
  assert.deepEqual([...shifted],[...start].map(([key,c])=>{const[x,y]=key.split(',').map(Number);return[`${x+15},${y-10}`,c];}));
  draw(30,{height,gold:false,power:.4});assert.deepEqual(draw(14,{height}),start);
 }
 assert.deepEqual(effects,before);assert.equal(draw(12,{power:0}).size,0);
 const pending={};let count=0;
 drawKiAura(pending,128,112,0,()=>count++);assert.equal(count,0);
 Object.assign(pending,effects);drawKiAura(pending,128,112,0,()=>count++);assert.ok(count>0);
});
