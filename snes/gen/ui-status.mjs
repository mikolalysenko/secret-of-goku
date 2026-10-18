// Goku's STATUS page (engine/native-status.js statusPixels) for the UI
// module: the page as a list of drawing operations the cartridge replays
// cell by cell into Mode 5 BG2 (16x8 hi-res cells, 2bpp), per band the
// operations touching it, fixed strings, palettes and the colour-set ->
// palette table.
//
// The operations mirror statusPixels() and are checked against it at build
// time on several stat sets (a change in native-status.js fails the build).
// The browser paints the raster from scanline 1, so BG row b shows raster
// row b + 1 on the cartridge too.
//
// Output (dist/snes/gen/ui-status/):
//   status.asm   tables included in the UI bank
//   defines.asm  !UI_ST_* constants
//   xdata UI_STATUS_WINTILES, UI_STATUS_MAP  the windows as static cells
//                and the page's BG2 tilemap holding only them (DMA sources
//                when the page is taken over)
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const WHITE=0x739c,GOLD=0x2fff,RED=0x285f,DIM=0x294a,GREY=0x5250,BLACK=0;
// Cartridge colour codes (3 bits per pixel while a cell is composed).
export const C={none:0,black:1,grey:2,white:3,gold:4,red:5,dim:6};
const RGB={1:BLACK,2:GREY,3:WHITE,4:GOLD,5:RED,6:DIM};
const ROWS=[['STRENGTH','strength',255],['AGILITY','agility',100],['CONSTITUTION','constitution',100],
  ['INTELLIGENCE','intelligence',100],['WISDOM','wisdom',100],['ATTACK','attack',8191],['HIT %','hit',100],
  ['DEFENSE','defense',999],['EVADE %','evade',100],['MAGIC DEF','magicDefense',999]];
const GOLD_KEYS=['strength','attack','defense','magicDefense'];
const WINDOWS=[[0,8,256,112],[256,8,256,192],[0,120,256,48],[0,168,256,32]];
// (the cartridge assumes cell-aligned windows: x and w multiples of 16, y
// and h of 8)
for(const [x,y,w,h] of WINDOWS)if(x%16||w%16||y%8||h%8)throw Error('status gen: window not cell aligned');
const FONT=0x12d600,WIN=0x12d080;
// Palettes: BG2 palette 0 is the game's window palette (CGRAM 1-3); the page
// adds palettes 4-7 (CGRAM 16-31, unused by its BG1 forest, palette 2).
const PALETTES=[[0,[C.black,C.grey,C.white]],[4,[C.black,C.dim,C.gold]],[5,[C.dim,C.gold,C.red]],
  [6,[C.black,C.dim,C.white]],[7,[C.black,C.gold,C.red]]];

// The page as operations, in statusPixels() drawing order. Dynamic text:
// {dyn:id}; the cartridge builds those strings at run time.
export function statusOps(stats,name,formatPower){
  const ops=[];
  const T=(text,x,y,o={})=>ops.push({k:'t',text:String(text),x,y,color:o.color??C.white,scale:o.scale??1,right:!!o.right,dyn:o.dyn});
  T(name,80,18,{dyn:'name'});T('LEVEL',80,34);T(stats.level,232,34,{right:true,dyn:'level'});
  T('HP',80,50);T(`${stats.hp}/${stats.maxHp}`,232,50,{right:true,dyn:'hp'});
  T(stats.form,16,68,{color:C.gold,dyn:'form'});
  T('POWER LEVEL',16,83);
  T(formatPower(stats.power),240,98,{color:C.gold,scale:2,right:true,dyn:'power'});
  T(stats.weighted?'HEAVY GI / TRAINING':'WEIGHTS OFF',16,130,{color:C.gold,dyn:'gi1'});
  T(stats.weighted?'POWER -10%  AGILITY -20%':'NO TRAINING PENALTY',16,146,{dyn:'gi2'});
  T(`MANA ${stats.mana}`,16,179,{dyn:'mana'});T(`${formatPower(stats.money)} GP`,240,179,{right:true,dyn:'money'});
  T('OFF THE SCALE!',272,17,{color:C.gold});
  ROWS.forEach(([label,key,max],i)=>{
    const y=34+i*15,value=stats[key];
    T(label,272,y);T(formatPower(value),496,y,{right:true,color:GOLD_KEYS.includes(key)?C.gold:C.white,dyn:`v${i}`});
    ops.push({k:'m',y:y+12,filled:Math.min(96,Math.round(96*value/max)),dyn:`m${i}`,max});
  });
  return ops;
}

// Window tiles per cell: [id, flipX, flipY] (statusPixels window()).
export function windowCells(){
  const cells=new Map();
  for(const [x,y,w,h] of WINDOWS){
    const put=(id,cx,cy,fx,fy)=>{const k=cy*32+cx;if(cells.has(k))throw Error(`status gen: two window tiles in cell ${cx},${cy}`);cells.set(k,[id,fx,fy]);};
    for(let dx=0;dx<w;dx+=16){const end=dx===0||dx===w-16;put(end?0:1,(x+dx)/16,y/8,dx>=w/2,false);put(end?0:1,(x+dx)/16,(y+h-8)/8,dx>=w/2,true);}
    for(let dy=8;dy<h-8;dy+=8){put(3,x/16,(y+dy)/8,false,false);put(3,(x+w-16)/16,(y+dy)/8,true,false);}
  }
  return cells;
}

// The windows alone, as statusPixels draws them: colour codes per hi-res
// pixel (512 x 224).
export function windowRaster(rom){
  const px=new Uint8Array(512*224);
  for(const [k,[id,fx,fy]] of windowCells()){
    const x=(k%32)*16,y=(k>>5)*8;
    for(let py=0;py<8;py++)for(let p=0;p<8;p++){
      const at=WIN+id*16+(fy?7-py:py)*2,bit=fx?p:7-p;
      const i=(rom[at]>>bit&1)|(rom[at+1]>>bit&1)<<1;
      if(i)for(let d=0;d<2;d++)px[(y+py)*512+x+p*2+d]=[0,C.black,C.grey,C.white][i];
    }
  }
  return px;
}

// Rasterise operations (with the windows first) like statusPixels: colour
// codes per hi-res pixel (512 x 224).
export function raster(rom,ops,encodeText){
  const px=windowRaster(rom);
  const put=(x,y,c)=>{if(x>=0&&x<512&&y>=0&&y<224)px[y*512+x]=c;};
  for(const op of ops){
    if(op.k==='m'){for(let x=0;x<96;x++){put(400+x,op.y,x<op.filled?C.gold:C.dim);put(400+x,op.y+1,x<op.filled?C.red:C.dim);}continue;}
    const codes=encodeText(op.text);let x=op.x;if(op.right)x-=codes.length*8*op.scale;
    const pts=[];
    codes.forEach((code,col)=>{for(let py=0;py<12;py++)for(let p=0;p<8;p++)if(rom[FONT+code*12+py]>>(7-p)&1)
      for(let d=0;d<op.scale;d++)pts.push([x+(col*8+p)*op.scale+d,op.y+py]);});
    for(const [a,b] of pts){put(a+1,b+1,C.black);put(a-1,b,C.black);}
    for(const [a,b] of pts)put(a,b,op.color);
  }
  return px;
}

export async function generate({rom,repo,outDir,xdata}){
  const eng=name=>import(pathToFileURL(join(repo,'engine',name)).href);
  const {statusPixels}=await eng('native-status.js');
  const {formatPower}=await eng('scouter.js');
  const {encodeText}=await eng('event-codec.js');
  const hex=(v,w=2)=>'$'+v.toString(16).toUpperCase().padStart(w,'0');
  const colourOf={0:0,1:C.black,[GREY+1]:C.grey,[WHITE+1]:C.white,[GOLD+1]:C.gold,[RED+1]:C.red,[DIM+1]:C.dim};

  // 1. The mirror equals statusPixels() on varied stat sets.
  let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed%n;};
  const sets=[{form:'SAIYAN',weighted:true,level:99,hp:999,maxHp:999,power:81000,strength:230,agility:12,constitution:13,
    intelligence:5,wisdom:5,attack:3686,hit:78,defense:176,evade:40,magicDefense:86,mana:0,money:0,name:'GOKU'}];
  for(let i=0;i<12;i++)sets.push({form:rnd(2)?'SUPER SAIYAN':'SAIYAN',weighted:!!rnd(2),level:1+rnd(99),hp:rnd(1000),maxHp:rnd(1000),
    power:[90000,81000,150000000,135000000][rnd(4)],strength:rnd(256),agility:rnd(101),constitution:rnd(101),intelligence:rnd(101),
    wisdom:rnd(101),attack:[4095,3686,8191,7372][rnd(4)],hit:rnd(101),defense:rnd(1000),evade:rnd(101),magicDefense:rnd(1000),
    mana:rnd(9),money:rnd(1<<24),name:['GOKU','A','KAKARO','BOY'][rnd(4)]});
  // The cartridge detects the page by four window corners in the tilemap
  // (status.asm ui_st_sig): no operation may draw over them.
  const SIG=[[0,1],[16,1],[0,14],[16,24]];
  for(const s of sets){
    for(const op of statusOps(s,s.name,formatPower)){
      let x0=400,x1=495,y1=op.y+1;
      if(op.k==='t'){const w=encodeText(op.text).length*8*op.scale;x0=(op.right?op.x-w:op.x)-1;x1=x0+w+1;y1=op.y+12;}
      for(const [cx,cy] of SIG)if(cx*16+15>=x0&&cx*16<=x1&&cy*8+8>=op.y&&cy*8+1<=y1)throw Error(`status gen: an operation covers the detection cell ${cx},${cy}`);
    }
  }
  for(const s of sets){
    const ref=statusPixels(rom,s,s.name),mine=raster(rom,statusOps(s,s.name,formatPower),encodeText);
    for(let i=0;i<ref.length;i++){
      const want=colourOf[ref[i]];
      if(want===undefined)throw Error(`status gen: statusPixels colour ${(ref[i]-1).toString(16)} not modelled`);
      if(want!==mine[i])throw Error(`status gen: native-status.js changed (pixel ${i%512},${i>>9})`);
    }
  }

  // 2. Palette for every set of colours a cell can hold (6 colours: 64
  //    sets). Sets that no palette holds take the one holding most of them;
  //    the colours left out show as their nearest colour in it.
  const dist=(a,b)=>{const ch=c=>[c&31,c>>5&31,c>>10&31];const [x,y]=[ch(a),ch(b)];return x.reduce((s,v,i)=>s+(v-y[i])**2,0);};
  const subsets=[];let conflicts=0;
  for(let set=0;set<64;set++){
    const cols=[1,2,3,4,5,6].filter(c=>set>>(c-1)&1);
    let best=null;
    for(const [pal,pc] of PALETTES){
      const held=cols.filter(c=>pc.includes(c)).length;
      if(!best||held>best.held)best={pal,pc,held};
    }
    if(best.held<cols.length)conflicts++;
    let map=0;
    for(const c of [1,2,3,4,5,6]){
      let idx=best.pc.indexOf(c)+1;
      if(!idx){let d=1e9;best.pc.forEach((p,i)=>{const e=dist(RGB[c],RGB[p]);if(e<d){d=e;idx=i+1;}});}
      map|=idx<<((c-1)*2);
    }
    subsets.push([best.pal,map]);
  }

  // 3. Tables.
  const ops=statusOps(sets[0],'GOKU',formatPower);
  const out=['; Generated by snes/gen/ui-status.mjs from engine/native-status.js. Do not edit.'];
  const dynIds=['name','level','hp','form','power','gi1','gi2','mana','money',...ROWS.map((_,i)=>`v${i}`)];
  // The cartridge places glyphs at byte boundaries (every text x, and so
  // every right-aligned start, a multiple of 8) and scales by 1 or 2.
  for(const op of ops)if(op.k==='t'&&(op.x%8||![1,2].includes(op.scale)))throw Error(`status gen: text ${JSON.stringify(op.text)} not byte aligned`);
  out.push('; per operation (!UI_ST_OP bytes): kind (0 text, 1 meter), colour, scale, flags (1 right-aligned),');
  out.push(';   x, y (hi-res pixels), source (fixed string at $8000+, or a dynamic string id; meters: row),');
  out.push(';   length of a fixed string, 0');
  out.push('ui_st_ops:');
  const fixed=[];
  for(const op of ops){
    if(op.k==='m'){out.push(`\tdb 1,0,0,0 : dw 400,${op.y},${Number(op.dyn.slice(1))} : db 0,0`);continue;}
    let src,len=0;
    if(op.dyn)src=`${dynIds.indexOf(op.dyn)}`;
    else{src=`ui_st_str_${fixed.length}`;fixed.push(op.text);len=encodeText(op.text).length;}
    out.push(`\tdb 0,${op.color},${op.scale},${op.right?1:0} : dw ${op.x},${op.y},${src} : db ${len},0  ; ${JSON.stringify(op.dyn?'<'+op.dyn+'>':op.text)}`);
  }
  // Operations per band of 8 lines (16x8 cell row), in drawing order: text
  // covers y .. y + 12 (outline), meters y .. y + 1. A band's BG rows show
  // page rows 8b + 1 .. 8b + 8: the browser paints its raster from scanline
  // 1 (native-status.js getColor(sub,x,line)), so screen row s shows raster
  // row s + 1, as the native window tiles (one row above the ROM's) do.
  const bands=[];
  for(let b=0;b<28;b++){
    const list=[];
    ops.forEach((op,i)=>{const y1=op.y+(op.k==='m'?1:12);if(op.y<=b*8+8&&y1>=b*8+1)list.push(i);});
    if(list.length>8)throw Error(`status gen: ${list.length} operations in band ${b} (8 at most)`);
    bands.push(list);
  }
  out.push('ui_st_bands:   ; per band: its operation list');
  out.push('\tdw '+bands.map((_,b)=>`ui_st_band_${b}`).join(','));
  bands.forEach((list,b)=>out.push(`ui_st_band_${b}: dw ${[...list.map(i=>i*12),0xffff].map(v=>hex(v,4)).join(',')}`));
  fixed.forEach((t,i)=>out.push(`ui_st_str_${i}: db ${[...encodeText(t),0].map(b=>hex(b)).join(',')}`));
  const enc=t=>`db ${[...encodeText(t),0].map(b=>hex(b)).join(',')}`;
  out.push(`ui_st_saiyan: ${enc('SAIYAN')}`);
  out.push(`ui_st_super: ${enc('SUPER SAIYAN')}`);
  out.push(`ui_st_gi_on1: ${enc('HEAVY GI / TRAINING')}`);
  out.push(`ui_st_gi_on2: ${enc('POWER -10%  AGILITY -20%')}`);
  out.push(`ui_st_gi_off1: ${enc('WEIGHTS OFF')}`);
  out.push(`ui_st_gi_off2: ${enc('NO TRAINING PENALTY')}`);
  out.push(`ui_st_mana: ${enc('MANA ')}`);
  out.push(`ui_st_gp: ${enc(' GP')}`);
  out.push('; stat rows: WRAM address, bytes (1/2), meter maximum');
  const statAddr={strength:0xe188,agility:0xe189,constitution:0xe18a,intelligence:0xe18b,wisdom:0xe18c,
    attack:0,hit:0xe197,defense:0xe1a5,evade:0xe1a4,magicDefense:0xe1a8};
  const statWide={defense:2,magicDefense:2};
  out.push('ui_st_rows:');
  for(const [,key,max] of ROWS)out.push(`\tdw ${hex(statAddr[key],4)},${statWide[key]??1},${max}  ; ${key}`);
  // The page's windows as the browser shows them (the native window tiles
  // differ at the bottoms): every cell holding window pixels (BG rows: page
  // rows + 1) gets one of a few static tile pairs, palette 0 (the game's black,
  // grey, white), uploaded with the tilemap when the page is taken over;
  // every other cell is tile 0 (blank). Priority as the game's windows.
  const WTILE0=0x40,win=windowRaster(rom),patterns=new Map(),wtiles=[];
  const map=new Uint8Array(32*28*2);
  for(let cy=0;cy<28;cy++)for(let cx=0;cx<32;cx++){
    const px=[];
    for(let r=0;r<8;r++)for(let x=0;x<16;x++){const y=cy*8+r+1;px.push(y<224?win[y*512+cx*16+x]:0);}
    if(!px.some(v=>v))continue;
    const key=px.join('');
    if(!patterns.has(key)){
      patterns.set(key,patterns.size);
      for(const half of [0,1])for(let r=0;r<8;r++){
        let p0=0,p1=0;
        for(let x=0;x<8;x++){const v=px[r*16+half*8+x];p0|=(v&1)<<(7-x);p1|=(v>>1&1)<<(7-x);}
        wtiles.push(p0,p1);
      }
    }
    const w=(WTILE0+patterns.get(key)*2)|0x2000;
    map[(cy*32+cx)*2]=w&255;map[(cy*32+cx)*2+1]=w>>8;
  }
  xdata('ui_status_wintiles',Uint8Array.from(wtiles));
  xdata('ui_status_map',map);
  // the detection cells (status.asm ui_st_sig) once the page is taken over
  const sigWords=SIG.map(([cx,cy])=>{const k=(cy*32+cx)*2,w=map[k]|map[k+1]<<8;if(!w)throw Error(`status gen: detection cell ${cx},${cy} blank`);return w;});
  out.push('ui_st_subsets: ; per colour set (bit c-1 = colour c): colour -> index (2 bits each) | palette << 12');
  for(let i=0;i<64;i+=8)out.push('\tdw '+subsets.slice(i,i+8).map(([p,m])=>hex(m|p<<12,4)).join(','));
  out.push('ui_st_cgram:   ; CGRAM 16-31 (BG2 palettes 4-7)');
  for(const [pal,pc] of PALETTES.slice(1))out.push(`\tdw 0,${pc.map(c=>hex(RGB[c],4)).join(',')}  ; palette ${pal}`);
  writeFileSync(join(outDir,'status.asm'),out.join('\n')+'\n');
  const def=['; Generated by snes/gen/ui-status.mjs. Do not edit.'];
  def.push(`!UI_ST_OPS = ${ops.length}`);
  def.push(`!UI_ST_OP = 12               ; bytes per operation`);
  def.push(`!UI_ST_BAND_OPS = ${Math.max(...bands.map(l=>l.length))}         ; most operations in one band`);
  dynIds.forEach((d,i)=>def.push(`!UI_ST_DYN_${d.toUpperCase()} = ${i}`));
  def.push(`!UI_ST_DYNS = ${dynIds.length}`);
  def.push(`!UI_ST_FONT = $D2D600     ; 8x12 font, 12 bytes per code (PC 0x12D600)`);
  def.push(`!UI_ST_WIN = $D2D080      ; window tiles (PC 0x12D080)`);
  // a code whose 12 font rows are blank (cells beyond a string read it)
  const blank=[0x80,...Array.from({length:256},(_,i)=>i)].find(c=>rom.slice(FONT+c*12,FONT+c*12+12).every(b=>!b));
  if(blank===undefined)throw Error('status gen: no blank glyph in the font');
  def.push(`!UI_ST_BLANK = ${hex(blank*12,4)}       ; font offset of a blank glyph (code ${hex(blank)})`);
  def.push(`!UI_ST_TILE0 = ${hex(WTILE0,3)}           ; the windows' tile pairs, then the composed cells'`);
  def.push(`!UI_ST_WTILES = ${wtiles.length/16}          ; window tiles (${patterns.size} cells)`);
  sigWords.forEach((w,i)=>def.push(`!UI_ST_SIG${i} = ${hex(w,4)}`));
  def.push(`!UI_ST_CONFLICT_SETS = ${conflicts}`);
  writeFileSync(join(outDir,'defines.asm'),def.join('\n')+'\n');
}
