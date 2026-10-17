// World-flight module data (snes/src/modules/world): aerial effect sprites,
// their OBJ palette and the tables used by the aerial ki / Kamehameha code.
// Goku's own flight cells come from the goku module (goku_api_cell and its
// tile tables), so Goku's art and palettes have one source of truth.
// Sources: engine/native-effects.json + native-effects.js (original spell
// cells decoded from the ROM), engine/sprite-layer.js (beam colour rules,
// flight shadow), engine/world-scars.js (blastable towns),
// engine/native-crater.js (Potos hole art for the crater tiles).
//
// Outputs (dist/snes/gen/world/):
//   fx.bin      effect sprites as 16x16 OBJ blocks, laid out as the module's
//               OBJ region (tile rows $06-$0F of name table 0, 16 tiles wide)
//   data.asm    palette, fx tile table, trig table, towns
//   preview-fx.png (not shipped)
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeTile,writePng,blank} from '../tools/gfx.mjs';

const W5=c=>[c&31,(c>>5)&31,(c>>10)&31];
const rgb=(r,g,b)=>r|(g<<5)|(b<<10);
const dist=(a,b)=>{const[x,y,z]=W5(a),[p,q,r]=W5(b);return 3*(x-p)**2+4*(y-q)**2+2*(z-r)**2;};

// Weighted k-means (RGB555 space) to at most n colours; returns RGB555 list.
function quantize(hist,n){
  const colors=[...hist.entries()];
  if(colors.length<=n)return colors.map(([c])=>c);
  colors.sort((a,b)=>b[1]-a[1]);
  const centers=[colors[0][0]];
  while(centers.length<n){
    let best=null,bd=-1;
    for(const[c,w]of colors){let d=Infinity;for(const k of centers)d=Math.min(d,dist(c,k));const s=d*Math.sqrt(w);if(s>bd){bd=s;best=c;}}
    centers.push(best);
  }
  let cs=centers.map(W5);
  for(let it=0;it<16;it++){
    const acc=cs.map(()=>[0,0,0,0]);
    for(const[c,w]of colors){
      const p=W5(c);let bi=0,bd=Infinity;
      cs.forEach((k,i)=>{const d=3*(p[0]-k[0])**2+4*(p[1]-k[1])**2+2*(p[2]-k[2])**2;if(d<bd){bd=d;bi=i;}});
      acc[bi][0]+=p[0]*w;acc[bi][1]+=p[1]*w;acc[bi][2]+=p[2]*w;acc[bi][3]+=w;
    }
    cs=acc.map((a,i)=>a[3]?[a[0]/a[3],a[1]/a[3],a[2]/a[3]]:cs[i]);
  }
  return [...new Set(cs.map(([r,g,b])=>rgb(Math.round(r),Math.round(g),Math.round(b))))];
}
function nearestIndex(pal,c,start=1){let bi=start,bd=Infinity;for(let i=start;i<pal.length;i++){const d=dist(pal[i],c);if(d<bd){bd=d;bi=i;}}return bi;}
const histOf=cells=>{const h=new Map();for(const px of cells)for(const v of px)if(v)h.set(v-1,(h.get(v-1)??0)+1);return h;};
function indexCell(px,pal){
  const out=new Uint8Array(px.length),cache=new Map();
  for(let i=0;i<out.length;i++){const v=px[i];if(!v)continue;let k=cache.get(v);if(k===undefined){k=nearestIndex(pal,v-1);cache.set(v,k);}out[i]=k;}
  return out;
}

class Asm{
  constructor(){this.lines=[];}
  label(l){this.lines.push(`${l}:`);}
  db(a){for(let i=0;i<a.length;i+=16)this.lines.push('\tdb '+a.slice(i,i+16).map(v=>'$'+(v&255).toString(16).toUpperCase().padStart(2,'0')).join(','));}
  dw(a){for(let i=0;i<a.length;i+=12)this.lines.push('\tdw '+a.slice(i,i+12).map(v=>'$'+(v&0xffff).toString(16).toUpperCase().padStart(4,'0')).join(','));}
  def(n,v){this.lines.push(`!${n} = $${(v>>>0).toString(16).toUpperCase()}`);}
  raw(s){this.lines.push(s);}
  text(){return this.lines.join('\n')+'\n';}
}

// Effect sprites (16x16) in the module's OBJ region (name table 0). Slot s:
// s < 16 at tile $88+(s&3)*2+(s>>2)*$20 (columns 8-15 of tile rows 8-15),
// 16 <= s < 24 at $C0+((s-16)&3)*2+((s-16)>>2)*$20 (columns 0-7, rows 12-15),
// 24 <= s < 32 at $60+(s-24)*2 (tile rows 6-7). Tile rows 8-11 columns 0-7
// hold Goku's two cell buffers.
export const FX=[
  'charge-orb-0','charge-orb-1','charge-orb-2','charge-orb-3','charge-orb-4',
  'impact-spark-0','impact-spark-1','impact-spark-2','impact-spark-3','impact-spark-4','impact-spark-5',
  'gold-spark-0','gold-spark-1','gold-spark-2','gold-spark-3',
  'shadow','beam-edge-0','beam-edge-1','beam-fill','aura-arc-0','aura-arc-1','lightning-0','lightning-1',
];
export const fxTile=s=>s<16?0x88+(s&3)*2+(s>>2)*32:s<24?0xC0+((s-16)&3)*2+((s-16)>>2)*32:0x60+(s-24)*2;

export async function generate({rom,repo,outDir}){
  const engine=name=>import(pathToFileURL(join(repo,'engine',name)).href);

  // Effects: decode the original spell cells (indices 6..10 of each frame's
  // own ROM palette) and requantise into one OBJ palette (6).
  const {decodeEffectFrame}=await engine('native-effects.js');
  const manifest=JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8'));
  const frameOf=name=>{const f=manifest.frames.find(x=>x.name===name);if(!f)throw Error(`world: missing effect ${name}`);return f;};
  const blue=frameOf('charge-orb-0').palette;
  const effect=(name,palette=null)=>{
    const f=frameOf(name),{rgba}=decodeEffectFrame(rom,palette?{...f,palette}:f),px=new Uint16Array(256);
    for(let i=0;i<256;i++)if(rgba[i*4+3])px[i]=1+((rgba[i*4]>>3)|((rgba[i*4+1]>>3)<<5)|((rgba[i*4+2]>>3)<<10));
    return px;
  };
  // Lucent Beam body colours, sorted as engine/sprite-layer.js giantBeam().
  const beamColors=[...new Set(['beam-body-0','beam-body-1'].flatMap(n=>Array.from(effect(n))))].filter(Boolean).sort((a,b)=>a-b).slice(0,4).map(c=>c-1);
  if(beamColors.length<4)throw Error('world: beam colours');
  const SHADOW=rgb(5,7,6);        // engine/sprite-layer.js flight shadow rgb(40,56,48)
  // Beam edge: 16 px from the outer edge inward: <3 c0, <9 c1, else c2 (the
  // fill sprite supplies c3, the core). Variant 1 adds the +2 ripple.
  const beamEdge=ripple=>{const px=new Uint16Array(256);for(let y=0;y<16;y++)for(let x=0;x<16;x++)px[y*16+x]=1+(x<3+ripple?beamColors[0]:x<9+ripple?beamColors[1]:beamColors[2]);return px;};
  const fill=()=>{const px=new Uint16Array(256);px.fill(1+beamColors[3]);return px;};
  const shadow=()=>{const px=new Uint16Array(256);for(let yy=-2;yy<=2;yy++)for(let xx=-8;xx<=7;xx++)if(xx*xx/64+yy*yy/4<=1)px[(8+yy)*16+8+xx]=1+SHADOW;return px;};
  const fxPx=FX.map(name=>{
    if(name==='shadow')return shadow();
    if(name==='beam-edge-0')return beamEdge(0);
    if(name==='beam-edge-1')return beamEdge(2);
    if(name==='beam-fill')return fill();
    if(name.startsWith('aura-arc-'))return effect('gold-arc-'+name.slice(-1),blue);
    return effect(name);
  });
  const fxHist=histOf(fxPx);
  const fixed=[SHADOW,...beamColors];
  for(const c of fixed)fxHist.delete(c);
  const fxPal=[0,...fixed,...quantize(fxHist,15-fixed.length)];
  if(fxPal.length>16)throw Error('world: effects palette overflow');
  while(fxPal.length<16)fxPal.push(0);
  // fx.bin: tile rows 6-15 of name table 0 (tiles $060-$0FF), 512 B per row.
  const fxTiles=new Uint8Array(10*16*32);
  fxPx.forEach((px,s)=>{
    const idx=indexCell(px,fxPal),t=fxTile(s)-0x60;
    for(const[dx,dy,dt]of[[0,0,0],[8,0,1],[0,8,16],[8,8,17]])fxTiles.set(encodeTile(idx,16,dx,dy,4),(t+dt)*32);
  });
  writeFileSync(join(outDir,'fx.bin'),fxTiles);

  // Trig: sin * 127 for heading units of 4 (256 per turn), signed bytes.
  const sine=[];for(let i=0;i<256;i++)sine.push(Math.round(Math.sin(i*Math.PI/128)*127)&0xff);
  // Towns that can be blasted (engine/world-scars.js); positions are read
  // from the cartridge's takeoff table (C6:7A80) at run time.
  const {blastTowns}=await engine('world-scars.js');

  const a=new Asm();
  a.raw('; Generated by snes/gen/world.mjs - do not edit.');
  a.def('WORLD_FX_COUNT',FX.length);
  FX.forEach((n,i)=>a.def('FX_'+n.replace(/-/g,'_').toUpperCase(),i));
  a.def('WORLD_TOWN_COUNT',blastTowns.length);
  a.def('WORLD_BEAM_C3',beamColors[3]);
  a.label('world_fx_palette');a.dw(fxPal);
  a.label('world_fx_tile');a.dw(FX.map((_,s)=>fxTile(s)));
  a.label('world_sine');a.db(sine);
  a.label('world_town_maps');a.dw(blastTowns.map(([m])=>m));
  // Docking curve weights for t = $BF/160 (engine/sprite-layer.js docking
  // quadratic): (1-t)^2 and 2(1-t)t in 1/255, one word per $BF value.
  const curve=[];for(let bf=0;bf<=160;bf++){const t=bf/160;curve.push(Math.round((1-t)**2*255)|Math.round(2*(1-t)*t*255)<<8);}
  a.label('world_dock_curve');a.dw(curve);
  // Aerial wave profile (sprite-layer.js giantBeam radius() with world-ki.js
  // aerialBeamGeometry: taper 18 / 26 (mega), farScale .72, rounded tip):
  // per taper, length (multiples of 8, 0-112) and 16-px row centre d = 8+16j,
  // the half-width factor in 1/256 (0 past the beam's end).
  const beamF=[];
  for(const taper of[18,26])for(let li=0;li<=14;li++){
    const length=li*8;
    for(let j=0;j<7;j++){
      const d=8+16*j;
      if(d>length||length===0){beamF.push(0);continue;}
      const f=Math.min(1,(d+8)/taper)*(1-.28*d/length)*Math.min(1,Math.sqrt(Math.max(0,(length-d)/12)));
      beamF.push(Math.min(255,Math.round(f*256)));
    }
  }
  a.label('world_beam_f');a.db(beamF);
  writeFileSync(join(outDir,'data.asm'),a.text());

  const fv=blank(18*FX.length,18);
  fxPx.forEach((px,s)=>{const idx=indexCell(px,fxPal);for(let i=0;i<256;i++){const v=idx[i];if(!v)continue;const c=fxPal[v],d=(((i>>4)+1)*fv.width+s*18+1+(i&15))*4;
    fv.data[d]=(c&31)*255/31;fv.data[d+1]=((c>>5)&31)*255/31;fv.data[d+2]=((c>>10)&31)*255/31;fv.data[d+3]=255;}});
  writeFileSync(join(outDir,'preview-fx.png'),writePng(fv));
}
