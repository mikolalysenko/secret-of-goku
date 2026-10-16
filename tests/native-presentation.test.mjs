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
atlases.ssjJab=context.window.ManaSpriteLayer.leadPunchAtlas(atlases);
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

test('push cells animate an existing palm while keeping each form, face and boots planted',()=>{
  const {layer}=scene();
  for(const sheet of ['goku','ssj'])for(let row=0;row<4;row++){
    const atlas=atlases[sheet],frames=[];
    for(let reach=0;reach<3;reach++){
      const cell=layer.pushFrame(sheet,row,reach);frames.push(Array.from(cell).join(','));
      assert.equal(layer.pushFrame(sheet,row,reach),cell,'fixed cells are cached, not rebuilt each scanline');
      const colors=new Set(atlas.pixels);
      for(let y=0;y<32;y++)for(let x=0;x<32;x++){
        const original=atlas.pixels[(32+row*32+y)*atlas.width+x],c=cell[y*32+x];
        assert.ok(colors.has(c),'only existing sprite colors are used');
        if(y>=28||original&&y<15&&x>=12&&x<=20)assert.equal(c,original,'face, hair and boot soles stay fixed');
      }
      layer.surface.fill(0);layer.blit(sheet,0,row,100,80,32,32,null,0,reach);
      for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(layer.surface[(80+y)*256+100+x],cell[y*32+x],'the actual OBJ blit uses the push cell');
    }
    assert.equal(new Set(frames).size,3,`${sheet} row ${row} has three visibly different poses`);
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
  for(let i=0;i<layer.surface.length;i++)if(layer.surface[i])assert.equal(withAura[i],layer.surface[i],'Faces, hands and boots must stay in front of the aura');
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

test('combat poses preserve exact source pixels and a fixed integer pivot in every direction and size',()=>{
 for(const superSaiyan of[false,true])for(const small of[false,true])for(let facing=0;facing<4;facing++){
  const {layer,mod,ram}=scene([1,2,0x82,0][facing]);mod.options.superSaiyan=superSaiyan;mod.canAttack=false;
  if(small)ram[0xe180]=0xf6;
  let anchor;
  for(const kind of['focus','punch','blast','teleport','transform','revert'])for(let age=0;age<32;age++){
   for(let combo=0;combo<(kind==='punch'?3:1);combo++){
    mod.frame++;mod.action={kind,age,combo,super:superSaiyan,facing,impact:superSaiyan?1:2,duration:32};layer.prepare();
    const p=layer.plan.sprite,a=atlases[p.sheet];
    assert.ok(Number.isInteger(p.x)&&Number.isInteger(p.y));
    anchor??=[p.x,p.y];assert.deepEqual([p.x,p.y],anchor,'actions never translate the sprite');
    let opaque=0;
    for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
     const c=p.hidden?0:a.pixels[(32+p.row*32+Math.floor(y*32/p.height))*a.width+p.column*32+Math.floor(x*32/p.width)];
     assert.equal(layer.surface[(p.y+y)*256+p.x+x],c,`${kind} must retain the complete source cell`);
     if(c)opaque++;
    }
    assert.equal(layer.surface.filter(Boolean).length,opaque,'no displaced or stray pixels outside the cell');
   }
  }
 }
});

test('the SSJ lead jab retains original fists and arcs, with an attached golden head and complete cell bounds',()=>{
 const a=atlases.ssjJab,base=atlases.goku,gold=new Set([3409,7834,13216,25568]);
 for(const cell of context.window.GokuAnimationData.forms.ssjJab.cells){
  const {column,row,bodyColumn}=cell,frame=[],points=[],reached=new Set(),queue=[];
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
   const c=a.pixels[(32+row*32+y)*a.width+column*32+x],old=base.pixels[(32+row*32+y)*base.width+bodyColumn*32+x];
   frame.push(c);if(c)points.push([x,y]);
   if(y>=22)assert.equal(c,old,'the original torso, hips and feet remain intact');
   const side=row===1||row===2,u=row===2?31-x:x;
   if(side&&column===0&&u>=27&&y>=11&&y<=15||side&&column===1&&u>=6&&u<=8&&y>=16&&y<=19)
    assert.equal(c,old,'the cocked fist and extended lead fist cannot be cut by the head');
   if(old===32768&&(row===3||y>=19||side&&u<=8||row===0&&x>=25))assert.equal(c,old,'white motion arcs stay in front of the head');
   if(c&&y>=22){queue.push(y*32+x);reached.add(y*32+x);}
  }
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  assert.deepEqual(Array.from(cell.bounds),[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs)+1,Math.max(...ys)-Math.min(...ys)+1]);
  assert.equal(cell.opaque,points.length);
  for(let i=0;i<queue.length;i++){
   const at=queue[i],x=at%32,y=at>>5;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy,next=yy*32+xx;
    if(xx>=0&&xx<32&&yy>=0&&yy<32&&frame[next]&&!reached.has(next)){reached.add(next);queue.push(next);}
   }
  }
  let hair=0;
  for(let i=0;i<1024;i++)if(gold.has(frame[i])){hair++;assert.ok(reached.has(i),`row ${row} phase ${column}: golden head stays joined to the body`);}
  assert.ok(hair>60);
  for(let ty=0;ty<32;ty+=8)for(let tx=0;tx<32;tx+=8){
   const colors=new Set();for(let y=ty;y<ty+8;y++)for(let x=tx;x<tx+8;x++)colors.add(frame[y*32+x]);
   colors.delete(0);assert.ok(colors.size<=15,'each 8px tile fits a 16-color OBJ palette including transparency');
  }
 }
});

test('grounded charge and power-up feet slide together without lifting or breaking the leg joins',()=>{
 for(const sheet of['goku','ssj'])for(const size of[32,16])for(let row=0;row<4;row++)for(const column of sheet==='ssj'?[18,21,...(row===0?[47,48,49]:[])]:[22,25,...(row===0?[54,55,56,57,58]:[])]){
  const {layer}=scene(),a=atlases[sheet],poses=[];
  for(const shuffle of[0,1]){
   layer.surface.fill(0);layer.blit(sheet,column,row,40,40,size,size,null,shuffle);
   const frame=[],reached=new Set(),queue=[],boots=[[],[]],soles=[-1,-1];
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const c=layer.surface[(40+y)*256+40+x],lx=x*32/size,ly=y*32/size;
    const original=a.pixels[(32+row*32+ly)*a.width+column*32+lx];frame.push(c);
    if(ly<=24)assert.equal(c,original,'head, torso and cupped hands stay intact');
    if(ly>=26){const foot=x<size/2?0:1;boots[foot].push(!!c);if(c)soles[foot]=y;}
    if(c&&ly<24){reached.add(y*size+x);queue.push(y*size+x);}
   }
   for(let i=0;i<queue.length;i++){
    const at=queue[i],x=at%size,y=Math.floor(at/size);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     const xx=x+dx,yy=y+dy,next=yy*size+xx;
     if(xx>=0&&xx<size&&yy>=0&&yy<size&&frame[next]&&!reached.has(next)){reached.add(next);queue.push(next);}
    }
   }
   assert.equal(layer.surface.filter(Boolean).length,frame.filter(Boolean).length,'no pixels escape the cell');
   poses.push({frame,boots,soles,detached:frame.filter(Boolean).length-reached.size});
  }
  assert.ok(poses[1].detached<=poses[0].detached,`${sheet} column ${column} row ${row} size ${size}: sliding cannot detach any leg pixels`);
  if(column<30)assert.equal(poses[1].detached,0,'charge and guard boots remain connected to the body');
  for(let foot=0;foot<2;foot++){
   const y=poses[0].soles[foot];let grounded=false;
   for(let x=foot*size/2;x<(foot+1)*size/2;x++)if(poses[0].frame[y*size+x]){
    for(let dx=-2;dx<=2;dx++)if(poses[1].frame[y*size+x+dx])grounded=true;
   }
   assert.ok(grounded,`${sheet} column ${column} row ${row} size ${size}: each sole remains on its original floor row`);
  }
  for(let foot=0;foot<2;foot++)assert.notDeepEqual(poses[0].boots[foot],poses[1].boots[foot],`${sheet} column ${column} row ${row} size ${size}: both feet must visibly slide`);
 }
});

test('airborne charging preserves the cupped hands and joins downward boots to the knees',()=>{
 for(const sheet of['goku','ssj'])for(const size of[32,16])for(let row=0;row<4;row++){
  const {layer}=scene(),column=sheet==='ssj'?18:22,a=atlases[sheet];
  layer.surface.fill(0);layer.blit(sheet,column,row,40,40,size,size,sheet==='ssj'?34:38);
  const frame=[],reached=new Set(),queue=[];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const c=layer.surface[(40+y)*256+40+x],lx=x*32/size,ly=y*32/size;
   const original=a.pixels[(32+row*32+ly)*a.width+column*32+lx];frame.push(c);
   const hand=ly===24&&(row===1&&lx>=23||row===2&&lx<10||row===3&&lx>=22);
   if(ly<24||hand)assert.equal(c,original,'the floating pose retains its head, torso and cupped hands');
   if(c&&ly<24){reached.add(y*size+x);queue.push(y*size+x);}
  }
  for(let i=0;i<queue.length;i++){
   const at=queue[i],x=at%size,y=Math.floor(at/size);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy,next=yy*size+xx;
    if(xx>=0&&xx<size&&yy>=0&&yy<size&&frame[next]&&!reached.has(next)){reached.add(next);queue.push(next);}
   }
  }
  assert.equal(reached.size,frame.filter(Boolean).length,`${sheet} row ${row} size ${size}: floating boots stay joined to the body`);
 }
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
