import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(){
  const Ppu=runInNewContext(readFileSync(new URL('../vendor/snes/pipu.js',import.meta.url),'utf8')+';Ppu;',{clearArray:a=>a.fill(0)});
  const p=new Ppu({});p.reset();p.mode=7;p.mode7LargeField=true;p.mode7Char0fill=true;
  // Character zero has its own pixels. Tilemap entry zero points elsewhere,
  // as happens when the Mana Beast streams its next animation into VRAM.
  for(let i=0;i<64;i++){p.vram[i]=(32+i)<<8|5;p.vram[5*64+i]=199<<8;}
  const sample=(x,y,layer=0,priority=0)=>{p.lastTileFetchedX[0]=-1;p.lastTileFetchedY[0]=-1;p.mode7Xcoords[0]=x*256;p.mode7Ycoords[0]=y*256;return p.getMode7Pixel(0,0,layer,priority);};
  return{p,sample};
}
test('Mode 7 outside fill samples character zero directly, never the first tilemap entry',()=>{
  const{sample}=fixture();
  for(const[x,y]of[[-1,0],[0,-3],[1024,7],[7,1024],[-14,2053],[2071,-4]])assert.equal(sample(x,y),32+(y&7)*8+(x&7));
  assert.equal(sample(0,0),199,'Inside the map, its first tilemap entry still selects character five');
});
test('Mode 7 transparent overflow, wrapping, flipped coordinates and EXTBG priority remain native',()=>{
  const{p,sample}=fixture();
  p.mode7Char0fill=false;assert.equal(sample(1024,0),0);
  p.mode7LargeField=false;assert.equal(sample(1024,0),199);
  p.mode7LargeField=true;p.mode7Char0fill=true;p.vram[0]=0x8d05;
  assert.equal(sample(1024,0,1,1),13);assert.equal(sample(1024,0,1,0),0);
  p.mode7FlipX=true;p.mode7Xcoords[255]=-256;p.mode7Ycoords[255]=0;
  assert.equal(sample(8,8),39,'Horizontal flip still chooses the right transformed coordinate');
});
