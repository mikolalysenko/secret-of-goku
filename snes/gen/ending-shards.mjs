// Browser Voronoi shards, with quantized rotations and a 124-cell OBJ cache.
// All output is precomputed; the cartridge only copies cells/OAM in vblank.
import {fracturePlanet,fragmentPose} from '../../engine/planet-fragments.js';
import {sparkPos} from './ending-space.mjs';
import {nearestIn,objCell,quantizeSurfaces} from './ending-art.mjs';

export function voronoiFracture(globe){
  const raw=fracturePlanet(globe);
  return {raw,pieces:raw.map(p=>({...p,pixels:p.pixels.map(v=>v.y*256+v.x),edge:new Set(p.pixels.filter(v=>v.edge).map(v=>v.y*256+v.x))}))};
}

function variants(pieces,fit,step){
 const frames=[],all=[];
 for(let j=0;j<64;j++){
  const p=pieces[j],keys=new Map();
  for(let t=0;t<=77;t++){const k=Math.round(t*p.spin/step);if(!keys.has(k))keys.set(k,[]);keys.get(k).push(t);}
  const vs=new Map();
  for(const [k,times] of keys){
   const t=k===0?0:times[Math.floor(times.length/2)],sq=fragmentPose(p,t).squash,cos=Math.cos(k*step),sin=Math.sin(k*step),px=[];
   for(let y=-40;y<=40;y++)for(let x=-40;x<=40;x++){
    let index=0;
    for(let depth=1;depth>=0;depth--){const dx=x-2*depth,dy=y-3*depth,sx=Math.round(dx*cos+dy*sin+p.x-p.left),sy=Math.round((-dx*sin+dy*cos)/sq+p.y-p.top);
     if(sx<0||sy<0||sx>=p.width||sy>=p.height)continue;const i=sy*p.width+sx,c=p.colors[i];if(c)index=depth?14:p.edges[i]?15:1+nearestIn(fit.palettes[fit.assign[j]],c-1);
    }
    if(index)px.push({x,y,index});
   }
   const minX=Math.min(...px.map(p=>p.x)),minY=Math.min(...px.map(p=>p.y));let best;
   // Choose the 16x16 grid alignment with the fewest occupied cells, then
   // concentrate pixels in dense cells (least damage if a hardware limit hits).
   for(let oy=0;oy<16;oy++)for(let ox=0;ox<16;ox++){
    const x0=minX-ox,y0=minY-oy,groups=new Map();
    for(const p of px){const x=x0+16*Math.floor((p.x-x0)/16),y=y0+16*Math.floor((p.y-y0)/16),key=x+','+y;if(!groups.has(key))groups.set(key,{x,y,px:[]});groups.get(key).px.push(p);}
    const cells=[...groups.values()],score=cells.length*1e6-cells.reduce((a,c)=>a+c.px.length**2,0);
    if(!best||score<best.score)best={cells,score};
   }
   for(const c of best.cells){c.piece=j;c.id=all.length;all.push(c);}
   vs.set(k,best.cells);
  }
  frames.push(Array.from({length:115},(_,t)=>vs.get(Math.round(Math.min(t,77)*p.spin/step))));
 }
 return {frames,all};
}
export function shardAssets(o,{fr,fit,effects}){
  const pieces=fr.raw,atlas=variants(pieces,fit,Math.PI/4),frames=[],sparkFrames=[];
  let maxSprites=0,maxSlivers=0,droppedPixels=0,totalPixels=0,escapeCells=null;
  for(let t=0;t<115;t++){
    const sprites=[];
    for(let j=0;j<64;j++){
      const pose=fragmentPose(pieces[j],t),x=Math.round(pose.x),y=Math.round(pose.y);
      for(const c of atlas.frames[j][t]){
        if(escapeCells&&!escapeCells.has(c.id))continue;
        const sx=x+c.x,sy=y+c.y;if(sx<=-16||sx>=256||sy<=-16||sy>=224)continue;
        const n=c.px.filter(p=>x+p.x>=0&&x+p.x<256&&y+p.y>=0&&y+p.y<224).length;
        if(n)sprites.push({id:c.id,piece:j,x:sx,y:sy,n,pal:fit.assign[j]});
      }
    }
    const line=new Uint8Array(224),kept=[];
    // Keep the densest cells within the real 34-sliver/128-OBJ limit.
    // Do not discard cells under the white flash: retaining the same cache
    // avoids a large re-upload when the disc disappears at t=8.
    sprites.sort((a,b)=>b.n-a.n);
    const fits=s=>kept.length<104&&Array.from({length:16},(_,i)=>s.y+i).every(y=>y<0||y>=224||line[y]+2<=34);
    const add=s=>{for(let y=Math.max(0,s.y);y<Math.min(224,s.y+16);y++)line[y]+=2;};
    for(const s of sprites){totalPixels+=s.n;if(!fits(s)){droppedPixels+=s.n;continue;}kept.push(s);add(s);}
    maxSprites=Math.max(maxSprites,kept.length);maxSlivers=Math.max(maxSlivers,...line);
    // OAM's first sprite wins; the browser draws later pieces on top.
    kept.sort((a,b)=>b.piece-a.piece);
    frames.push(kept);
    // escapePlanet starts the debris clock again at 77, even after the
    // explosion reached 115. Hold the shape and retained cell set from
    // this point so the same cache supports that rewind without a reload.
    // Radial drift, heat and fade continue at the browser's actual age.
    if(t===77)escapeCells=new Set(kept.map(s=>s.id));
    if(t<70){
      const shown=new Set();
      for(let k=0;k<18;k++){
        const i=(t*7+k)%18,s=sparkPos(i,t);
        if(s.x<=-16||s.x>=256||s.y<=-16||s.y>=224)continue;
        if(Array.from({length:16},(_,i)=>s.y+i).some(y=>y>=0&&y<224&&line[y]+2>34))continue;
        add(s);shown.add(i);
      }
      const row=[],hi=new Uint8Array(5);
      for(let i=0;i<18;i++){const s=sparkPos(i,t),on=shown.has(i);row.push(on?s.x&255:0,on?s.y&255:224);if(on&&s.x<0)hi[i>>2]|=1<<((i&3)*2);}
      sparkFrames.push(...row,...hi);
    }
  }
  // Cache slots 120-123 are the spark/escape strip. The other 124 cells
  // are enough for the union of two adjacent 104-sprite pictures.
  const physical=i=>i<120?i:i+4;
  const uses=frames.map(f=>new Set(f.map(s=>s.id)));
  const initial=[...new Set(frames.flatMap(f=>f.map(s=>s.id)))].slice(0,124),slots=[...initial],last=slots.map(()=>-100),jobs=[];
  const nextUse=(id,t)=>{for(let i=t;i<115;i++)if(uses[i].has(id))return i;return 999;};
  const snapshots=[];
  for(let t=0;t<115;t++){
    for(const id of uses[t])if(!slots.includes(id)){
      let best=-1,score=-1;
      for(let i=0;i<124;i++)if(!uses[t].has(slots[i])&&!uses[Math.max(0,t-1)].has(slots[i])){
        const n=nextUse(slots[i],t);if(n>score){best=i;score=n;}
      }
      if(best<0)throw Error(`shard cache cannot stage frame ${t}`);
      jobs.push({id,slot:physical(best),from:Math.max(0,last[best]+1),to:t});slots[best]=id;
    }
    snapshots.push(frames[t].map(s=>({...s,slot:physical(slots.indexOf(s.id))})));
    slots.forEach((id,i)=>{if(uses[t].has(id))last[i]=t;});
  }
  // Earliest-deadline first: at most three complete cells per vblank.
  // Every replacement occurs after the old cell's last visible frame.
  const pending=new Set(jobs),schedule=[];
  for(let t=0;t<115;t++){
    const ready=[...pending].filter(j=>j.from<=t).sort((a,b)=>a.to-b.to).slice(0,3);
    for(const j of ready){pending.delete(j);schedule.push({...j,at:t});}
    if([...pending].some(j=>j.to<=t))throw Error(`shard upload misses frame ${t}`);
  }
  if(pending.size)throw Error('shard uploads unfinished');
  // First 124 cells are embedded in the initial full OBJ sheet; every
  // remaining variant has one copy in the packed atlas. Source descriptors
  // retain each half-row's address, so no cell is duplicated for the load.
  const obj=new Uint8Array(16384),source=new Map(),packed=[];
  const bytes=atlas.all.map(c=>{const ix=new Uint8Array(256);for(const p of c.px)ix[(p.y-c.y)*16+p.x-c.x]=p.index;return objCell(ix,16,0,0,16);});
  initial.forEach((id,i)=>{
    const cell=physical(i),at=(cell>>3)*1024+(cell&7)*64,b=bytes[id];obj.set(b.subarray(0,64),at);obj.set(b.subarray(64),at+512);
    source.set(id,{name:'space_obj',top:at,bottom:at+512});
  });
  for(let id=0;id<bytes.length;id++)if(!source.has(id)){
    const k=packed.length;packed.push(bytes[id]);source.set(id,{name:`shard_cells_${k>>8}`,top:(k&255)*128,bottom:(k&255)*128+64});
  }
  for(let k=0;k<packed.length;k+=256){const data=new Uint8Array(Math.min(256,packed.length-k)*128);packed.slice(k,k+256).forEach((b,i)=>data.set(b,i*128));o.blob(`shard_cells_${k>>8}`,data);}
  const gold=quantizeSurfaces(effects['gold-spark']);
  for(let i=0;i<4;i++){const b=objCell(gold.index[i],16,0,0,16),at=15*1024+i*64;obj.set(b.subarray(0,64),at);obj.set(b.subarray(64),at+512);}
  o.blob('space_obj',obj);o.blob('space_spark_oam',Uint8Array.from(sparkFrames));
  o.table('ending_spark_pal','dw',gold.palette);o.def('ENDING_SPARK_TILE',480);o.def('ENDING_SPACE_OBJ_BYTES',16384);
  // OAM is already in hardware order: one direct WRAM copy for entries,
  // another for the high table. Records never cross an xdata bank.
  const chunks=[[]],rows=[];
  for(const f of snapshots){
    const lo=f.flatMap(s=>{const tile=(s.slot>>3)*32+(s.slot&7)*2;return [s.x&255,s.y&255,tile&255,0x28|(s.pal<<1)|(tile>>8)];});
    while(lo.length<416)lo.push(0,224,0,0);
    const hi=new Uint8Array(26);f.forEach((s,i)=>{if(s.x<0)hi[i>>2]|=1<<((i&3)*2);});
    let chunk=chunks.at(-1);if(chunk.length+lo.length+hi.length>32768){chunk=[];chunks.push(chunk);}
    rows.push({chunk:chunks.length-1,at:chunk.length,count:104,hi:hi.length});chunk.push(...lo,...hi);
  }
  chunks.forEach((c,i)=>o.blob(`shard_oam_${i}`,Uint8Array.from(c)));
  o.cut.raw('ending_shard_frames:');
  for(const r of rows)o.cut.raw(`\tdl ending_shard_oam_${r.chunk}+${r.at}\n\tdb ${r.count}\n\tdw ${r.count*4},${r.hi}`);
  // A row is two DMAs of 64 bytes to OBJ cells ($100 words between rows).
  o.cut.raw('ending_shard_jobs:');
  for(const j of schedule){const s=source.get(j.id),dest=((j.slot>>3)*32+(j.slot&7)*2)*16;
    o.cut.raw(`\tdl ending_${s.name}+${s.top}\n\tdb ${j.at}\n\tdw ${dest},ending_${s.name}+${s.bottom}`);
  }
  o.def('ENDING_SHARD_JOBS',schedule.length);
  o.cut.table('ending_shard_need','dw',Array.from({length:115},(_,t)=>schedule.filter(j=>j.at<=t).length*8));
  // Verify that each OAM cell sees its own completed tile image at every
  // age, including cache reuse; catch accidental active-cell overwrites.
  const cache=new Map(initial.map((id,i)=>[physical(i),id]));
  for(let t=0;t<115;t++){
    for(const j of schedule.filter(j=>j.at===t))cache.set(j.slot,j.id);
    for(const s of snapshots[t])if(cache.get(s.slot)!==s.id)throw Error(`shard cache mismatch at ${t}`);
  }
  const artBytes=obj.length+packed.length*128,oamBytes=chunks.reduce((n,c)=>n+c.length,0);
  if(artBytes+oamBytes>120*1024)throw Error('rotating shards exceed 120 KiB');
  o.stats.shards={pieces:64,angleDegrees:45,rotationUntil:77,cells:atlas.all.length,artBytes,oamBytes,xdata:artBytes+oamBytes,jobs:schedule.length,maxCellsPerVblank:3,maxSprites,maxSlivers,droppedPixels,totalPixels};
}
