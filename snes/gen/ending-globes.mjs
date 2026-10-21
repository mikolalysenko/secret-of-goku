// Fortress orientations. Native C2:B0D7 places it relative to the flight
// camera; C2:B133 walks diagonally by +/-6, wrapping both axes at $1000.
// There is no fixed world-space route. Cover the torus, including its seam.
// Day/night share indices: fit pairs of RGB555 colours to six BG palettes.
// One flip-deduplicated dictionary serves every view. The load scatters its
// tiles directly into sequential BG1 slots; no decompression or work buffer.
import {planetSurface,DEFAULT_TARGET} from './ending-space.mjs';
import {gfx,u16bytes} from './ending-art.mjs';

export const GLOBE_COLS=8,GLOBE_ROWS=4;
export const GLOBE_BUDGET=192*1024;
// Preserve the native flight preset as well as the established finale view.
// These extra views do not bound the moving Fortress's reachable positions.
export const GLOBE_EXTRAS=[{x:1848,y:3528},DEFAULT_TARGET];
// Keep the reachability argument tied to the verified cartridge, including
// the camera operands, wrap masks and six-unit walk (not an invented path).
function verifyFortressMotion(rom){
  for(const [at,hex] of [
    [0x2b0d7,'c220ad26016937008d260129ff00c980009003497fff65fa29ff0f8d2801ad2601297f0009000149ffff65fc29ff0f8d2a016b'],
    [0x2b13b,'ad280124c6500618690600800438e9060029ff0f8d2801ad2a0124c6300618690600800438e9060029ff0f8d2a01'],
  ]){
    const expected=Buffer.from(hex,'hex');
    if(!expected.equals(Buffer.from(rom.subarray(at,at+expected.length))))throw Error(`Fortress motion changed at C2:${(at&0xffff).toString(16)}`);
  }
}
export const globeTargets=()=>[
  ...Array.from({length:GLOBE_COLS*GLOBE_ROWS},(_,i)=>({x:i%GLOBE_COLS*4096/GLOBE_COLS,y:Math.floor(i/GLOBE_COLS)*4096/GLOBE_ROWS})),
  ...GLOBE_EXTRAS,
];
const channels=c=>[c&31,c>>5&31,c>>10&31,c>>15&31,c>>20&31,c>>25&31];
const weights=[3,4,2,3,4,2];
const distance=(a,b)=>a.reduce((s,v,i)=>s+weights[i]*(v-b[i])**2,0);
const paired=(day,night)=>day|(night<<15);
const pack=v=>v.reduce((c,n,i)=>c|(Math.round(n)<<(i*5)),0);

function fitPairs(groups){
  const colors=[...new Set(groups.flatMap(g=>[...g.keys()]))],vectors=new Map(colors.map(c=>[c,channels(c)]));
  const mean=g=>{let sum=0,n=0;for(const [c,w] of g){const v=vectors.get(c);sum+=w*(v[0]*3+v[1]*6+v[2]);n+=w;}return sum/n;};
  const order=groups.map((_,i)=>i).sort((a,b)=>mean(groups[a])-mean(groups[b]));
  const assign=new Uint8Array(groups.length);order.forEach((t,i)=>assign[t]=Math.floor(i*6/order.length));
  let pals=[];
  for(let iteration=0;iteration<8;iteration++){
    pals=Array.from({length:6},(_,p)=>{
      const hist=new Map();groups.forEach((g,i)=>{if(assign[i]===p)for(const [c,w] of g)hist.set(c,(hist.get(c)??0)+w);});
      const entries=[...hist].sort((a,b)=>b[1]-a[1]);
      if(entries.length<=15)return entries.map(([c])=>c);
      let centers=[vectors.get(entries[0][0])];
      const best=new Float64Array(entries.length).fill(Infinity);
      while(centers.length<15){let at=0,score=-1;
        entries.forEach(([c,w],i)=>{best[i]=Math.min(best[i],distance(vectors.get(c),centers.at(-1)));if(best[i]*w>score){score=best[i]*w;at=i;}});
        centers.push(vectors.get(entries[at][0]));
      }
      for(let k=0;k<12;k++){
        const acc=centers.map(()=>new Float64Array(7));
        for(const [c,w] of entries){const v=vectors.get(c);let at=0,err=Infinity;
          centers.forEach((s,i)=>{const d=distance(v,s);if(d<err){err=d;at=i;}});
          for(let j=0;j<6;j++)acc[at][j]+=v[j]*w;acc[at][6]+=w;
        }
        centers=acc.map((a,i)=>a[6]?Array.from(a.slice(0,6),v=>v/a[6]):centers[i]);
      }
      return [...new Set(centers.map(pack))];
    });
    const errors=colors.map(c=>pals.map(p=>Math.min(...p.map(s=>distance(vectors.get(c),channels(s))))));
    const errorOf=new Map(colors.map((c,i)=>[c,errors[i]]));
    let changed=0;
    groups.forEach((g,i)=>{const scores=new Float64Array(6);for(const [c,w] of g)errorOf.get(c).forEach((e,p)=>scores[p]+=e*w);
      let p=0;for(let j=1;j<6;j++)if(scores[j]<scores[p])p=j;
      if(p!==assign[i]){assign[i]=p;changed++;}
    });
    if(!changed)break;
  }
  const nearest=new Map(colors.map(c=>[c,pals.map(p=>{let at=0,err=Infinity;
    p.forEach((s,i)=>{const d=distance(vectors.get(c),channels(s));if(d<err){err=d;at=i;}});return at+1;
  })]));
  return {pals,assign,nearest};
}

export function globeAtlas(rom,{targets=globeTargets()}={}){
  const views=[],groups=[];
  for(const target of targets){
    const day=planetSurface(rom,{target,night:false}),night=planetSurface(rom,{target,night:true}),tiles=[];
    for(let t=0;t<32*28;t++){
      const px=new Int32Array(64).fill(-1),hist=new Map();
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        const i=((t>>5)*8+y)*256+(t%32)*8+x;if(!day[i])continue;
        const c=paired(day[i]-1,night[i]-1);px[y*8+x]=c;hist.set(c,(hist.get(c)??0)+1);
      }
      tiles.push({px,group:hist.size?groups.length:-1});if(hist.size)groups.push(hist);
    }
    views.push({target,tiles});
  }
  const {pals,assign,nearest}=fitPairs(groups),dictionary=new Map(),all=[];
  const flip=(px,h,v)=>Uint8Array.from({length:64},(_,i)=>px[(v?7-(i>>3):i>>3)*8+(h?7-i%8:i%8)]);
  const intern=px=>{
    for(const [h,v] of [[0,0],[1,0],[0,1],[1,1]]){
      const key=Buffer.from(h||v?flip(px,h,v):px).toString('base64');
      if(dictionary.has(key)){const tile=dictionary.get(key);return {tile,flags:h<<14|v<<15};}
    }
    const tile={id:all.length,px};all.push(tile);dictionary.set(Buffer.from(px).toString('base64'),tile);return {tile,flags:0};
  };
  intern(new Uint8Array(64));                    // dictionary tile 0: transparent
  const cells=views[0].tiles.flatMap(({group},i)=>group<0?[]:[i]);
  for(const view of views){
    const live=view.tiles.flatMap(({group},i)=>group<0?[]:[i]);
    if(live.length!==cells.length||live.some((t,i)=>t!==cells[i]))throw Error('cutaway globe mask changed');
    view.map=cells.map(i=>{
      const {px,group}=view.tiles[i],pal=assign[group];
      const ix=Uint8Array.from(px,c=>c<0?0:nearest.get(c)[pal]);
      const entry=intern(ix);return {tile:entry.tile.id,flags:entry.flags|((pal+1)<<10)};
    });
    delete view.tiles;
  }
  if(cells.length+1>448)throw Error('cutaway globe exceeds BG1 VRAM');
  const tiles=new Uint8Array(all.length*32);
  all.forEach((t,i)=>tiles.set(gfx.encodeTile(t.px,8,0,0,4),i*32));
  const palettes=shift=>pals.flatMap(p=>[0,...p.map(c=>c>>>shift&0x7fff),...Array(15-p.length).fill(0)]);
  return {views,tiles,cells,palettes:{day:palettes(0),night:palettes(15)}};
}

export function globeAssets(o,{rom,xblob}){
  verifyFortressMotion(rom);
  const atlas=globeAtlas(rom),t=o.cut;
  // Full 32 KiB chunks start at offset zero in an xdata bank. This avoids
  // an address lookup in each tile DMA; the last chunk is zero padded.
  const chunks=Math.ceil(atlas.tiles.length/0x8000);
  if(chunks>8)throw Error('cutaway dictionary bank index exceeds three bits');
  // All views use the same sequential VRAM tile numbers. Upload this map
  // once, then change only its palette/flip high bytes at the occupied cells.
  const map=new Uint16Array(1024);
  atlas.cells.forEach((cell,i)=>{map[cell]=i+1;});
  const left=Math.min(...atlas.cells.map(c=>c%32)),right=Math.max(...atlas.cells.map(c=>c%32));
  const top=Math.min(...atlas.cells.map(c=>c>>5)),bottom=Math.max(...atlas.cells.map(c=>c>>5));
  const width=right-left+1,height=bottom-top+1;
  const refs=[...u16bytes(map)],rows=[];
  for(const view of atlas.views){
    // The small rectangular high-byte image allows one $2119 DMA per row,
    // avoiding 307 individual CPU/PPU writes during the black-frame load.
    const attrs=new Uint8Array(width*height);
    view.map.forEach(({flags},i)=>{
      const cell=atlas.cells[i];attrs[((cell>>5)-top)*width+(cell%32)-left]=(flags>>8)|((i+1)>>8);
    });
    refs.push(...attrs);
    const start=refs.length;
    let runs=0;
    for(let i=0;i<view.map.length;){
      const tile=view.map[i].tile;
      let count=1;
      while(i+count<view.map.length&&count<255&&
        ((tile+count)>>10)===(tile>>10)&&view.map[i+count].tile===tile+count)count++;
      refs.push(tile&255,tile>>8,count);i+=count;runs++;
    }
    rows.push({start,end:refs.length,runs});
  }
  const bytes=chunks*0x8000+refs.length;
  if(bytes>GLOBE_BUDGET)throw Error(`cutaway globes use ${bytes} bytes, budget ${GLOBE_BUDGET}`);
  for(let i=0;i<chunks;i++){
    const data=new Uint8Array(0x8000);data.set(atlas.tiles.subarray(i*0x8000,(i+1)*0x8000));
    xblob(`cut_globe_tiles${i}`,data);
    t.raw(`assert (ending_cut_globe_tiles${i}&$FFFF) == 0, "cutaway dictionary alignment"`);
  }
  xblob('cut_globe_refs',Uint8Array.from(refs));
  t.def('ENDING_CUT_GLOBE_COLS',GLOBE_COLS);t.def('ENDING_CUT_GLOBE_ROWS',GLOBE_ROWS);
  t.def('ENDING_CUT_GLOBE_DEFAULT',atlas.views.length-1);
  t.def('ENDING_CUT_GLOBE_CELLS',atlas.cells.length);
  t.def('ENDING_CUT_GLOBE_WIDTH',width);t.def('ENDING_CUT_GLOBE_HEIGHT',height);
  t.def('ENDING_CUT_GLOBE_EXTRAS',GLOBE_EXTRAS.length);
  t.table('ending_cut_globe_extra_targets','dw',GLOBE_EXTRAS.flatMap(p=>[p.x,p.y]));
  t.table('ending_cut_globe_offsets','dw',rows.flatMap(r=>[r.start,r.end]));
  t.table('ending_cut_globe_map_rows','dw',Array.from({length:height},(_,i)=>0x4c00+(top+i)*32+left));
  t.raw('ending_cut_globe_banks:');
  for(let i=0;i<chunks;i++)t.raw(`\tdb ending_cut_globe_tiles${i}>>16`);
  o.stats.globes={cols:GLOBE_COLS,rows:GLOBE_ROWS,orientations:atlas.views.length,
    dictionaryTiles:atlas.tiles.length/32,dictionaryBytes:atlas.tiles.length,
    paddedDictionaryBytes:chunks*0x8000,referenceBytes:refs.length,bytes,budget:GLOBE_BUDGET,
    maxRuns:Math.max(...rows.map(r=>r.runs)),attributeWidth:width,attributeHeight:height,
    maxTiles:atlas.cells.length+1,targets:atlas.views.map(v=>v.target)};
  return atlas.palettes;
}
