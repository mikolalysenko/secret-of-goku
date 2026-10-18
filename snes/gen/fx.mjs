// Effects library data for the cartridge (snes/src/modules/fx).
//
// Single source of truth: the original spell cells in the verified ROM, at
// the offsets the browser mod's manifests record (engine/native-effects.json,
// native-combustion-data.js, native-dark-force.js), recoloured and assembled
// exactly as engine/native-effects.js, orbit-effects.js, death-ball-art.js
// and sprite-layer.js do at load time. No art is stored in the repository.
//
// Outputs (dist/snes/gen/fx/):
//   cells.bin   16x16 OBJ cells, 128 bytes each (TL,TR,BL,BR 4bpp tiles)
//   data.asm    palettes, cell classes, assemblies and lookup tables
//   preview.png every cell in its palette (not shipped)
//
// Terms: a *cell* is one 16x16 OBJ worth of pixels in one palette class; an
// *assembly* is a list of parts (cell, x, y, flips) relative to the effect's
// anchor, so a quarter-turned or multi-cell picture is one table entry.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeTile,writePng,blank} from '../tools/gfx.mjs';

export const FX_BANK=0xFC;
const CELL_BYTES=128;

// Pixels are 0 (transparent) or 1+BGR555, as engine/native-effects.js.
const luma=c=>{c--;return(c&31)*3+(c>>5&31)*6+(c>>10&31);};
const rgb=([r,g,b])=>1+r+(g<<5)+(b<<10);

class Asm{
  constructor(){this.lines=[];}
  label(l){this.lines.push(`${l}:`);}
  db(a){for(let i=0;i<a.length;i+=16)this.lines.push('\tdb '+a.slice(i,i+16).map(v=>'$'+(v&255).toString(16).toUpperCase().padStart(2,'0')).join(','));}
  dw(a){for(let i=0;i<a.length;i+=12)this.lines.push('\tdw '+a.slice(i,i+12).map(v=>'$'+(v&0xffff).toString(16).toUpperCase().padStart(4,'0')).join(','));}
  def(n,v){this.lines.push(`!${n} = $${v.toString(16).toUpperCase()}`);}
  raw(s){this.lines.push(s);}
  text(){return this.lines.join('\n')+'\n';}
}

// --- pixel helpers ----------------------------------------------------------
const img=(w,h)=>({w,h,px:new Uint16Array(w*h)});
const rot1=p=>{ // r1(qx,qy) = p(qy, 15-qx): the browser's (dx,dy)=(0,1) turn
  const o=new Uint16Array(256);
  for(let qy=0;qy<16;qy++)for(let qx=0;qx<16;qx++)o[qy*16+qx]=p[(15-qx)*16+qy];
  return o;
};
const recolor=(p,f)=>p.map(c=>c?f(c):0);
const empty=p=>p.every(c=>!c);

export async function generate({rom,repo,outDir,xdata}){
  const eng=f=>import(pathToFileURL(join(repo,'engine',f)).href);
  const {decodeEffectFrame,decodeEffectTile}=await eng('native-effects.js');
  const {createChargeLightning}=await eng('charge-lightning.js');
  const {combustionCells,combustionFrames}=await eng('native-combustion-data.js');
  const {friezaKiPalette,drawKiAura}=await eng('ki-aura.js');
  const {createDeathBallArt,deathBallSizes}=await eng('death-ball-art.js');
  const {trainingBeamPalettes}=await eng('vegeta-clash.js');
  const manifest=JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8'));

  const decode=(frame,palette=frame.palette)=>{
    const {rgba}=decodeEffectFrame(rom,{...frame,palette}),px=new Uint16Array(256);
    for(let i=0;i<256;i++)if(rgba[i*4+3])px[i]=1+((rgba[i*4]>>3)|((rgba[i*4+1]>>3)<<5)|((rgba[i*4+2]>>3)<<10));
    return px;
  };

  // --- groups (engine/native-effects.js createNativeEffects) ---------------
  const groups={};
  const put=(g,p)=>(groups[g]??=[]).push(p);
  const goldPal=manifest.frames.find(f=>f.group==='gold-spark').palette;
  const bluePal=manifest.frames.find(f=>f.group==='charge-orb').palette;
  // Thunderbolt's yellow ramp ($11FBA0) is shown with Lucid Barrier's gold
  // ramp (same five steps of brightness), so lightning shares the gold
  // palette class: two OBJ palettes then cover a Super Saiyan charge.
  const thunderYellow=0x11FBA0;
  for(const frame of manifest.frames){
    const yellow=['lightning','lightning-impact'].includes(frame.group)&&frame.palette.romOffset===thunderYellow;
    put(frame.group,yellow?decode(frame,goldPal):decode(frame));
    if(['charge-orb','beam-body','beam-head'].includes(frame.group))put('gold-'+frame.group,decode(frame,goldPal));
    if(frame.group==='gold-arc')put('aura-arc',decode(frame,bluePal));
  }
  // engine/orbit-effects.js pinkColor / fireColor
  const pink=c=>friezaKiPalette[Math.min(4,Math.floor(luma(c)*4/310))];
  for(const g of['charge-orb','beam-body','beam-head','impact-spark','lightning','gold-charge-orb'])
    groups['pink-'+g]=groups[g].map(p=>recolor(p,pink));
  const firePalette=Array.from({length:5},(_,i)=>{const at=combustionCells[22].palette.romOffset+i*2;return 1+(rom[at]|rom[at+1]<<8);}).sort((a,b)=>luma(a)-luma(b));
  const beamColors=[...new Set(groups['beam-body'].flatMap(p=>[...p]))].filter(Boolean).sort((a,b)=>luma(a)-luma(b));
  const fireMap=new Map(beamColors.map((v,i)=>[v,firePalette[Math.round(i*4/Math.max(1,beamColors.length-1))]]));
  groups['fire-beam-body']=groups['beam-body'].map(p=>recolor(p,c=>fireMap.get(c)??c));

  // Combustion cells (engine/native-combustion.js) and Dark Force particles.
  const combustion=combustionCells.map(frame=>decode(frame));
  const deathArt=createDeathBallArt(rom);
  const deathSmall=[];
  for(let f=0;f<12;f++){const p=new Uint16Array(256);deathArt(f,8,8,16,(x,y,c)=>{if(x>=0&&y>=0&&x<16&&y<16)p[y*16+x]=c;});deathSmall.push(p);}
  const death32=[];
  for(let f=0;f<12;f++){const p=new Uint16Array(1024);deathArt(f,16,16,32,(x,y,c)=>{if(x>=0&&y>=0&&x<32&&y<32)p[y*32+x]=c;});death32.push(p);}

  // --- palette classes -------------------------------------------------------
  // Each class is one 15-colour OBJ palette; FX maps classes to free OBJ
  // palettes per frame (a town often leaves only two free). Grouped so the
  // usual combinations need two: BLUE (Kamehameha, ki, impacts) + GOLD
  // (Super Saiyan sparks, ring and charge lightning); FIRE (explosions);
  // PINK (Frieza: lasers, discs, Death Balls). DYN holds caller colours
  // (debris) at indices 1-3; WHITE is an override (all entries white).
  const CLASS=['BLUE','PINK','GOLD','FIRE','DYN','WHITE'];
  const classColors=CLASS.map(()=>new Set());
  const classOf={};
  const assign=(names,k)=>{for(const n of names){classOf[n]=k;for(const p of groups[n]??[])for(const c of p)if(c)classColors[k].add(c);}};
  assign(['charge-orb','beam-body','beam-head','impact-spark','aura-arc'],0);
  assign(['pink-charge-orb','pink-beam-body','pink-beam-head','pink-impact-spark','pink-lightning','pink-gold-charge-orb'],1);
  assign(['gold-spark','gold-arc','gold-charge-orb','gold-beam-body','gold-beam-head','lightning','lightning-impact'],2);
  for(const p of deathSmall)for(const c of p)if(c)classColors[1].add(c);
  for(const p of death32)for(const c of p)if(c)classColors[1].add(c);
  for(const c of friezaKiPalette)classColors[1].add(c);
  assign(['fire-beam-body'],3);
  for(const p of combustion)for(const c of p)if(c)classColors[3].add(c);
  const palettes=classColors.map((set,k)=>{
    if(CLASS[k]==='WHITE')return Array(15).fill(0x8000); // override: any cell drawn all white
    const list=[...set].sort((a,b)=>luma(a)-luma(b));
    if(list.length>15)throw Error(`fx: palette class ${CLASS[k]} has ${list.length} colours`);
    return list;
  });
  const indexIn=(k,c)=>{if(!c)return 0;const i=palettes[k].indexOf(c);if(i<0)throw Error(`fx: colour ${c-1} not in class ${CLASS[k]}`);return i+1;};

  // --- cells -----------------------------------------------------------------
  const cells=[];                 // {px (1+555), cls, key}
  const cellIndex=new Map();      // dedupe by class+pixels
  const addCell=(px,cls,key)=>{
    if(empty(px))return -1;
    const sig=cls+':'+Buffer.from(px.buffer,px.byteOffset,px.byteLength).toString('base64');
    if(cellIndex.has(sig))return cellIndex.get(sig);
    const id=cells.length;cells.push({px,cls,key});cellIndex.set(sig,id);return id;
  };
  // Each source cell gets its r0 and r1 (quarter-turn) variants.
  const cellPair=(px,cls,key)=>({r0:addCell(px,cls,key),r1:addCell(rot1(px),cls,key+'/r1')});

  // --- assemblies ----------------------------------------------------------
  // Part: {pair:{r0,r1}, ox, oy, fx, fy} at turn 0, ox/oy = sprite top-left
  // relative to the anchor. turn t applies the browser's quarter turn
  // (u,v) -> t0 (u,v), t1 (-v,u), t2 (-u,-v), t3 (v,-u).
  const asms=[];
  const turnPart=(p,t)=>{
    if(t===0)return {cell:p.pair.r0,x:p.ox,y:p.oy,h:p.fx,v:p.fy};
    if(t===2)return {cell:p.pair.r0,x:-p.ox-15,y:-p.oy-15,h:!p.fx,v:!p.fy};
    if(t===1)return {cell:p.pair.r1,x:-p.oy-15,y:p.ox,h:p.fy,v:p.fx};
    return {cell:p.pair.r1,x:p.oy,y:-p.ox-15,h:!p.fy,v:!p.fx};
  };
  const addAsm=(parts,t)=>{asms.push(parts.map(p=>turnPart(p,t)).filter(p=>p.cell>=0));return asms.length-1;};
  const addTurns=parts=>{const base=asms.length;for(let t=0;t<4;t++)addAsm(parts,t);return base;};

  // Stamp groups: frame f, turn t -> asm base + f*4 + t. Order = FX_G_* ids.
  const STAMP_GROUPS=['charge-orb','beam-body','beam-head','impact-spark','lightning','lightning-impact',
    'gold-spark','gold-arc','aura-arc',
    'gold-charge-orb','gold-beam-body','gold-beam-head',
    'pink-charge-orb','pink-beam-body','pink-beam-head','pink-impact-spark','pink-lightning','pink-gold-charge-orb',
    'fire-beam-body'];
  const stampBase=[],stampFrames=[];
  for(const g of STAMP_GROUPS){
    stampBase.push(asms.length);stampFrames.push(groups[g].length);
    groups[g].forEach((px,f)=>addTurns([{pair:cellPair(px,classOf[g],`${g}#${f}`),ox:-8,oy:-8,fx:false,fy:false}]));
  }

  // Beam strip band unions (sprite-layer.js: bands at round((b-(n-1)/2)*3),
  // later bands drawn over earlier ones), per frame. Blue (Kamehameha) has
  // every band count 1-7; Frieza's pink and the Fireball strip (orbit
  // beams) keep 1, 3 and 5 and round other widths to the nearest.
  const BAND_SETS=[['beam-body',0,[1,2,3,4,5,6,7]],['pink-beam-body',1,[1,3,5]],['fire-beam-body',3,[1,3,5]]];
  const bandIndex=[];                   // ((set*2+frame)*7 + n-1)*4 + turn -> assembly
  // Strip lines for the left/right polygon (poly.asm fx_poly_strip): per
  // band union and half turn (right, left) the offset of its first
  // coloured line from the palms' line, the line count and each line's
  // colour index in the set's class (0: none). The polygon draws one
  // colour per line, so every row of a union must be one colour across the
  // cell (asserted). A half turn maps the offset v to -v (pixel centres).
  const stripPtr=[],stripData=[],stripSeen=new Map();
  const stripRec=(rows,first)=>{
    let a=0,b=rows.length-1;
    while(a<=b&&!rows[a])a++;
    while(b>=a&&!rows[b])b--;
    const rec=a>b?[0,0]:[(first+a)&255,b-a+1,...rows.slice(a,b+1)];
    const key=rec.join(',');
    if(!stripSeen.has(key)){stripSeen.set(key,stripData.length);stripData.push(...rec);}
    return stripSeen.get(key);
  };
  for(const [g,cls,counts] of BAND_SETS)for(let f=0;f<2;f++){
    const made={},madeRows={};
    for(const n of counts){
      const src=groups[g][f],canvas=new Uint16Array(16*32); // rows v=-16..15
      for(let b=0;b<n;b++){
        const across=Math.round((b-(n-1)/2)*3);
        for(let y=0;y<16;y++)for(let x=0;x<16;x++){const c=src[y*16+x];if(!c)continue;const row=y-8+across+16;if(row>=0&&row<32)canvas[row*16+x]=c;}
      }
      const parts=[];
      if(n<=5)parts.push({pair:cellPair(canvas.slice(8*16,24*16),cls,`${g}#${f}x${n}`),ox:-8,oy:-8,fx:false,fy:false});
      else{
        parts.push({pair:cellPair(canvas.slice(0,256),cls,`${g}#${f}x${n}t`),ox:-8,oy:-16,fx:false,fy:false});
        parts.push({pair:cellPair(canvas.slice(256),cls,`${g}#${f}x${n}b`),ox:-8,oy:0,fx:false,fy:false});
      }
      made[n]=addTurns(parts);
      const top=n<=5?8:0,h=n<=5?16:32,rows=[];   // canvas rows the parts cover
      for(let r=top;r<top+h;r++){
        const line=canvas.slice(r*16,r*16+16),c=line[0];
        if(line.some(v=>v!==c))throw Error(`fx: ${g} frame ${f} x${n} row ${r} is not one colour`);
        rows.push(indexIn(cls,c));
      }
      madeRows[n]=[stripRec(rows,top-16),stripRec([...rows].reverse(),-(top-16+h-1))];
    }
    for(let n=1;n<=7;n++){
      const near=counts.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);
      for(let t=0;t<4;t++)bandIndex.push(made[near]+t);
      stripPtr.push(...madeRows[near]);
    }
  }

  // Exploder bursts and Fireball embers (native-combustion.js draw(): part
  // flips, optional mirror, quarter turns). burst: (frame*2+mirror)*4+turn.
  const combPairs=combustion.map((px,i)=>cellPair(px,3,`comb#${i}`));
  const burstBase=asms.length;
  combustionFrames.burst.forEach(parts=>{for(const mirror of[false,true]){
    addTurns(parts.map(p=>mirror
      ?{pair:combPairs[p.cell],ox:-p.x-15,oy:p.y,fx:!p.flipX,fy:!!p.flipY}
      :{pair:combPairs[p.cell],ox:p.x,oy:p.y,fx:!!p.flipX,fy:!!p.flipY}));
  }});
  const emberBase=asms.length;
  combustionFrames.ember.forEach(parts=>addTurns(parts.map(p=>({pair:combPairs[p.cell],ox:p.x,oy:p.y,fx:!!p.flipX,fy:!!p.flipY}))));

  // Death Balls (death-ball-art.js): 16 px (one cell) and 32 px (four).
  const deathBase=asms.length;
  for(const p of deathSmall)asms.push([{cell:addCell(p,1,'death16'),x:-8,y:-8,h:false,v:false}].filter(q=>q.cell>=0));
  const death32Base=asms.length;
  for(const p of death32){
    const parts=[];
    for(let q=0;q<4;q++){const qx=(q&1)*16,qy=(q>>1)*16,c=new Uint16Array(256);
      for(let y=0;y<16;y++)for(let x=0;x<16;x++)c[y*16+x]=p[(qy+y)*32+qx+x];
      const id=addCell(c,1,'death32');if(id>=0)parts.push({cell:id,x:qx-16,y:qy-16,h:false,v:false});}
    asms.push(parts);
  }
  // Death Disc (orbit-effects.js disc): 20x6 from gold-charge-orb[4], pink,
  // tilt -1/0/1 (age>>3)&3 -> [0,1,0,-1].
  const discBase=asms.length;
  const discSrc=groups['gold-charge-orb'][4];
  for(const tilt of[0,1,-1]){
    const canvas=new Uint16Array(32*16); // x -16..15, y -8..7
    for(let py=0;py<6;py++)for(let px=0;px<20;px++){
      const c=discSrc[Math.floor((py+.5)*16/6)*16+Math.floor(px*16/20)];if(!c)continue;
      const x=px-10+16,y=py-3+((px-10)>>2)*tilt+8;if(x>=0&&x<32&&y>=0&&y<16)canvas[y*32+x]=pink(c);
    }
    const parts=[];
    for(let q=0;q<2;q++){const c=new Uint16Array(256);for(let y=0;y<16;y++)for(let x=0;x<16;x++)c[y*16+x]=canvas[y*32+q*16+x];
      const id=addCell(c,1,'disc');if(id>=0)parts.push({cell:id,x:q*16-16,y:-8,h:false,v:false});}
    asms.push(parts);
  }
  // Finger-laser glint (fingerCharge): charge-orb[(age>>3)&1] at 2:1, pink.
  const fingerBase=asms.length;
  for(let f=0;f<2;f++){
    const src=groups['charge-orb'][f],c=new Uint16Array(256);
    for(let py=0;py<8;py++)for(let px=0;px<8;px++){const v=src[py*32+px*2];if(v)c[(py+4)*16+px+4]=pink(v);}
    asms.push([{cell:addCell(c,1,'finger'),x:-8,y:-8,h:false,v:false}].filter(q=>q.cell>=0));
  }
  // Death Beam (orbit-effects.js beam(x,y,xx,yy,1,age,'pink')): the pixels
  // with |v| <= 1 across and u >= 0 along (u, v from orbitVectors, >> 8),
  // v = 0 white, v = -1 / +1 the pinks of Lucent Beam's strip rows 6 / 8 in
  // frame (age >> 2) & 1. Headings 0-3 here; their quarter turns are the
  // other twelve (the rasterisation turns with them exactly). A 16x16
  // window steps along the beam by LSTEP: window 0 holds the finger end
  // (u >= 0), window 1 the body, which repeats. Headings 0 and 2 repeat
  // exactly; 1 and 3 drift from the browser's line by under a pixel over
  // 360 px (asserted below against the browser's pixels).
  const LV=[[256,0],[229,114],[181,181],[114,229]];
  const LSTEP=[[16,0],[16,8],[8,8],[8,16]];
  const LORG=[[0,-8],[0,-3],[-7,-8],[-3,0]];   // window 0, top-left from the finger
  const laserBase=asms.length,laserDrift=[];    // ((heading*2 + frame)*2 + body)*4 + turn
  for(let h=0;h<4;h++)for(let f=0;f<2;f++){
    const [vx,vy]=LV[h],src=groups['pink-beam-body'][f];
    const colour=(ox,oy)=>{
      const u=(ox*vx+oy*vy)>>8,v=(-ox*vy+oy*vx)>>8;
      return u<0||v<-1||v>1?0:v===0?0x8000:src[(v<0?6:8)*16];
    };
    const windowPx=j=>{
      const px=new Uint16Array(256),wx=LORG[h][0]+LSTEP[h][0]*j,wy=LORG[h][1]+LSTEP[h][1]*j;
      for(let y=0;y<16;y++)for(let x=0;x<16;x++)px[y*16+x]=colour(wx+x,wy+y);
      return px;
    };
    const start=windowPx(0),body=windowPx(1);
    // What the cartridge draws (window 0, then window 1 repeated) against
    // the browser's pixels over 360 px.
    const drawn=new Map();
    for(let j=0;j<=24;j++){
      const px=j?body:start,wx=LORG[h][0]+LSTEP[h][0]*j,wy=LORG[h][1]+LSTEP[h][1]*j;
      for(let i=0;i<256;i++)if(px[i])drawn.set((wx+(i&15))+','+(wy+(i>>4)),px[i]);
    }
    let miss=0,extra=0;
    const far=Math.min(360,((LSTEP[h][0]*vx+LSTEP[h][1]*vy)*23)>>8);
    for(let oy=-40;oy<=400;oy++)for(let ox=-40;ox<=400;ox++){
      if(((ox*vx+oy*vy)>>8)>far)continue;
      const want=colour(ox,oy),got=drawn.get(ox+','+oy)??0;
      if(want&&got!==want)miss++;else if(!want&&got)extra++;
    }
    if((h===0||h===2)&&(miss||extra))throw Error(`fx: laser heading ${h} differs from the browser (${miss}/${extra})`);
    laserDrift.push(miss+extra);
    for(const px of[start,body])
      addTurns([{pair:cellPair(px,1,`laser#${h}.${f}`),ox:LORG[h][0],oy:LORG[h][1],fx:false,fy:false}]);
  }
  // Headings 0 / 8 as three polygon lines (fx_poly_laser): v = y - finger
  // to the right, finger - y to the left; strip records after the bands'.
  const laserStrip=stripPtr.length;
  for(let f=0;f<2;f++){
    const src=groups['pink-beam-body'][f],minus=indexIn(1,src[6*16]),core=indexIn(1,0x8000),plus=indexIn(1,src[8*16]);
    stripPtr.push(stripRec([minus,core,plus],-1),stripRec([plus,core,minus],-1));
  }
  // Steps per heading 0-15 (quarter turns of LSTEP) and the u length of a
  // step (16ths of a pixel) for the beam's reach.
  const laserStep=[],laserLen=[];
  for(let H=0;H<16;H++){
    let [sx,sy]=LSTEP[H&3];
    for(let t=0;t<(H>>2);t++)[sx,sy]=[-sy,sx];
    laserStep.push(sx&255,sy&255);
  }
  for(let h=0;h<4;h++)laserLen.push(Math.floor((LSTEP[h][0]*LV[h][0]+LSTEP[h][1]*LV[h][1])/64)); // quarter pixels
  // Debris chunks in caller colours (DYN indices 1 dark, 2 mid, 3 light):
  // rubble (sprite-layer.js rubble(): size 2/3, pattern turn%3) and ceiling
  // dust (ceiling-escape.js: size 2-4, gap where (x+y+turn)&7 == 0).
  const DYN=4;
  const rubbleBase=asms.length;
  for(const size of[2,3])for(let turn=0;turn<3;turn++){
    const c=new Uint16Array(256);
    for(let y=-size;y<=size;y++)for(let x=-size;x<=size;x++){
      if(Math.abs(x)+Math.abs(y)>size+1||x===-size&&y===0)continue;
      c[(y+8)*16+x+8]=1+(((x+y+turn)%3+3)%3===0?1:y<0?2:0);
    }
    asms.push([{cell:addCell(c,DYN,'rubble'),x:-8,y:-8,h:false,v:false}]);
  }
  const dustBase=asms.length;
  for(const size of[2,3,4])for(let turn=0;turn<8;turn++){
    const c=new Uint16Array(256);
    for(let y=-size;y<=size;y++)for(let x=-size;x<=size;x++){
      if(Math.abs(x)+Math.abs(y)>size+1||((x+y+turn)&7)===0)continue;
      c[(y+8)*16+x+8]=1+(y<0?2:x<0?1:0);
    }
    asms.push([{cell:addCell(c,DYN,'dust'),x:-8,y:-8,h:false,v:false}]);
  }

  // Status-burst shell fragments (sprite-layer.js statusBurst): 5x5 crop of
  // impact-spark[1] (ice) and 3x3 crop of impact-spark[2] (balloon) at
  // (6,6), drawn from their top-left corner.
  const fragBase=asms.length;
  for(const [f,size] of[[1,5],[2,3]]){
    const src=groups['impact-spark'][f],c=new Uint16Array(256);
    for(let py=0;py<size;py++)for(let px=0;px<size;px++)c[py*16+px]=src[(py+6)*16+px+6];
    asms.push([{cell:addCell(c,0,'fragment'),x:0,y:0,h:false,v:false}].filter(q=>q.cell>=0));
  }

  // --- composite assemblies -------------------------------------------------
  // Whole pictures the browser draws from many stamps (rings, spark bursts,
  // status bursts, the detonation) become one assembly per age, so the
  // cartridge only copies parts. Offsets keep the browser's float rounding.
  const stampAsm=(g,f,t)=>{const i=STAMP_GROUPS.indexOf(g);const n=stampFrames[i];return stampBase[i]+(((f%n)+n)%n)*4+t;};
  const shifted=(id,dx,dy,cls=null)=>asms[id].map(p=>({...p,x:p.x+dx,y:p.y+dy,cls}));
  const WHITE=CLASS.indexOf('WHITE');
  // powerBurst / statusBurst ring (sprite-layer.js): radius R+1.5*age, 16
  // cells while age<8 then 8, turned by round(i*4/count)%4; inner sparks at
  // .45 radius while age<5. The browser uses frame phase+i for every cell;
  // here neighbours alternate phase / phase+1 (sparks) and the gold-arc
  // frames (palette rotations of one cell) stay fixed, so a ring needs at
  // most six cells at once, within what one vblank can upload.
  const ringParts=(R,gold,age,compact=false)=>{
    const count=age<8?(compact?8:16):(compact?4:8),rad=R+age*1.5,phase=age>>1,parts=[];
    const outer=age<8?(gold?'gold-arc':'aura-arc'):(gold?'gold-spark':'impact-spark'),spark=gold?'gold-spark':'impact-spark';
    for(let i=0;i<count;i++){
      const a=i*Math.PI*2/count,dx=Math.cos(a),dy=Math.sin(a),turn=Math.round(i*4/count)%4;
      parts.push(...shifted(stampAsm(outer,(age<8?0:phase)+(i&1),turn),Math.round(dx*rad),Math.round(dy*rad)));
      if(age<5&&(!compact||i%2===0))parts.push(...shifted(stampAsm(spark,phase+(i&1),0),Math.round(dx*rad*.45),Math.round(dy*rad*.45)));
    }
    return parts;
  };
  const ringBase=asms.length;            // ((R16 ? 2 : 0) + gold) * 14 + age
  for(const R of[56,16])for(const gold of[false,true])for(let age=0;age<14;age++)asms.push(ringParts(R,gold,age));
  // Native gameplay keeps the expanding ring, with eight arcs and four
  // inner sparks instead of 32 overlapping sprites at the reveal's peak.
  const compactRingBase=asms.length;
  for(const R of[56,16])for(const gold of[false,true])for(let age=0;age<14;age++)asms.push(ringParts(R,gold,age,true));
  // Ceiling-escape impact ring (ceiling-escape.js): 8 sparks, spread 5+1.7*age.
  const sparksBase=asms.length;
  for(let age=0;age<12;age++){const parts=[];
    for(let i=0;i<8;i++){const a=i*Math.PI/4,spread=5+age*1.7;parts.push(...shifted(stampAsm('impact-spark',Math.min(5,age>>2),0),Math.round(Math.cos(a)*spread),Math.round(Math.sin(a)*spread*.6)));}
    asms.push(parts);}
  // statusBurst shells (sprite-layer.js). Fire: Exploder burst age>>1 while
  // age<14, eight embers. Ice / balloon: impact spark age>>1 while age<12
  // (balloon 18 px up), eight fragments. The 16 px ring is drawn separately.
  const dirs8=[[0,-4],[3,-3],[4,0],[3,2],[0,3],[-3,2],[-4,0],[-3,-3]];
  const statusBase=asms.length;         // (shell-1)*28 + age
  for(const shell of['fire','ice','balloon'])for(let age=0;age<28;age++){
    const parts=[];
    if(shell==='fire'){
      if(age<14)parts.push(...shifted(burstBase+((age>>1)*2)*4,0,0));
      dirs8.forEach(([dx,dy],i)=>{if(age<26-i)parts.push(...shifted(emberBase+Math.min(2,age>>3)*4+(i&3),Math.trunc(dx*(age+3)/3),Math.trunc(dy*(age+3)/3)-(age>>2)));});
    }else{
      const cy=shell==='balloon'?-18:0;
      if(age<12)parts.push(...shifted(stampAsm('impact-spark',age>>1,0),0,cy));
      for(const[dx,dy]of dirs8)parts.push(...shifted(fragBase+(shell==='ice'?0:1),Math.trunc(dx*age/3),cy+Math.trunc(dy*age/3)+(age*age>>6)));
    }
    asms.push(parts);
  }
  // Beam detonation (beam-detonation.js beamDetonationParts), 132 frames,
  // stored for even ages (shown for two frames each) as groups of
  // (Exploder / ember assembly, x, y); the first five frames are white.
  const {beamDetonationParts,beamDetonationFrames}=await eng('beam-detonation.js');
  const detGroups=[];
  for(let age=0;age<beamDetonationFrames;age+=2){
    detGroups.push(beamDetonationParts(age).map(p=>({
      asm:p.kind==='burst'?burstBase+(p.frame*2+(p.flip?1:0))*4+p.turn:emberBase+p.frame*4+p.turn,
      x:p.x,y:p.y,white:!!p.white})));
  }

  // --- encode ------------------------------------------------------------------
  // Compact gameplay aura: two mini cells or six full-size cells. A second
  // pose mirrors the same resident tiles, so animation needs no new DMA.
  // Ordinary OBJ transparency never changes the backdrop under cut grass.
  const auraSpriteBase=asms.length,auraSprites=[];
  const auraEffects={'charge-orb':groups['charge-orb'],'gold-arc':groups['gold-arc']};
  for(const [tone,cls] of [['blue',0],['gold',2],['pink',1]])for(const mini of [true,false]){
    const w=mini?16:32,h=mini?32:48,oy=(mini?8:16)-h,source=new Map();
    drawKiAura(auraEffects,0,0,9,(x,y,c)=>source.set(`${x},${y}`,c),{tone,power:1,height:mini?16:32,clock:0});
    const xy=[...source.keys()].map(k=>k.split(',').map(Number));
    const x0=Math.min(...xy.map(p=>p[0])),x1=Math.max(...xy.map(p=>p[0]));
    const y0=Math.min(...xy.map(p=>p[1])),y1=Math.max(...xy.map(p=>p[1]));
    const px=new Uint16Array(w*h),parts=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)
      px[y*w+x]=source.get(`${x0+Math.floor(x*(x1-x0+1)/w)},${y0+Math.floor(y*(y1-y0+1)/h)}`)??0;
    // Mirror the full-size flame around Goku. Three resident cells supply
    // both sides, halving cache resolution and upload work without making
    // the aura narrower. Retain the outermost tongue on either side.
    if(!mini)for(let y=0;y<h;y++)for(let x=0;x<w/2;x++){
      const c=px[y*w+x]||px[y*w+w-1-x];px[y*w+x]=c;px[y*w+w-1-x]=c;
    }
    for(let y=0;y<h;y+=16)for(let x=0;x<(mini?w:w/2);x+=16){
      const tile=new Uint16Array(256);
      for(let j=0;j<16;j++)tile.set(px.subarray((y+j)*w+x,(y+j)*w+x+16),j*16);
      const cell=addCell(tile,cls,`aura-${tone}-${mini?'mini':'full'}-${x}-${y}`);
      if(cell>=0){
        parts.push({cell,x:x-w/2,y:y+oy,h:false,v:false});
        if(!mini)parts.push({cell,x:w/2-x-16,y:y+oy,h:true,v:false});
      }
    }
    asms.push(parts,parts.map(p=>mini?({...p,x:-p.x-16,h:!p.h}):({...p,y:p.y-1})));
    auraSprites.push({tone,w,h,x:-w/2,y:oy,px:[...px]});
  }
  writeFileSync(join(outDir,'aura-sprites.json'),JSON.stringify(auraSprites));

  if(cells.length>512)throw Error(`fx: ${cells.length} cells exceed 9-bit ids`);
  const bin=new Uint8Array(cells.length*CELL_BYTES);
  cells.forEach((cell,i)=>{
    const idx=cell.cls===DYN?Uint8Array.from(cell.px,v=>v?v-1:0):Uint8Array.from(cell.px,c=>indexIn(cell.cls,c));
    let o=i*CELL_BYTES;
    for(const[x,y]of[[0,0],[8,0],[0,8],[8,8]]){bin.set(encodeTile(idx,16,x,y),o);o+=32;}
  });
  writeFileSync(join(outDir,'cells.bin'),bin);

  // Assembly records: part count, cell count, bounding box of the parts'
  // top-left corners (min x, min y, max x, max y: signed bytes), the
  // distinct cell words (cell id | palette class << 9), then 3 bytes per
  // part: x + 128, y + 128, cell index * 8 | v-flip * 4 | h-flip * 2. The
  // cartridge resolves each cell once per assembly into four pre-flipped
  // OAM words, and places a fully visible assembly without per-part culls.
  const asmBytes=[],asmPtr=[];
  const b8=v=>{if(v<-128||v>127)throw Error('fx: assembly offset out of range '+v);return v+128;};
  const s8b=v=>{if(v<-128||v>127)throw Error('fx: bbox out of range '+v);return v&255;};
  let maxCells=0;
  for(const parts of asms){
    if(parts.length>255)throw Error('fx: assembly too large');
    const words=[];
    const idx=parts.map(p=>{const w=p.cell|((p.cls??cells[p.cell].cls)<<9);let i=words.indexOf(w);if(i<0){i=words.length;words.push(w);}return i;});
    if(words.length>6)throw Error(`fx: assembly with ${words.length} distinct cells`);
    maxCells=Math.max(maxCells,words.length);
    const xs=parts.map(p=>p.x),ys=parts.map(p=>p.y);
    const box=parts.length?[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]:[0,0,0,0];
    asmPtr.push(asmBytes.length);asmBytes.push(parts.length,words.length,...box.map(s8b));
    for(const w of words)asmBytes.push(w&255,w>>8);
    parts.forEach((p,k)=>asmBytes.push(b8(p.x),b8(p.y),idx[k]*8|(p.v?4:0)|(p.h?2:0)));
  }
  // Groups (detonation): count, then per entry assembly id | white<<15,
  // x and y (signed words).
  const detBytes=[],detPtr=[];
  for(const g of detGroups){
    detPtr.push(detBytes.length);detBytes.push(g.length);
    for(const e of g){const id=e.asm|(e.white?0x8000:0);detBytes.push(id&255,id>>8,e.x&255,(e.x>>8)&255,e.y&255,(e.y>>8)&255);}
  }

  // FX_EMBER trajectory (statusBurst embers): direction i, age 0-27.
  const dirs8e=[[0,-4],[3,-3],[4,0],[3,2],[0,3],[-3,2],[-4,0],[-3,-3]],emberPath=[];
  for(let age=0;age<28;age++)for(const[dx,dy]of dirs8e)emberPath.push(Math.trunc(dx*(age+3)/3)+128,Math.trunc(dy*(age+3)/3)-(age>>2)+128);

  // Giant-beam colours (sprite-layer.js giantBeam): Lucent's four smallest
  // beam-body values; training palettes from vegeta-clash.js. 1+555 -> 555.
  const lucent4=[...new Set(groups['beam-body'].flatMap(p=>[...p]))].filter(Boolean).sort((a,b)=>a-b).slice(0,4);
  const waves=[lucent4,trainingBeamPalettes.gold,trainingBeamPalettes.purple].map(p=>p.map(c=>c-1));
  // Aura ramps (ki-aura.js): luma-sorted native ramps without the white core.
  const ramp=g=>[...new Set(groups[g].flatMap(p=>[...p]))].filter(Boolean).sort((a,b)=>luma(a)-luma(b)).map(c=>c-1);
  const auraRamps=[ramp('charge-orb'),ramp('gold-arc'),friezaKiPalette.map(c=>c-1)];

  // Ki aura (ki-aura.js drawKiAura): the cartridge draws the flame as a
  // window polygon (poly.asm fx_poly_aura, HDMA kind 4) from rows taken
  // from drawKiAura's own pixels for every height, level and phase. Per
  // frame: a header (below), then per row 4 bytes, window 1 and window 2
  // as columns from the anchor + 128: one span: window 1 = the span,
  // window 2 = the extent of its pixels that are not rim (they show the
  // inner colour, window 1 and 2; the rest shows the rim colour); two
  // spans: one window each; more: the smallest gaps are filled. One xdata
  // blob per height; fx_aura_index (offset, first line from the anchor,
  // rows) per (height, level, phase) in tables.asm.
  const AURA_H=[16,32,40],auraIndex=[],auraBlobs=[];
  const auraFx={'charge-orb':groups['charge-orb'],'gold-arc':groups['gold-arc']};
  const auraRim=1+auraRamps[0][0];          // drawKiAura's blue rim colour (1+555)
  for(const height of AURA_H){
    const blob=[];
    for(let level=1;level<=8;level++)for(let phase=0;phase<12;phase++){
      const rows=new Map();
      drawKiAura(auraFx,0,0,phase*3,(x,y,c)=>{if(!rows.has(y))rows.set(y,new Map());rows.get(y).set(x,c);},
        {tone:'blue',power:level/8,height,seed:0,clock:0});
      const ys=[...rows.keys()],y0=Math.min(...ys),y1=Math.max(...ys);
      auraIndex.push(blob.length,(y0&255)|((y1-y0+1)<<8));
      const spanRows=[];
      for(let y=y0;y<=y1;y++){
        const row=rows.get(y)??new Map(),xs=[...row.keys()].sort((a,b)=>a-b),sp=[];
        for(const x of xs){if(sp.length&&sp.at(-1)[1]===x-1)sp.at(-1)[1]=x;else sp.push([x,x]);}
        spanRows.push({row,xs,sp});
      }
      // The tongues: down to the last row with two spans or more the
      // backdrop is the inner colour (most of a tongue's pixels), with no
      // colour math; below it the rim colour, and the inner part of each
      // one-span row adds up to the inner colour.
      const split=spanRows.reduce((k,r,i)=>r.sp.length>1?i+1:k,0),bytes=[];
      spanRows.forEach(({row,xs,sp},i)=>{
        while(sp.length>2){
          let bi=1;for(let k=2;k<sp.length;k++)if(sp[k][0]-sp[k-1][1]<sp[bi][0]-sp[bi-1][1])bi=k;
          sp.splice(bi-1,2,[sp[bi-1][0],sp[bi][1]]);
        }
        // An empty window is first > last next to the other one, so that
        // moving both by the anchor keeps it empty.
        let w1=[0,-1],w2=[0,-1];
        if(sp.length===1){
          w1=sp[0];w2=[w1[0],w1[0]-1];
          const inner=xs.filter(x=>row.get(x)!==auraRim);
          if(inner.length&&i>=split)w2=[inner[0],inner.at(-1)];
        }else if(sp.length===2){w1=sp[0];w2=sp[1];}
        for(const v of[...w1,...w2]){if(v<-128||v>127)throw Error('fx: aura row out of range');bytes.push(v+128);}
      });
      // Header: the tongues' rows, then the smallest and largest column
      // byte (columns are stored + 128: as if the anchor were at x = 128).
      blob.push(split,Math.min(...bytes),Math.max(...bytes),...bytes);
    }
    if(blob.length>0x8000)throw Error(`fx: aura ${height} rows take ${blob.length} bytes`);
    auraBlobs.push(blob.length);
    xdata?.(`fx_aura${height}`,Uint8Array.from(blob));
  }
  // Super Saiyan charge lightning (charge-lightning.js): the browser's bolts
  // for seeds 0-63 (phase + map * 71, wrapped), from its own arcs() with no
  // solid tiles or actors nearby (every bolt ends in the air). The cartridge
  // draws each bolt as Thunderbolt cells along its points instead of the
  // browser's 2-pixel line: a cell on every second point from the first
  // jag and on the browser's own middle-point stamp, turned to the bolt
  // (horizontal: turn 0, else 1). fx_bolt_ptr: per (seed, bolt) an offset
  // in the xdata blob fx_bolts: count, then x, y, turn per cell (from the
  // origin).
  const boltPtr=[],boltData=[];
  for(let seed=0;seed<64;seed++){
    const arcs=createChargeLightning({frame:seed*3,read16:()=>0,charge:45,entities:()=>[],worldFlight:false})({x:0,y:0});
    if(arcs.length!==3)throw Error('fx: charge lightning: expected three bolts');
    for(const arc of arcs){
      const p=arc.points,mid=Math.floor(p.length/2),a=p[0],b=arc.target;
      const turn=Math.abs(b.x-a.x)>Math.abs(b.y-a.y)?0:1,at=new Set([mid]);
      for(let k=1;k<p.length;k+=2)at.add(k);
      const cells=[...at].sort((x,y)=>x-y).map(k=>[p[k].x,p[k].y,turn]);
      for(const [x,y] of cells)if(x<-128||x>127||y<-128||y>127)throw Error('fx: bolt out of range');
      boltPtr.push(boltData.length);
      boltData.push(cells.length,...cells.flatMap(([x,y,t])=>[x&255,y&255,t]));
    }
  }

  // Per tone: the rim colour, the inner colour, COLDATA for inner - rim.
  const auraTone=auraRamps.flatMap(r=>{
    const ch=c=>[c&31,(c>>5)&31,(c>>10)&31],d=ch(r[1]).map((x,k)=>x-ch(r[0])[k]);
    if(d.some(x=>x<0))throw Error('fx: aura inner colour darker than its rim in a channel');
    return [r[0]&255,r[0]>>8,r[1]&255,r[1]>>8,0x20|d[0],0x40|d[1],0x80|d[2],0];
  });

  // Death Balls above 32 px (death-ball-art.js draw(), non-cinematic): the
  // 16 px art upscaled by nearest neighbour, so each art row is a band of
  // screen lines with the same outline. The cartridge draws them as a window
  // polygon (poly.asm fx_poly_dball): per art row the circle's span
  // (window 1), its inner span without the rim texels (window 2), and the
  // mean of the row's inner colours per frame as the backdrop (the art's
  // pink patches become a tint of their rows); the rim ring (window 1 xor 2)
  // subtracts one fixed colour, chosen to bring the rows' colours closest
  // to the rim's violet. The sparks outside the circle are not drawn.
  const dballIn=(x,y)=>(2*x-15)**2+(2*y-15)**2;
  const dballRows=[];                       // per art row: x0, x1+1, inner x0, inner x1+1 ($FF none)
  for(let y=0;y<16;y++){
    const xs=[...Array(16).keys()].filter(x=>dballIn(x,y)<=149),inner=xs.filter(x=>dballIn(x,y)<=120);
    dballRows.push(...(xs.length?[xs[0],xs.at(-1)+1]:[255,255]),...(inner.length?[inner[0],inner.at(-1)+1]:[255,255]));
  }
  const dballColours=[],dballRim=deathSmall.map(p=>{
    for(let i=0;i<256;i++){const x=i&15,y=i>>4,r=dballIn(x,y);if(r>120&&r<=149&&p[i])return p[i];}return 0;});
  if(new Set(dballRim).size!==1)throw Error('fx: Death Ball rim colour varies');
  const ch=c=>[c&31,(c>>5)&31,(c>>10)&31],rimCh=ch(dballRim[0]-1),dballWeight=[];
  for(const p of deathSmall)for(let y=0;y<16;y++){
    const sum=[0,0,0];let n=0;
    for(let x=0;x<16;x++){const c=p[y*16+x];if(c&&dballIn(x,y)<=120){ch(c-1).forEach((v,k)=>sum[k]+=v);n++;}}
    dballColours.push(n?sum.map(v=>Math.round(v/n)).reduce((c,v,k)=>c|v<<(5*k),0):dballRim[0]-1);
    dballWeight.push([...Array(16).keys()].filter(x=>{const r=dballIn(x,y);return r>120&&r<=149;}).length);
  }
  // Fixed colour subtracted on the rim: per channel the value that brings
  // the rows' colours closest to the rim colour (weighted by rim texels).
  const dballSub=[0,1,2].map(k=>{
    let best=0,err=Infinity;
    for(let v=0;v<32;v++){
      const e=dballColours.reduce((a,c,i)=>a+dballWeight[i]*(Math.max(0,ch(c)[k]-v)-rimCh[k])**2,0);
      if(e<err){err=e;best=v;}
    }
    return best;
  });
  // Snapped sizes (death-ball-art.js deathBallSizes) and, per size above 16,
  // the screen column / line of each art texel boundary: ceil(k*size/16).
  const dballSizes=deathBallSizes.slice(),dballBounds=[];
  for(const size of dballSizes)for(let k=0;k<=16;k++)dballBounds.push(Math.ceil(k*size/16));

  const a=new Asm();
  a.raw('; Generated by snes/gen/fx.mjs - do not edit.');
  a.def('FX_CELL_COUNT',cells.length);a.def('FX_ASM_COUNT',asms.length);a.def('FX_CLASS_COUNT',CLASS.length);
  CLASS.forEach((n,k)=>a.def(`FX_CLASS_${n}`,k));
  STAMP_GROUPS.forEach((g,i)=>a.def(`FX_SG_${g.replace(/-/g,'_').toUpperCase()}`,i));
  a.def('FX_STAMP_GROUPS',STAMP_GROUPS.length);
  a.def('FX_ASM_BURST',burstBase);a.def('FX_ASM_EMBER',emberBase);
  a.def('FX_ASM_AURA',auraSpriteBase);
  a.def('FX_ASM_DEATH16',deathBase);a.def('FX_ASM_DEATH32',death32Base);a.def('FX_ASM_DISC',discBase);
  a.def('FX_ASM_FINGER',fingerBase);a.def('FX_ASM_FRAGMENT',fragBase);a.def('FX_ASM_LASER',laserBase);
  a.def('FX_ASM_RING',ringBase);a.def('FX_ASM_SPARKS',sparksBase);a.def('FX_ASM_STATUS',statusBase);a.def('FX_ASM_RUBBLE',rubbleBase);a.def('FX_ASM_DUST',dustBase);
  a.def('FX_ASM_RING_COMPACT',compactRingBase);
  a.label('fx_class_palettes');for(const p of palettes){const row=[0,...p.map(c=>c-1)];while(row.length<16)row.push(0);a.dw(row);}
  a.label('fx_cell_class');a.db(cells.map(c=>c.cls));
  a.label('fx_stamp_base');a.dw(stampBase);
  a.label('fx_stamp_frames');a.db(stampFrames);
  a.label('fx_asm_ptr');a.dw(asmPtr);
  a.label('fx_asm_data');a.db(asmBytes);
  a.label('fx_band_index');a.dw(bandIndex);
  a.def('FX_DET_FRAMES',detGroups.length);
  a.def('FX_STRIP_LASER',laserStrip);
  a.def('FX_DBALL_SIZES',deathBallSizes.length);
  // Tables read only with long indexed loads go to tables.asm, which
  // module.asm places after the code in FX's code bank (the data bank is
  // kept for cells, assemblies and palettes).
  const t=new Asm();
  t.raw('; Generated by snes/gen/fx.mjs - do not edit.');
  t.label('fx_aura_asm_id');t.dw([auraSpriteBase]);
  t.label('fx_strip_ptr');t.dw(stripPtr);
  t.label('fx_strip_data');t.db(stripData);
  t.label('fx_det_ptr');t.dw(detPtr);
  t.label('fx_ember_path');t.db(emberPath);
  t.label('fx_det_data');t.db(detBytes);
  t.label('fx_laser_step');t.db(laserStep);
  t.label('fx_laser_len');t.dw(laserLen);
  t.label('fx_aura_index');t.dw(auraIndex);
  t.label('fx_bolt_ptr');t.dw(boltPtr);
  if(boltData.length>0x8000)throw Error('fx: bolts too large');
  xdata?.('fx_bolts',Uint8Array.from(boltData));
  t.label('fx_aura_tone');t.db(auraTone);
  t.label('fx_dball_rows');t.db(dballRows);
  t.label('fx_dball_colours');t.dw(dballColours);
  t.label('fx_dball_sizes');t.dw(dballSizes);
  t.label('fx_dball_bounds');t.db(dballBounds);
  t.label('fx_dball_fix');t.db([0x20|dballSub[0],0x40|dballSub[1],0x80|dballSub[2],0]);

  // Ceiling dust (ceiling-escape.js draw): chunk i at angle i*2.39996,
  // x = cos*(10+age*(1+(i%5)*.3)), y = sin*7 - age*(1.3+(i%4)*.4) +
  // age^2*.095, rounded as the browser does; ages 0-45, words per (age, i).
  const dustXY=[];
  for(let age=0;age<46;age++)for(let i=0;i<20;i++){
    const a=i*2.39996,speed=1+(i%5)*.3;
    dustXY.push(Math.round(Math.cos(a)*(10+age*speed)),Math.round(Math.sin(a)*7-age*(1.3+(i%4)*.4)+age*age*.095));
  }
  t.label('fx_dust_xy');t.dw(dustXY);
  a.label('fx_wave_colors');for(const w of waves)a.dw(w);
  a.label('fx_aura_ramps');for(const r of auraRamps)a.dw(r.slice(0,4));
  writeFileSync(join(outDir,'data.asm'),a.text());
  writeFileSync(join(outDir,'tables.asm'),t.text());

  // Preview: every cell in its class palette (DYN in grey).
  const cols=32,prev=blank(cols*17,17*Math.ceil(cells.length/cols));
  cells.forEach((cell,k)=>{const ox=(k%cols)*17,oy=Math.floor(k/cols)*17;
    for(let i=0;i<256;i++){const c=cell.px[i];if(!c)continue;
      const v=cell.cls===DYN?[0x2108,0x4210,0x6318][c-1]:c-1,d=((oy+(i>>4))*prev.width+ox+(i&15))*4;
      prev.data[d]=(v&31)*255/31;prev.data[d+1]=((v>>5)&31)*255/31;prev.data[d+2]=((v>>10)&31)*255/31;prev.data[d+3]=255;}});
  writeFileSync(join(outDir,'preview.png'),writePng(prev));
  return {cells:cells.length,asms:asms.length,cellBytes:bin.length,asmBytes:asmBytes.length,detBytes:detBytes.length,maxCells,laserDrift,auraBlobs};
}
