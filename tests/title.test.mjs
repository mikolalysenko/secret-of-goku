import test from 'node:test';
import assert from 'node:assert/strict';
import {createTitleLayer,isNativeTitle,TITLE_CREDIT} from '../engine/title-layer.js';

function titlePPU(){
  const ppu={mode:3,tileAdr:[0x1000,0],tilemapAdr:[0xc00,0x800],mainScreenEnabled:[false,true],bigTiles:[false,false],vram:new Uint16Array(0x8000),renderLine(){},getPixelForLayer(){return 255;}};
  for(const [x,y,tile]of [[8,7,0],[9,7,1],[23,7,15],[8,9,32],[23,11,79],[12,12,20],[17,12,23]])ppu.vram[0x800+y*32+x]=0x2000|tile;
  for(let x=0;x<32;x++){const char='PROGRAMMED BY NASIR'[x-6]??' ';ppu.vram[0x800+17*32+x]=0x2000|(char===' '?0x60:char.charCodeAt(0)+32);}
  return ppu;
}

test('title guard rejects the file/name menus even though their VRAM retains the title',()=>{
  const ppu=titlePPU();assert.ok(isNativeTitle(ppu));
  ppu.mode=5;assert.equal(isNativeTitle(ppu),false);
  ppu.mode=3;ppu.tilemapAdr[1]=0x5800;assert.equal(isNativeTitle(ppu),false);
  ppu.tilemapAdr[1]=0x800;ppu.vram[0x800+7*32+8]=0x2060;assert.equal(isNativeTitle(ppu),false);
});

test('the centered credit reads all 31 glyphs from live native font tiles and preserves their palette indices',()=>{
  const ppu=titlePPU(),layer=createTitleLayer(ppu);
  // Give each native glyph a distinguishable color. This also catches accidental
  // fixed white text, missing low planes or a truncated last character.
  for(let letter=1;letter<=26;letter++){
    const color=1+letter%14,tile=0x60+letter;
    for(let y=0;y<8;y++){ppu.vram[tile*16+y]=(color&1?255:0)|(color&2?0xff00:0);ppu.vram[tile*16+y+8]=(color&4?255:0)|(color&8?0xff00:0);}
  }
  ppu.renderLine(0);assert.ok(layer.creditVisible);
  for(let x=0;x<256;x++){
    const char=TITLE_CREDIT[(x-4)>>3],expected=x<4||x>=252||char===' '?0:1+(char.charCodeAt(0)-64)%14;
    assert.equal(ppu.getPixelForLayer(x,139,1,1),expected,`credit pixel ${x}`);
  }
  assert.equal(ppu.getPixelForLayer(120,139,1,0),255,'native low-priority lookup stays untouched');
  assert.equal(ppu.getPixelForLayer(120,139,0,1),255,'other backgrounds stay untouched');
  ppu.vram[0x800+17*32+6]=0x2060;ppu.renderLine(0);
  assert.equal(layer.creditVisible,false);assert.equal(ppu.getPixelForLayer(120,139,1,1),255,'other attract credits are not overwritten');
});

test('title lettering is confined to the Mana word and does not mutate VRAM',()=>{
  const ppu=titlePPU(),before=ppu.vram.slice(),layer=createTitleLayer(ppu);ppu.renderLine(0);
  let gold=0;
  for(let y=56;y<104;y++)for(let x=143;x<192;x++){const color=ppu.getPixelForLayer(x,y,1,1);assert.ok(color===0||color>=8&&color<=14);if(color===8)gold++;}
  assert.ok(gold>200);assert.equal(ppu.getPixelForLayer(142,80,1,1),255);assert.equal(ppu.getPixelForLayer(192,80,1,1),255);
  assert.deepEqual(ppu.vram,before);layer.enabled=false;ppu.renderLine(0);assert.equal(ppu.getPixelForLayer(144,70,1,1),255);
});
