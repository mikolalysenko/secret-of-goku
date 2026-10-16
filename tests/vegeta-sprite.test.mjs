import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {decodeVegetaSheet,drawVegetaSprite,vegetaCell} from '../engine/vegeta-sprite.js';
import {superSaiyanHairColors} from '../engine/saiyan-palette.js';

const image=PNG.sync.read(readFileSync(new URL('../assets/sprites/vegeta.png',import.meta.url)));
const hair=PNG.sync.read(readFileSync(new URL('../assets/sprites/vegeta-ssj-hair.png',import.meta.url)));
const cells=decodeVegetaSheet(image.data,image.width,image.height,hair),{width:w,height:h}=vegetaCell;

test('every Vegeta pose fits its cell and the transformation preserves all body pixels',()=>{
 assert.equal(cells.length,32);
 for(let n=0;n<cells.length;n++){
  const c=cells[n],opaque=[...c].filter(Boolean),ys=[];
  assert.equal(c.length,w*h);assert.ok(opaque.length>250,`Frame ${n} is a complete fighter`);
  assert.ok(new Set(opaque).size<=15,`Frame ${n} fits an SNES OBJ palette`);
  for(let y=0;y<h;y++){assert.equal(c[y*w],0);assert.equal(c[y*w+w-1],0);if(c.subarray(y*w,(y+1)*w).some(Boolean))ys.push(y);}
  assert.ok(ys.at(-1)>=37&&ys.at(-1)<=39,`Frame ${n} keeps the same foot baseline`);
  if(n%16<8){
   const gold=cells[n+8];assert.deepEqual(gold.map(Boolean),c.map(Boolean),'A form change cannot move, grow or crop the body');
   assert.ok(c.some((v,i)=>v!==gold[i]),'The hair actually turns gold');
   for(let i=0;i<c.length;i++)if(c[i]!==gold[i])assert.ok(superSaiyanHairColors.includes(gold[i]),'Every changed hair pixel uses Goku\'s shared gold ramp');
   assert.deepEqual(gold.subarray(27*w),c.subarray(27*w),'Boots, legs and lower armor do not turn gold');
  }
 }
});

test('left and right poses mirror around the same integer body anchor',()=>{
 for(let n=0;n<32;n++){
  const right=[],left=[];
  drawVegetaSprite(cells,n,100.3,100.2,(x,y,c)=>right.push([x,y,c]));
  drawVegetaSprite(cells,n,100.3,100.2,(x,y,c)=>left.push([x,y,c]),{flip:true});
  assert.equal(right.length,left.length);
  for(let i=0;i<right.length;i++){assert.equal(right[i][0]+left[i][0],200);assert.equal(right[i][1],left[i][1]);assert.equal(right[i][2],left[i][2]);}
 }
});

test('Goku uses the same gold ramp without moving pixels or changing eyes, skin highlights or base-form frames',()=>{
 const matte=new Set(['42,150,108','52,188,136','35,127,90','71,255,187']);
 const face=new Set(['33,99,66','33,140,90','247,198,115']);
 for(const name of['goku','ssj']){
  const source=PNG.sync.read(readFileSync(new URL(`../assets/source/${name}.png`,import.meta.url))),prepared=PNG.sync.read(readFileSync(new URL(`../assets/sprites/${name}.png`,import.meta.url)));let changed=0;
  assert.equal(source.width,prepared.width);assert.equal(source.height,prepared.height);
  for(let at=0;at<source.data.length;at+=4){
   const old=source.data.subarray(at,at+3),rgb=[...old].join(','),now=prepared.data.subarray(at,at+3),pixel=at/4,y=Math.floor(pixel/source.width),column=Math.floor(pixel%source.width/32);
   assert.equal(prepared.data[at+3],matte.has(rgb)?0:source.data[at+3],'Silhouettes and every pose keep their original alpha');
   if(face.has(rgb)||name==='goku'&&column<56)assert.deepEqual(now,old,'The original face and base form survive');
   if(now.some((v,i)=>v!==old[i])){
    changed++;assert.ok(y>=32&&y<160);assert.ok(source.data[at+3]);
    assert.ok(superSaiyanHairColors.includes(1+(now[0]>>3)+((now[1]>>3)<<5)+((now[2]>>3)<<10)));
   }
  }
  assert.ok(changed>(name==='ssj'?20000:300),'The full animation sheet receives the same treatment');
 }
});
