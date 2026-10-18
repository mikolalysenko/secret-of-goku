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

export async function generate({rom,repo,outDir}){
  const eng=f=>import(pathToFileURL(join(repo,'engine',f)).href);
  const {decodeEffectFrame,decodeEffectTile}=await eng('native-effects.js');
  const {combustionCells,combustionFrames}=await eng('native-combustion-data.js');
  const {friezaKiPalette}=await eng('ki-aura.js');
  const {createDeathBallArt}=await eng('death-ball-art.js');
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
  const ringParts=(R,gold,age)=>{
    const count=age<8?16:8,rad=R+age*1.5,phase=age>>1,parts=[];
    const outer=age<8?(gold?'gold-arc':'aura-arc'):(gold?'gold-spark':'impact-spark'),spark=gold?'gold-spark':'impact-spark';
    for(let i=0;i<count;i++){
      const a=i*Math.PI*2/count,dx=Math.cos(a),dy=Math.sin(a),turn=Math.round(i*4/count)%4;
      parts.push(...shifted(stampAsm(outer,(age<8?0:phase)+(i&1),turn),Math.round(dx*rad),Math.round(dy*rad)));
      if(age<5)parts.push(...shifted(stampAsm(spark,phase+(i&1),0),Math.round(dx*rad*.45),Math.round(dy*rad*.45)));
    }
    return parts;
  };
  const ringBase=asms.length;            // ((R16 ? 2 : 0) + gold) * 14 + age
  for(const R of[56,16])for(const gold of[false,true])for(let age=0;age<14;age++)asms.push(ringParts(R,gold,age));
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

  const a=new Asm();
  a.raw('; Generated by snes/gen/fx.mjs - do not edit.');
  a.def('FX_CELL_COUNT',cells.length);a.def('FX_ASM_COUNT',asms.length);a.def('FX_CLASS_COUNT',CLASS.length);
  CLASS.forEach((n,k)=>a.def(`FX_CLASS_${n}`,k));
  STAMP_GROUPS.forEach((g,i)=>a.def(`FX_SG_${g.replace(/-/g,'_').toUpperCase()}`,i));
  a.def('FX_STAMP_GROUPS',STAMP_GROUPS.length);
  a.def('FX_ASM_BURST',burstBase);a.def('FX_ASM_EMBER',emberBase);
  a.def('FX_ASM_DEATH16',deathBase);a.def('FX_ASM_DEATH32',death32Base);a.def('FX_ASM_DISC',discBase);
  a.def('FX_ASM_FINGER',fingerBase);a.def('FX_ASM_FRAGMENT',fragBase);
  a.def('FX_ASM_RING',ringBase);a.def('FX_ASM_SPARKS',sparksBase);a.def('FX_ASM_STATUS',statusBase);a.def('FX_ASM_RUBBLE',rubbleBase);a.def('FX_ASM_DUST',dustBase);
  a.label('fx_class_palettes');for(const p of palettes){const row=[0,...p.map(c=>c-1)];while(row.length<16)row.push(0);a.dw(row);}
  a.label('fx_cell_class');a.db(cells.map(c=>c.cls));
  a.label('fx_stamp_base');a.dw(stampBase);
  a.label('fx_stamp_frames');a.db(stampFrames);
  a.label('fx_asm_ptr');a.dw(asmPtr);
  a.label('fx_asm_data');a.db(asmBytes);
  a.label('fx_band_index');a.dw(bandIndex);
  a.label('fx_strip_ptr');a.dw(stripPtr);
  a.label('fx_strip_data');a.db(stripData);
  a.label('fx_det_ptr');a.dw(detPtr);
  a.label('fx_ember_path');a.db(emberPath);
  a.label('fx_det_data');a.db(detBytes);
  a.def('FX_DET_FRAMES',detGroups.length);
  // Ceiling dust (ceiling-escape.js draw): chunk i at angle i*2.39996,
  // x = cos*(10+age*(1+(i%5)*.3)), y = sin*7 - age*(1.3+(i%4)*.4) +
  // age^2*.095, rounded as the browser does; ages 0-45, words per (age, i).
  const dustXY=[];
  for(let age=0;age<46;age++)for(let i=0;i<20;i++){
    const a=i*2.39996,speed=1+(i%5)*.3;
    dustXY.push(Math.round(Math.cos(a)*(10+age*speed)),Math.round(Math.sin(a)*7-age*(1.3+(i%4)*.4)+age*age*.095));
  }
  a.label('fx_dust_xy');a.dw(dustXY);
  a.label('fx_wave_colors');for(const w of waves)a.dw(w);
  a.label('fx_aura_ramps');for(const r of auraRamps)a.dw(r.slice(0,4));
  writeFileSync(join(outDir,'data.asm'),a.text());

  // Preview: every cell in its class palette (DYN in grey).
  const cols=32,prev=blank(cols*17,17*Math.ceil(cells.length/cols));
  cells.forEach((cell,k)=>{const ox=(k%cols)*17,oy=Math.floor(k/cols)*17;
    for(let i=0;i<256;i++){const c=cell.px[i];if(!c)continue;
      const v=cell.cls===DYN?[0x2108,0x4210,0x6318][c-1]:c-1,d=((oy+(i>>4))*prev.width+ox+(i&15))*4;
      prev.data[d]=(v&31)*255/31;prev.data[d+1]=((v>>5)&31)*255/31;prev.data[d+2]=((v>>10)&31)*255/31;prev.data[d+3]=255;}});
  writeFileSync(join(outDir,'preview.png'),writePng(prev));
  return {cells:cells.length,asms:asms.length,cellBytes:bin.length,asmBytes:asmBytes.length,detBytes:detBytes.length,maxCells};
}
