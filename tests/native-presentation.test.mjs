import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {drawKiAura} from '../engine/ki-aura.js';
const context={window:{},Uint8Array,Uint16Array,Set,Math};
vm.runInNewContext(await readFile(new URL('../engine/rom-patches.js',import.meta.url),'utf8'),context);
vm.runInNewContext(await readFile(new URL('../engine/goku-animation-data.js',import.meta.url),'utf8'),context);
vm.runInNewContext(await readFile(new URL('../engine/goku-animation.js',import.meta.url),'utf8'),context);
vm.runInNewContext(await readFile(new URL('../engine/sprite-layer.js',import.meta.url),'utf8'),context);
const atlases={};
for(const name of ['goku','ssj']){
  const png=PNG.sync.read(await readFile(new URL(`../assets/sprites/${name}.png`,import.meta.url))),pixels=new Uint16Array(png.width*png.height);
  for(let i=0;i<pixels.length;i++)if(png.data[i*4+3])pixels[i]=1+((png.data[i*4]>>3)|((png.data[i*4+1]>>3)<<5)|((png.data[i*4+2]>>3)<<10));
  atlases[name]={pixels,width:png.width,height:png.height};
}
function scene(direction=1){
  const ram=new Uint8Array(0x20000);ram[0xe4]=ram[0xe5]=ram[0xe000]=1;ram[0xe011]=1;ram[0xe010]=direction;ram[0xe020]=100;ram[0xe022]=100;
  const ppu={oam:new Uint16Array(256),highOam:new Uint16Array(16),objSize:3,spriteSizes:[1,1,1,2,2,4,2,2,2,4,8,4,8,8,4,4],spriteLineBuffer:new Uint8Array(256),spritePrioBuffer:new Uint8Array(256),evaluateSprites(){},getColor(){return this.selectedLayer===4?[0,4,0x91]:[1234,1,3];}};
  ppu.oam.fill(0xf000);ppu.oam[14]=92|(68<<8);ppu.oam[15]=0x23c0;ppu.oam[16]=92|(84<<8);ppu.oam[17]=0x23c2;
  const mod={options:{enabled:true},read8:a=>ram[a],read16:a=>ram[a]|ram[a+1]<<8,worldFlight:false,frame:10,moving:true,canAttack:true,effects:[],status:{cameraX:0,cameraY:0}};
  const layer=new context.window.ManaSpriteLayer({ppu},mod);layer.drawKiAura=drawKiAura;layer.atlas=atlases;layer.prepare();return{layer,mod,ppu,ram};
}

test('all four Goku directions use the correct source rows and retain every opaque pixel, including boots',()=>{
  for(const [direction,row]of [[1,0],[0x82,1],[2,2],[0,3]])for(const superSaiyan of [false,true]){
    const {layer,mod}=scene(direction);mod.options.superSaiyan=superSaiyan;mod.canAttack=false;layer.prepare();
    const frame=layer.plan.sprite;assert.equal(frame.row,row);assert.equal(frame.height,32);
    const atlas=atlases[superSaiyan?'ssj':'goku'];let sourceCount=0,destCount=0,lastRow=0;
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const pixel=atlas.pixels[(32+row*32+y)*atlas.width+frame.column*32+x];
      const actual=layer.surface[(frame.y+y)*256+frame.x+x];assert.equal(actual,pixel);if(pixel){sourceCount++;if(y===31)lastRow++;}if(actual)destCount++;
    }
    assert.ok(sourceCount>150);assert.equal(destCount,sourceCount);if(row===0||row===3)assert.ok(lastRow>0,'walking boot pixels in row 31 are retained');
  }
});

test('replacement sprite obeys the native layer result instead of painting over foreground tiles',()=>{
  const {layer,ppu}=scene();layer.inject(ppu,80);const x=layer.customLine.findIndex(color=>color>0);assert.ok(x>=0);
  ppu.selectedLayer=4;assert.equal(ppu.getColor(false,x,81)[0],layer.customLine[x]-1);
  ppu.selectedLayer=1;assert.deepEqual(ppu.getColor(false,x,81),[1234,1,3]);
  assert.equal(ppu.spritePrioBuffer[x],2);
});

test('waterfall sprites retain the native color-math palette and all body pixels',()=>{
  const {layer,ppu}=scene();ppu.oam[15]=0x2bc0;ppu.oam[17]=0x2bc2;layer.prepare();
  assert.ok(layer.plan.anchor);assert.equal(layer.plan.parts[0].palette,5);
  layer.inject(ppu,80);const x=layer.customLine.findIndex(color=>color>0);assert.ok(x>=0);assert.equal(ppu.spriteLineBuffer[x],0xd1);
});

test('airborne Goku clears low foreground scenery without inheriting submerged color math',()=>{
 const {layer,ppu,mod}=scene();ppu.oam[15]=0x2bc0;ppu.oam[17]=0x2bc2;mod.localFlight=true;mod.localLift=12;layer.prepare();
 let seen=0;for(let y=40;y<110;y++){layer.inject(ppu,y);for(let x=0;x<256;x++)if(layer.customLine[x]){seen++;assert.equal(ppu.spriteLineBuffer[x],0x91);assert.equal(ppu.spritePrioBuffer[x],3);}}
 assert.ok(seen>100);
});

test('native save files show Goku only for validated Goku records, including backup saves',()=>{
 const {layer,ppu,mod,ram}=scene();ppu.mode=5;ppu.tilemapAdr=[0,0x5800];ppu.vram=new Uint16Array(32768);
 for(const row of[2,8,14,20]){ppu.vram[0x5800+row*32+7]=0x20;ppu.vram[0x5800+(row+5)*32+7]=0x8020;}
 const sram=new Uint8Array(8192);layer.snes.cart={sram};ram[0xa215]=0xfc;sram[0]=0xc5;sram[0x2bb]=0x3a;sram.set([0xa1,0xa9,0xa5,0xaf,0],3);
 const pixels=()=>{mod.frame++;let n=0;for(let y=31;y<191;y++)for(let x=94;x<110;x++)n+=!!layer.savePortrait(ppu,x,y);return n;};
 assert.ok(pixels()>100);assert.equal(layer.saveFaces,1);
 sram.copyWithin(0x1000,0,0x400);sram.fill(0,0,0x400);ram[0xa215]=0xfd;assert.ok(pixels()>100,'use a valid backup if the primary save is corrupt');
 ram[0xa215]=0xff;assert.equal(pixels(),0,'empty and invalid records keep native artwork');
 ram[0xa215]=0xfd;sram[0x1003]=0x9b;assert.equal(pixels(),0,'pre-Goku files retain the boy');
 sram[0x1003]=0xa1;ppu.vram[0x5800+2*32+7]=0;assert.equal(pixels(),0,'other high-resolution windows are not save files');
});

test('HUD portraits change without replacing reused shop icons or the ring cursor',()=>{
  const {layer,ppu}=scene();
  ppu.oam[0]=88|(199<<8);ppu.oam[1]=0x33e8;
  ppu.oam[4]=125|(100<<8);ppu.oam[5]=0x330a;
  ppu.oam[6]=112|(87<<8);ppu.oam[7]=0x3308;
  layer.prepare();assert.equal(layer.plan.portraits.size,1);assert.ok(layer.plan.hidden.has(0));assert.equal(layer.plan.hidden.has(4),false);assert.equal(layer.plan.hidden.has(6),false);
  layer.injectPortrait(ppu,204,layer.plan.portraits.get(0));assert.ok(layer.customLine.some(color=>color>0));
});

test('the owned HUD portrait stays Goku during fades without a visible body',()=>{
  for(const superSaiyan of[false,true])for(const palette of[1,5]){
    const {layer,ppu,mod,ram}=scene();mod.options.superSaiyan=superSaiyan;
    ram[0xe4]=4;ram[0xe5]=7;ppu.oam.fill(0xf000);ppu.oam[0]=88|(199<<8);ppu.oam[1]=0x31e8|(palette<<9);
    mod.ownership={revision:1,ppuOwners:[{base:0xe000,kind:'portrait',native:{status1:0,status2:0}}]};
    layer.prepare();assert.equal(layer.plan.anchor,null);assert.equal(layer.plan.portraits.size,1);assert.ok(layer.plan.hidden.has(0));
    layer.injectPortrait(ppu,204,layer.plan.portraits.get(0));assert.ok(layer.customLine.some(Boolean));
    // Shared status icons and the other characters are still cartridge art.
    mod.ownership.ppuOwners[0].native.status1=0x20;layer.prepare();assert.equal(layer.plan.portraits.size,0);
    mod.ownership.ppuOwners[0]={base:0xe200,kind:'portrait',native:{status1:0,status2:0}};layer.prepare();assert.equal(layer.plan.portraits.size,0);
  }
});

test('post-sword waterfall palettes replace the HUD portrait and hide the native weapon',()=>{
  const {layer,ppu,mod}=scene();
  // Actual visible OAM after the original sword pickup and a successful grass cut.
  ppu.oam.fill(0xf000);
  for(const [index,x,y,attr]of [[0,88,199,0x3be8],[1,190,111,0x7944],[2,193,106,0x3bc0],[3,190,122,0x3bc2],[4,190,128,0x3a00]]){
    ppu.oam[index*2]=x|(y<<8);ppu.oam[index*2+1]=attr;
  }
  const read=mod.read16;mod.read16=a=>a===0xe020?198:a===0xe022?136:read(a);
  layer.prepare();assert.ok(layer.plan.hidden.has(2),'color-math weapon is hidden');
  assert.equal(layer.plan.hidden.has(8),false,'original ground shadow is retained');
  const portrait=layer.plan.portraits.get(0);assert.ok(portrait);assert.equal(portrait.palette,5);
  layer.injectPortrait(ppu,204,portrait);
  const x=layer.customLine.findIndex(color=>color>0);assert.ok(x>=0);assert.equal(ppu.spriteLineBuffer[x],0xd1);
});

test('native status and Action Grid character panels replace only the boy',()=>{
  for(const [x,y]of [[16,32],[144,144]]){
    const {layer,ppu,mod}=scene();ppu.objSize=0;ppu.cgram=new Uint16Array(256);
    const rom=new Uint8Array(0x82000);layer.snes.cart={data:rom};
    for(let i=1;i<16;i++){const value=0x421*i,at=0x80ffe+0x80*30+i*2;rom[at]=value&255;rom[at+1]=value>>8;ppu.cgram[0x90+i]=value;}
    const read=mod.read8;mod.read8=a=>a===0x2c?3:read(a);mod.canAttack=false;
    ppu.oam.fill(0xf000);
    for(let cell=0;cell<8;cell++){ppu.oam[cell*2]=x+(cell&1)*8|((y+(cell>>1)*8)<<8);ppu.oam[cell*2+1]=0x3230+cell;}
    layer.prepare();assert.equal(layer.plan.parts.length,8);assert.equal(layer.plan.sprite.x,x-8);assert.equal(layer.plan.sprite.y,y);assert.equal(layer.plan.sprite.row,0);
    ppu.cgram[0x95]^=1;layer.prepare();assert.equal(layer.plan.parts.length,0,'another character palette is preserved');
  }
});

test('shared snowman and moogle transformations retain the native body and HUD artwork',()=>{
  for(const [address,flag]of [[0xe190,0x20],[0xe191,0x10]]){
    const {layer,ppu,ram}=scene();ram[address]=flag;
    ppu.oam[0]=88|(199<<8);ppu.oam[1]=0x33e8;layer.prepare();
    assert.equal(layer.plan.anchor,null);assert.equal(layer.plan.portraits.size,0);assert.equal(layer.plan.hidden.size,0);
  }
});

test('Balloon, Barrel and Engulf retain original overlays in reused weapon slots over Goku',()=>{
  for(const status of [1,4,0x40]){
    const {layer,ppu,ram}=scene();ram[0xe191]=status;ppu.oam[0]=88|(199<<8);ppu.oam[1]=0x33e8;
    for(const [index,tile]of [[2,0x44],[4,0x46],[6,0x48]]){ppu.oam[index]=92|(72<<8);ppu.oam[index+1]=0x3100|tile;}
    layer.prepare();assert.equal(layer.plan.parts.length,2);assert.equal(layer.plan.portraits.size,1);
    assert.ok(layer.plan.hidden.has(14));assert.ok(layer.plan.hidden.has(16));assert.ok(layer.plan.hidden.has(0));
    for(const index of [2,4,6])assert.equal(layer.plan.hidden.has(index),false,'native status effect must not be mistaken for a sword');
  }
});

test('poison and petrify apply native palette changes to Goku',()=>{
  const {layer,ppu,ram}=scene(),base=[0,0x10a6,0xd10,0x1179,0x127f,0x1d51,0x29fa,0x3efe,0x54bd,0x52df,0x3924,0x6247,0x7b91,0x251b,0x16bf,0x7fff];
  const rom=new Uint8Array(0x82000);layer.snes.cart={data:rom};ppu.cgram=new Uint16Array(256);
  for(let i=1;i<16;i++){const at=0x80ffe+0x80*30+i*2;rom[at]=base[i]&255;rom[at+1]=base[i]>>8;ppu.cgram[0x90+i]=base[i];}
  const skin=0x1df5+1;assert.equal(layer.tint(skin,1),skin);
  ppu.cgram[0x95]=0x418d;ppu.cgram[0x96]=0x6e31;ppu.cgram[0x97]=0x7f17;ram[0xe191]=0x20;layer.prepare();
  const poisoned=layer.tint(skin,1)-1;assert.ok(((poisoned>>10)&31)>(poisoned&31),'skin takes the original purple poison tint');
  const stone=[0,0x1d09,0x7fff,0x739d,0x5ad7,0x4211,0x294b];ppu.cgram.set(stone,0x90);ram[0xe190]=0x40;layer.prepare();
  for(const color of [0,0x1df5,0x4004,0x1df,0x7fff])assert.ok(stone.slice(1).includes(layer.tint(color+1,1)-1),'statue uses an original stone-palette shade');
});

test('unconscious and miniature states use appropriate poses and size',()=>{
  const {layer,ram}=scene();ram[0xe190]=0x10;layer.prepare();assert.equal(layer.plan.sprite.row,1);assert.equal(layer.plan.sprite.column,51);
  ram[0xe190]=0;ram[0xe180]=0xf6;layer.prepare();assert.equal(layer.plan.sprite.width,16);assert.equal(layer.plan.sprite.height,16);
});

test('a player partially beyond the top-left edge retains visible sprite pixels',()=>{
  const {layer,ppu,ram}=scene();ram[0xe020]=0xfc;ram[0xe021]=0xff;ram[0xe022]=25;
  ppu.oam[14]=244|(250<<8);ppu.oam[16]=244|(10<<8);ppu.highOam[0]=1<<14;ppu.highOam[1]=1;
  layer.prepare();assert.equal(layer.plan.sprite.x,-20);assert.equal(layer.plan.sprite.y,-6);assert.ok(layer.surface.some(color=>color>0));
});

test('native effect cells retain every pixel under quarter turns, with spell priority and no water color math',()=>{
  const {layer,ppu}=scene();ppu.oam[15]=0x2bc0;ppu.oam[17]=0x2bc2;layer.prepare();
  const tile=new Uint16Array(256);tile[0]=0x4211;tile[7*16+11]=0x7fff;tile[255]=0x1234;layer.effects.probe=[tile];
  for(const [dx,dy]of [[1,0],[0,1],[-1,0],[0,-1]]){
    layer.surface.fill(0);layer.effectMask.fill(0);layer.stamp('probe',0,120,90,dx,dy);
    assert.equal(layer.surface.filter(Boolean).length,3);
    for(const [px,py]of [[0,0],[11,7],[15,15]]){
      const x=120+dx*(px-8)-dy*(py-8),y=90+dy*(px-8)+dx*(py-8);
      assert.equal(layer.surface[y*256+x],tile[py*16+px]);layer.inject(ppu,y);
      assert.equal(ppu.spriteLineBuffer[x],0x86,'native spell OBJ palette is independent of water-body palette 5');
      assert.equal(ppu.spritePrioBuffer[x],3);
    }
  }
});

test('charge and aura effects are absent while a native menu or dialogue owns control',()=>{
  const {layer,mod}=scene(),tile=new Uint16Array(256).fill(0x7fff);
  for(const name of ['charge-orb','gold-charge-orb','gold-arc','gold-spark','lightning'])layer.effects[name]=[tile];
  mod.options.superSaiyan=true;mod.charging=true;mod.charge=45;mod.canAttack=true;layer.prepare();
  assert.ok(layer.effectMask.some(Boolean));
  mod.canAttack=false;layer.prepare();assert.equal(layer.effectMask.some(Boolean),false);
});

test('a charging aura keeps every body pixel and stops on release or loss of native control',()=>{
 for(const superSaiyan of[false,true])for(const small of[false,true]){
  const{layer,mod,ram}=scene();mod.options.superSaiyan=superSaiyan;
  layer.effects['charge-orb']=[Uint16Array.from([0,29397,31577,32733,32768])];
  layer.effects['gold-arc']=[Uint16Array.from([0,500,633,797,12288,32768])];
  if(small)ram[0xe180]=0xf6;
  mod.action={kind:'focus',age:100,duration:0};mod.powerCharge=96;layer.prepare();
  assert.ok(layer.effectMask.some(Boolean));const withAura=layer.surface.slice();
  mod.canAttack=false;layer.prepare();
  for(let i=0;i<layer.surface.length;i++)if(layer.surface[i])assert.equal(withAura[i],layer.surface[i],'The moving body must stay in front of the aura');
  mod.canAttack=false;layer.prepare();assert.equal(layer.effectMask.some(Boolean),false);
  mod.canAttack=true;mod.action=null;mod.powerCharge=0;layer.prepare();assert.equal(layer.effectMask.some(Boolean),false);
 }
});

test('Instant Transmission renders a completely absent body between the two streak sequences',()=>{
 for(const superSaiyan of[false,true])for(let facing=0;facing<4;facing++){
  const {layer,mod}=scene([1,2,0x82,0][facing]);mod.options.superSaiyan=superSaiyan;
  for(let age=0;age<12;age++){
   mod.frame++;mod.action={kind:'teleport',age,super:superSaiyan,facing};layer.prepare();
   assert.equal(layer.plan.sprite.hidden,age>=4&&age<6);
   assert.equal(layer.surface.some(Boolean),!(age>=4&&age<6));
  }
 }
});

test('focus breathing moves the upper body while boots remain planted in both sizes and forms',()=>{
 for(const superSaiyan of[false,true])for(const small of[false,true]){
  const{layer,mod,ram}=scene();mod.options.superSaiyan=superSaiyan;if(small)ram[0xe180]=0xf6;
  const frames=[];
  for(const age of[10,22,46]){
   mod.frame++;mod.action={kind:'focus',age,super:superSaiyan};layer.prepare();
   const p=layer.plan.sprite,feet=[],head=[];
   for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
    const c=layer.surface[(p.y+y)*256+p.x+x];
    if(y>=p.height-2)feet.push(c);else if(y<p.height/2)head.push(c);
   }
   frames.push({feet,head});
  }
  assert.deepEqual(frames[0].feet,frames[1].feet);assert.deepEqual(frames[0].feet,frames[2].feet);
  assert.notDeepEqual(frames[0].head,frames[1].head,'inhale is visible without moving the feet');
 }
});

test('native palette effects cover the rising transformation hair above the original crop',()=>{
 const{layer,mod}=scene();mod.options.superSaiyan=true;mod.action={kind:'transform',age:12,duration:32,super:true};
 layer.tint=()=>12345;layer.prepare();
 const p=layer.plan.sprite;
 assert.ok(layer.surface.slice((p.y-1)*256,p.y*256).some(Boolean),'ignition lifts the hair beyond the old crop');
 assert.ok(layer.surface.filter(Boolean).every(c=>c===12345),'every body pixel receives the native tint');
});

test('Thanatos aura flickers behind native sprite pixels regardless of OAM order',()=>{
 for(const slot of[2,30]){
  const {layer,ppu,mod}=scene();
  layer.effects['charge-orb']=[Uint16Array.from([0,29397,31577,32733,32768])];
  layer.effects['gold-arc']=[Uint16Array.from([0,500,633,797,12288,32768])];
  Object.assign(ppu,{vram:new Uint16Array(0x8000),sprAdr1:0,sprAdr2:0,objPriority:false,spriteTileOffsets:Array.from({length:64},(_,i)=>(i&7)+(i>>3)*16)});
  ppu.oam[slot]=120|(90<<8);ppu.oam[slot+1]=0x2400;ppu.vram[0]=255;
  layer.prepare();layer.aura(124,100,90,{tone:'pink',power:.7,behindActors:true});
  assert.ok(layer.effectMask.some(v=>v===2));layer.evaluate(ppu,90);
  for(let x=120;x<128;x++){
   assert.equal(ppu.spriteLineBuffer[x],0xa1,'Every opaque native texel stays visible');
   assert.equal(layer.customLine[x],0);
  }
  assert.ok(layer.customLine[119]||layer.customLine[128],'The flame remains around the actual silhouette');
  mod.frame++;layer.prepare();layer.aura(124,100,90,{tone:'pink',power:.7,behindActors:true});
  assert.equal(layer.effectMask.some(v=>v===2),false,'Alternate frames reveal the original background');
 }
});

test('miniature charge stays at the smaller hand position without shrinking original spell art',()=>{
  const {layer,mod,ram}=scene();ram[0xe180]=0xf6;mod.charging=true;mod.charge=90;
  const tile=new Uint16Array(256);tile[8*16+8]=123;layer.effects['charge-orb']=[tile];layer.prepare();
  const sprite=layer.plan.sprite,x=Math.round(sprite.x+13/2),y=Math.round(sprite.y+21/2);
  assert.equal(sprite.width,16);assert.equal(layer.surface[y*256+x],123);assert.equal(layer.effectMask[y*256+x],1);
});

test('new-game Drum patch preserves every original intro, menu, map and event byte',async t=>{
  let source;try{source=new Uint8Array(await readFile(new URL('../.local/rom/secret-of-mana-us.sfc',import.meta.url)));}catch{t.skip('Local US ROM required');return;}
  const before=source.slice(),patched=context.window.originalGamePatch(source),allowed=new Set();
  for(let i=0;i<4;i++)allowed.add(0x57af+i);for(let i=0;i<12;i++)allowed.add(0x74285+i);
  const changed=[];for(let i=0;i<source.length;i++)if(source[i]!==patched[i]){assert.ok(allowed.has(i),`unexpected edit at ${i.toString(16)}`);changed.push(i);}
  assert.equal(changed.length,16);assert.deepEqual(source,before);assert.equal(patched.length,source.length);
});
