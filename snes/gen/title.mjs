// Data generator for the title module (title screen, naming, ROM text and
// inventory patches, Goku's arrival). Writes dist/snes/gen/title/title.asm,
// included into the module's data bank. All authored content comes from the
// browser engine so the cartridge and the browser mod share one source:
//   engine/title-layer.js        GOKU lettering and the extended credit
//   engine/native-names.js       GOKU / default names, boy's name tail
//   engine/dialogue-patches.js   bounded player-text spans
//   engine/rom-patches.js        additive starting inventory (Drum)
//   engine/arrival-event-data.js native event bytecode for the arrival
// Original graphics are read from the verified cartridge at build time.
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {decompress,hirom} from './title-lz.mjs';

const hex2=v=>'$'+v.toString(16).toUpperCase().padStart(2,'0');
const hex4=v=>'$'+v.toString(16).toUpperCase().padStart(4,'0');
const hex6=v=>'$'+v.toString(16).toUpperCase().padStart(6,'0');
const dbLines=(bytes,indent='\t')=>{const out=[];for(let i=0;i<bytes.length;i+=16)out.push(`${indent}db ${[...bytes.slice(i,i+16)].map(hex2).join(',')}`);return out.join('\n');};
const dwLines=(words,indent='\t')=>{const out=[];for(let i=0;i<words.length;i+=8)out.push(`${indent}dw ${words.slice(i,i+8).map(hex4).join(',')}`);return out.join('\n');};
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

// --- SNES 4bpp planar tiles ------------------------------------------------
function decodeTile4(bytes,offset){
  const px=new Uint8Array(64);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const bit=7-x;
    px[y*8+x]=((bytes[offset+y*2]>>bit)&1)|(((bytes[offset+y*2+1]>>bit)&1)<<1)|(((bytes[offset+16+y*2]>>bit)&1)<<2)|(((bytes[offset+16+y*2+1]>>bit)&1)<<3);
  }
  return px;
}
function encodeTile4(px){
  const out=new Uint8Array(32);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const v=px[y*8+x],bit=7-x;
    if(v>15)throw Error('4bpp pixel out of range');
    out[y*2]|=(v&1)<<bit;out[y*2+1]|=((v>>1)&1)<<bit;out[16+y*2]|=((v>>2)&1)<<bit;out[16+y*2+1]|=((v>>3)&1)<<bit;
  }
  return out;
}

// --- Title screen ---------------------------------------------------------
// The title program (decompressed from C7:7C00 to 7E:8000) decompresses the
// logo tiles from DC:E800 to 7E:4000 and the 8x8 font from C7:C1C0 to
// 7E:4C00, then DMAs 7E:4000-4FFF to BG2 tiles (VRAM word 0, 4bpp). Its BG2
// tilemap (7F:2700 -> VRAM $0800) places the Mana word's tiles as below.
const TITLE_MAP_ROWS={ // row -> [firstCol, tiles...] for the logo rows 7..12
  7:col=>col>=8&&col<=23?col-8:0x60,
  8:col=>col>=8&&col<=11?0x10+col-8:col>=17&&col<=23?0x10+col-8:0x60,
  9:col=>col>=8&&col<=23?0x20+col-8:0x60,
  10:col=>col>=8&&col<=23?0x30+col-8:0x60,
  11:col=>col>=8&&col<=23?0x40+col-8:0x60,
  12:col=>({12:0x14,13:0x15,16:0x16,17:0x17})[col]??0x60,
};
const tileFor=c=>c===' '?0x60:c.charCodeAt(0)-64+0x60;

async function titleData(rom,repo){
  const {createTitleLayer,TITLE_CREDIT,TITLE_LOGO_RECT}=await import(pathToFileURL(join(repo,'engine/title-layer.js')).href);
  const logo=decompress(rom,hirom(0xdce800)),font=decompress(rom,hirom(0xc7c1c0));
  if(logo.size!==0xc00||font.size!==0x400)throw Error('Unexpected title graphics block sizes');
  // Mock PPU in the native title configuration; the browser layer reports
  // the pixel it would substitute through getPixelForLayer.
  const vram=new Uint16Array(0x8000);
  const tiles=new Uint8Array(0x1000);tiles.set(logo.data,0);tiles.set(font.data,0xc00);
  for(let i=0;i<0x800;i++)vram[i]=tiles[i*2]|tiles[i*2+1]<<8;
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)vram[0x800+y*32+x]=0x2000|(TITLE_MAP_ROWS[y]?.(x)??0x60);
  const ORIGINAL='PROGRAMMED BY NASIR';
  const original=Array.from({length:32},(_,x)=>0x2000|tileFor(ORIGINAL[x-6]??' '));
  for(let x=0;x<32;x++)vram[0x800+17*32+x]=original[x];
  const NATIVE=0x7fff;
  const ppu={mode:3,tileAdr:[0x1000,0],tilemapAdr:[0xc00,0x800],mainScreenEnabled:[false,true],bigTiles:[false,false],vram,renderLine(){},getPixelForLayer(){return NATIVE;}};
  const layer=createTitleLayer(ppu);ppu.renderLine(0);
  if(!layer.active||!layer.creditVisible)throw Error('Title layer did not recognise the native title layout');
  const {x:rx,y:ry,width:rw,height:rh}=TITLE_LOGO_RECT;
  // Every BG2 tile that intersects the rectangle: keep native pixels outside,
  // take the browser layer's pixel (palette 0 index, 0 = transparent) inside.
  const logoTiles=[];
  for(let row=ry>>3;row<=(ry+rh-1)>>3;row++)for(let col=rx>>3;col<=(rx+rw-1)>>3;col++){
    const tile=TITLE_MAP_ROWS[row](col),px=decodeTile4(tiles,tile*32),before=px.slice();
    for(let py=0;py<8;py++)for(let qx=0;qx<8;qx++){
      const x=col*8+qx,y=row*8+py;
      if(x<rx||x>=rx+rw||y<ry||y>=ry+rh)continue;
      const v=ppu.getPixelForLayer(x,y,1,1);
      if(v===NATIVE||v<0||v>15)throw Error(`Unexpected title layer pixel at ${x},${y}`);
      px[py*8+qx]=v;
    }
    if(tile===0x60){
      // The shared blank font tile must stay blank: the lettering has no ink there.
      if(px.some(v=>v!==0))throw Error('GOKU lettering reaches the shared blank tile');
      continue;
    }
    if(logoTiles.some(t=>t.tile===tile))throw Error(`Logo tile ${tile} appears twice`);
    if(!same(px,before))logoTiles.push({tile,bytes:encodeTile4(px)});
  }
  // Extended credit: 31 font glyphs, x inset 4. Natively the row holds the
  // glyphs at columns 0-30 and an HDMA channel scrolls BG2 by -4 on lines
  // 136-143. Check that composition against the browser layer pixel by pixel.
  if(TITLE_CREDIT.length!==31)throw Error('Credit no longer fits the 31-cell row');
  const credit=Array.from({length:32},(_,x)=>0x2000|tileFor(TITLE_CREDIT[x]??' '));
  const fontPixel=(tile,x,y)=>{const a=tile*16+y,lo=vram[a],hi=vram[a+8],b=7-x;return((lo>>b)&1)|(((lo>>(b+8))&1)<<1)|(((hi>>b)&1)<<2)|(((hi>>(b+8))&1)<<3);};
  const HOFS=0x3fc;
  for(let y=136;y<144;y++)for(let x=0;x<256;x++){
    const bx=(x+HOFS)&255,word=credit[bx>>3];
    const mine=fontPixel(word&0x3ff,bx&7,y&7),theirs=ppu.getPixelForLayer(x,y,1,1);
    if(mine!==theirs)throw Error(`Credit composition differs at ${x},${y}: ${mine} vs ${theirs}`);
  }
  // HDMA (mode 2, BG2HOFS). Scanline L (1-224) shows BG row L+VOFS (VOFS is
  // 0 on the title), so BG rows 136-143 are scanlines 136-143. HDMA writes
  // during the h-blank before each line; a table entry of n lines covers n
  // scanlines from scanline 1: 127+8 lines at 0, 8 lines at -4, then 0.
  const hdma=[127,0,0,8,0,0,8,HOFS&255,HOFS>>8,1,0,0,0];
  {let line=1;const spans=[];for(let i=0;hdma[i];i+=3){spans.push([line,line+hdma[i]-1,hdma[i+1]|hdma[i+2]<<8]);line+=hdma[i];}
   const shifted=spans.filter(s=>s[2]===HOFS);
   if(shifted.length!==1||shifted[0][0]!==136||shifted[0][1]!==143)throw Error('Credit HDMA does not cover scanlines 136-143');}
  return {logoTiles,original,credit,hdma,hofs:HOFS};
}

// --- WRAM title program patch sites ---------------------------------------
function programSites(rom){
  const prog=decompress(rom,hirom(0xc77c00));
  const at=a=>prog.data[a-0x8000];
  const expect=(addr,bytes,label)=>{if(!bytes.every((v,i)=>at(addr+i)===v))throw Error(`Title program differs at 7E:${addr.toString(16)} (${label})`);return bytes;};
  // Logo graphics: LDA #$007E / LDY #$4000 / XBA / ORA #$00DC / LDX #$E800 / JSL $C10014.
  expect(0xadf0,[0xa9,0x7e,0x00,0xa0,0x00,0x40,0xeb,0x09,0xdc,0x00,0xa2,0x00,0xe8],'logo load arguments');
  const logo=expect(0xadfd,[0x22,0x14,0x00,0xc1],'logo load JSL');
  // Text-row writer 7E:8820 (reads 7E:59F8,X, writes $0000,Y) and its epilogue.
  expect(0x8820,[0x0b,0x08,0xc2,0x30,0xda,0x3b,0x5b,0xe2,0x20,0xbf,0xf8,0x59,0x7e],'text row writer');
  const writer=expect(0x8869,[0x68,0x68,0x28,0x2b,0x60],'text row writer epilogue');
  // Vblank DMA queue end: LDA $0070 / STA $00420C (HDMA enable from 7F:0070).
  const hdma=expect(0x92dd,[0xad,0x70,0x00,0x8f,0x0c,0x42,0x00],'HDMA enable');
  return {size:prog.size,logo,writer,hdma};
}

// --- Names ----------------------------------------------------------------
async function nameData(repo){
  const names=await import(pathToFileURL(join(repo,'engine/native-names.js')).href);
  const {encodeText}=await import(pathToFileURL(join(repo,'engine/event-codec.js')).href);
  if(names.boyTail!==0xcc06||names.nameSlot(1)!==0xcc0c)throw Error('Name slot layout changed');
  const pad=(bytes,n)=>{if(bytes.length>n)throw Error('Name too long');return [...bytes,...Array(n-bytes.length).fill(0)];};
  // The name editor prefill in engine/lab.js (prefillName): signature and the
  // BOY tiles written into the editor field. Keep these literals in sync.
  const lab=readFileSync(join(repo,'engine/lab.js'),'utf8');
  for(const s of ['mod.read8(0xa156)!==3','mod.read8(0xa157)!==0x12','mod.read8(0xa1cc)!==0','mod.read16(0x90d0)!==0x2022','mod.read16(0x9306)!==0x2058','mod.read16(0x9308)!==0x205c',
    '[0x205c,0x2090,0x20b8].forEach((tile,i)=>{mod.write16(0x90d2+i*2,tile);mod.write16(0x9112+i*2,tile+2);});','mod.write8(0xa1cc,3);mod.write8(0xa157,0x18);mod.write8(0xa20a,mod.read8(0xa20a)|2)'])
    if(!lab.includes(s))throw Error(`engine/lab.js name prefill changed: ${s}`);
  return {
    goku:pad([...names.gokuName],6),boy:pad(encodeText('BOY'),6),
    primm:pad([...names.defaultNames[1]],6),popoi:pad([...names.defaultNames[2]],6),randi:pad([...names.defaultNames[3]],6),
  };
}

// --- ROM text and inventory patches ----------------------------------------
function legacyPatches(rom,repo){
  const window={};
  vm.runInNewContext(readFileSync(join(repo,'engine/dialogue-patches.js'),'utf8'),{window,Uint8Array});
  vm.runInNewContext(readFileSync(join(repo,'engine/rom-patches.js'),'utf8'),{window,Uint8Array});
  const base=new Uint8Array(rom.subarray(0,0x200000));
  const inventory=window.originalGamePatch(base),text=window.gokuDialoguePatch(base);
  // The arrival's read overlay restores the boy's original sword-pull grunt
  // (C9:2691) in the browser, so that span stays original here as well.
  const SKIP=new Set(['sword-pull']);
  const spans=[];
  for(const p of window.gokuDialoguePatch.patches){
    if(SKIP.has(p.id))continue;
    // Replacements are padded to the original span with the blank glyph $80.
    const len=p.original.length;
    const bytes=[...text.subarray(p.offset,p.offset+len)],orig=[...base.subarray(p.offset,p.offset+len)];
    if(same(bytes,orig))throw Error(`Dialogue patch ${p.id} made no change`);
    spans.push({id:p.id,address:0xc00000|p.offset,orig,bytes});
  }
  // Every other changed byte must belong to a listed span (or the skipped grunt).
  const covered=o=>spans.some(s=>o>=(s.address&0x3fffff)&&o<(s.address&0x3fffff)+s.bytes.length)||window.gokuDialoguePatch.patches.some(p=>SKIP.has(p.id)&&o>=p.offset&&o<p.offset+p.original.length);
  for(let o=0;o<base.length;o++)if(text[o]!==base[o]&&!covered(o))throw Error(`Unexpected dialogue patch byte at ${o.toString(16)}`);
  // Inventory: the browser redirects C0:57AF to a stub that stores one item
  // byte into the inventory: PHA / LDA #item / STA $7ECCxx / PLA / epilogue.
  const stub=[...inventory.subarray(0x74285,0x74285+12)];
  if(!same([...inventory.subarray(0x57af,0x57b3)],[0x5c,0x85,0x42,0xc7])||stub[0]!==0x48||stub[1]!==0xa9||stub[3]!==0x8f||stub[7]!==0x68||!same(stub.slice(8),[0x28,0xab,0x2b,0x6b]))
    throw Error('Unexpected inventory patch layout');
  return {spans,item:stub[2],itemAddress:stub[4]|stub[5]<<8|stub[6]<<16};
}

// --- Arrival event ---------------------------------------------------------
async function arrivalEvent(rom,repo){
  const {installArrivalEventData}=await import(pathToFileURL(join(repo,'engine/arrival-event-data.js')).href);
  const data=new Uint8Array(rom.subarray(0,0x200000));
  const cart={data,read(bank,address){return data[((bank&0x3f)<<16)|(address&0xffff)];}};
  const ev=installArrivalEventData(cart,data);
  const rel={};for(const [k,v] of Object.entries(ev.labels))rel[k]=v-ev.entry;
  return {script:[...ev.script],labels:rel,hook:ev.hook,resume:ev.resume,grunt:ev.ranges.originalGrunt,names:ev.names,pages:ev.pages};
}

export async function generate({rom,repo,outDir}){
  const title=await titleData(rom,repo);
  const sites=programSites(rom);
  const names=await nameData(repo);
  const legacy=legacyPatches(rom,repo);
  const arrival=await arrivalEvent(rom,repo);
  if(!same(arrival.names.goku,names.goku)||!same(arrival.names.boy,names.boy))throw Error('Arrival names disagree with native-names.js');
  const L=[];
  L.push('; Generated by snes/gen/title.mjs - do not edit.');
  L.push(`!TITLE_PROGRAM_SIZE = ${hex4(sites.size)}`);
  L.push(`!TITLE_CREDIT_HOFS = ${hex4(title.hofs)}`);
  L.push(`!TITLE_INV_ITEM = ${hex2(legacy.item)}`);
  L.push(`!TITLE_INV_ADDR = ${hex6(legacy.itemAddress)}`);
  L.push(`!TITLE_EVENT_HOOK = ${hex6(arrival.hook)}`);
  L.push(`!TITLE_EVENT_RESUME = ${hex6(arrival.resume)}`);
  for(const [k,v] of Object.entries(arrival.labels))L.push(`!TITLE_EV_${k.toUpperCase()} = ${hex4(v)}`);
  L.push(`!TITLE_EVENT_LENGTH = ${hex4(arrival.script.length)}`);
  L.push('');
  L.push('; Original WRAM-program bytes at each patch site (verified at build time).');
  L.push(`macro title_orig_logo()\n${dbLines(sites.logo)}\nendmacro`);
  L.push(`macro title_orig_writer()\n${dbLines(sites.writer)}\nendmacro`);
  L.push(`macro title_orig_hdma()\n${dbLines(sites.hdma)}\nendmacro`);
  L.push('');
  L.push('; GOKU lettering: entries of (7E:4000 buffer address, 32-byte BG2 tile).');
  L.push('title_logo_tiles:');
  for(const t of title.logoTiles){L.push(`\tdw ${hex4(0x4000+t.tile*32)}\t; tile ${hex2(t.tile)}`);L.push(dbLines(t.bytes));}
  L.push('\tdw $FFFF');
  L.push('; BG2 row 17 as the native title writes it, and the extended credit.');
  L.push('title_credit_original:');L.push(dwLines(title.original));
  L.push('title_credit_new:');L.push(dwLines(title.credit));
  L.push('title_credit_hdma:');L.push(dbLines(title.hdma));
  L.push('');
  L.push('; Native-encoded names, zero padded to six bytes.');
  for(const k of ['goku','boy','primm','popoi','randi'])L.push(`title_name_${k}:\n${dbLines(names[k])}`);
  L.push('');
  L.push('; Arrival event bytecode (engine/arrival-event-data.js), relocatable.');
  L.push('title_event_script:');L.push(dbLines(arrival.script));
  L.push('title_event_script_end:');
  L.push('');
  L.push('; Bounded player-text spans (engine/dialogue-patches.js).');
  L.push('macro title_text_patches()');
  for(const s of legacy.spans){
    L.push(`\t; ${s.id}`);
    L.push(`\t%patch(${hex6(s.address)}, ${s.bytes.length}, title)`);
    L.push(`\t%orig4(${hex6(s.address)}, $${s.orig.slice(0,4).reverse().map(v=>v.toString(16).toUpperCase().padStart(2,'0')).join('')})`);
    L.push(`\tpushpc\n\torg ${hex6(s.address)}\n${dbLines(s.bytes,'\t')}\n\tpullpc`);
  }
  L.push('endmacro');
  writeFileSync(join(outDir,'title.asm'),L.join('\n')+'\n');
  writeFileSync(join(outDir,'title.json'),JSON.stringify({logoTiles:title.logoTiles.map(t=>t.tile),spans:legacy.spans.map(s=>({id:s.id,address:s.address.toString(16),length:s.bytes.length})),event:{length:arrival.script.length,labels:arrival.labels},pages:arrival.pages},null,1));
}
