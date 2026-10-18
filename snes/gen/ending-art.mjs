// Shared picture helpers for the ending generator (snes/gen/ending.mjs).
// Surfaces follow the browser compositor: Uint16Array of 1 + RGB555, 0 = empty.
import * as gfx from '../tools/gfx.mjs';

export {gfx};
export const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);

export function surfaceToImage(surface,w,h){
  const img=gfx.blank(w,h);
  for(let i=0;i<w*h;i++){
    const c=surface[i];if(!c)continue;const v=c-1,d=i*4;
    img.data[d]=(v&31)*255/31|0;img.data[d+1]=(v>>5&31)*255/31|0;img.data[d+2]=(v>>10&31)*255/31|0;img.data[d+3]=255;
  }
  return img;
}
export function imageToSurface(img,alpha=1){
  const out=new Uint16Array(img.width*img.height);
  for(let i=0;i<out.length;i++)if(img.data[i*4+3]>=alpha)out[i]=1+(img.data[i*4]>>3)+((img.data[i*4+1]>>3)<<5)+((img.data[i*4+2]>>3)<<10);
  return out;
}
// Exact RGB555 image (no 8-bit rounding loss) from a surface.
export const c555=c=>c-1;

// Quantise a set of sprite surfaces to one 15-colour OBJ palette.
// Returns {palette:[16 RGB555] (index 0 transparent), index:[Uint8Array per surface]}.
export function quantizeSurfaces(surfaces,colors=15,fixed=[]){
  const hist=new Map();
  for(const s of surfaces)for(const c of s)if(c)hist.set(c-1,(hist.get(c-1)??0)+1);
  for(const f of fixed)hist.delete(f);
  let pal=hist.size+fixed.length<=colors?[...hist.keys()]:gfx.quantize(hist,colors-fixed.length);
  pal=[0,...fixed,...pal.filter(c=>!fixed.includes(c))];
  while(pal.length<16)pal.push(0);
  pal=pal.slice(0,16);
  const cache=new Map();
  const index=surfaces.map(s=>{
    const out=new Uint8Array(s.length);
    for(let i=0;i<s.length;i++){
      const c=s[i];if(!c)continue;
      let v=cache.get(c);if(v===undefined){v=gfx.nearest(pal.slice(0,colors+1),c-1);cache.set(c,v);}out[i]=v;
    }
    return out;
  });
  return {palette:pal,index};
}

// A 32x32 (or 16x16) OBJ cell from an index buffer: tile rows in VRAM order,
// each row of `size/8` tiles contiguous (the loader uploads rows with a
// $100-word stride).
export function objCell(index,w,x0=0,y0=0,size=32){
  const n=size/8,out=new Uint8Array(n*n*32);
  for(let ty=0;ty<n;ty++)for(let tx=0;tx<n;tx++){
    const tile=new Uint8Array(64);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const sx=x0+tx*8+x,sy=y0+ty*8+y;
      tile[y*8+x]=sx>=0&&sy>=0&&sx<w&&sy*w+sx<index.length?index[sy*w+sx]:0;
    }
    out.set(gfx.encodeTile(tile,8,0,0,4),(ty*n+tx)*32);
  }
  return out;
}
// A 32x32 picture as four 16x16 OBJ cells (TL, TR, BL, BR), each cell 128
// bytes: its top tile pair (64) then its bottom tile pair (64). The loader
// writes the halves $100 words apart (core's 16x16 field OBJ regions).
export function quadCells(index,w=32,x0=0,y0=0){
  const out=new Uint8Array(512);
  [[0,0],[16,0],[0,16],[16,16]].forEach(([dx,dy],q)=>{
    for(const [half,ty] of [[0,0],[1,8]])for(let tx=0;tx<2;tx++){
      const tile=new Uint8Array(64);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const sx=x0+dx+tx*8+x,sy=y0+dy+ty+y;tile[y*8+x]=sx>=0&&sy>=0&&sx<w&&sy*w+sx<index.length?index[sy*w+sx]:0;}
      out.set(gfx.encodeTile(tile,8,0,0,4),q*128+half*64+tx*32);
    }
  });
  return out;
}
export function cellIsEmpty(index,w,h,x0,y0,size){
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const sx=x0+x,sy=y0+y;if(sx>=0&&sy>=0&&sx<w&&sy<h&&index[sy*w+sx])return false;}
  return true;
}

// Lossy tile budget: merge the most similar 8x8 RGB blocks (including
// flipped matches) until at most `target` distinct blocks remain. Returns a
// new image; makeBg then deduplicates exactly.
export function reduceBlocks(img,target){
  const cols=img.width>>3,rows=img.height>>3,n=cols*rows;
  const block=i=>{const tx=i%cols,ty=(i/cols)|0,px=new Int16Array(192);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){const s=((ty*8+y)*img.width+tx*8+x)*4,d=(y*8+x)*3;px[d]=img.data[s]>>3;px[d+1]=img.data[s+1]>>3;px[d+2]=img.data[s+2]>>3;}
    return px;};
  const flip=(px,h,v)=>{const o=new Int16Array(192);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const s=((v?7-y:y)*8+(h?7-x:x))*3,d=(y*8+x)*3;o[d]=px[s];o[d+1]=px[s+1];o[d+2]=px[s+2];}return o;};
  const key=px=>px.join(',');
  // Exact groups first.
  const groups=[],byKey=new Map();
  for(let i=0;i<n;i++){
    const px=block(i);let g=null;
    for(const [h,v] of [[0,0],[1,0],[0,1],[1,1]]){const k=key(h||v?flip(px,h,v):px);if(byKey.has(k)){g=byKey.get(k);break;}}
    if(!g){g={px,members:[],weight:0};groups.push(g);byKey.set(key(px),g);}
    g.members.push(i);g.weight++;
  }
  if(groups.length<=target)return {img,blocks:groups.length};
  const dist=(a,b)=>{let best=Infinity;for(const [h,v] of [[0,0],[1,0],[0,1],[1,1]]){const f=h||v?flip(b,h,v):b;let s=0;for(let i=0;i<192;i+=3){const dr=a[i]-f[i],dg=a[i+1]-f[i+1],db=a[i+2]-f[i+2];s+=3*dr*dr+4*dg*dg+2*db*db;if(s>=best)break;}if(s<best)best=s;}return best;};
  // Agglomerate: repeatedly fold the cheapest (weight-scaled) pair.
  let live=groups.map((g,i)=>({...g,id:i,alive:true}));
  const nearest=g=>{let best=Infinity,bi=-1;for(const o of live)if(o.alive&&o!==g){const d=dist(g.px,o.px)*Math.min(g.weight,o.weight);if(d<best){best=d;bi=o.id;}}g.best=best;g.bi=bi;};
  live.forEach(nearest);
  let count=live.length;
  while(count>target){
    let a=null;for(const g of live)if(g.alive&&(!a||g.best<a.best))a=g;
    const b=live[a.bi];
    if(!b.alive){nearest(a);continue;}
    // Keep the heavier block's pixels.
    const keep=a.weight>=b.weight?a:b,drop=keep===a?b:a;
    keep.members.push(...drop.members);keep.weight+=drop.weight;drop.alive=false;count--;
    for(const g of live)if(g.alive&&(g.bi===drop.id||g.bi===keep.id||g===keep))nearest(g);
  }
  const out=gfx.blank(img.width,img.height);out.data.set(img.data);
  for(const g of live){if(!g.alive)continue;
    // Write the representative into every member, choosing the best flip.
    for(const m of g.members){
      const orig=block(m);let bestF=[0,0],bd=Infinity;
      for(const [h,v] of [[0,0],[1,0],[0,1],[1,1]]){const f=h||v?flip(g.px,h,v):g.px;let s=0;for(let i=0;i<192;i++){const d=orig[i]-f[i];s+=d*d;}if(s<bd){bd=s;bestF=[h,v];}}
      const f=bestF[0]||bestF[1]?flip(g.px,bestF[0],bestF[1]):g.px,tx=m%cols,ty=(m/cols)|0;
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const d=((ty*8+y)*img.width+tx*8+x)*4,s=(y*8+x)*3;out.data[d]=f[s]*255/31|0;out.data[d+1]=f[s+1]*255/31|0;out.data[d+2]=f[s+2]*255/31|0;out.data[d+3]=255;}
    }
  }
  return {img:out,blocks:count};
}

// Palette fitting for BG pictures: iterative k-means over tiles. Each tile
// is assigned to the palette that reproduces it with the least error; each
// palette is a weighted k-means of its tiles' colours. Returns the same
// shape as gfx.makeBg. Weighted RGB555 distance (3,4,2).
const R=c=>c&31,G=c=>c>>5&31,B=c=>c>>10&31;
const dist=(a,b)=>{const dr=R(a)-R(b),dg=G(a)-G(b),db=B(a)-B(b);return 3*dr*dr+4*dg*dg+2*db*db;};
function kmeansColors(hist,n,iterations=12){
  const colors=[...hist.entries()];
  if(colors.length<=n)return colors.map(([c])=>c);
  // k-means++ style seeding, deterministic: farthest weighted point.
  colors.sort((a,b)=>b[1]-a[1]);
  const centers=[colors[0][0]];
  const best=new Float64Array(colors.length).fill(Infinity);
  while(centers.length<n){
    const last=centers[centers.length-1];let bi=-1,bs=-1;
    for(let i=0;i<colors.length;i++){const d=dist(colors[i][0],last);if(d<best[i])best[i]=d;const s=best[i]*colors[i][1];if(s>bs){bs=s;bi=i;}}
    if(bs<=0)break;centers.push(colors[bi][0]);
  }
  let cs=centers.map(c=>[R(c),G(c),B(c)]);
  for(let it=0;it<iterations;it++){
    const acc=cs.map(()=>[0,0,0,0]);
    for(const [c,w] of colors){
      let bi=0,bd=Infinity;const r=R(c),g=G(c),b=B(c);
      for(let i=0;i<cs.length;i++){const d=3*(r-cs[i][0])**2+4*(g-cs[i][1])**2+2*(b-cs[i][2])**2;if(d<bd){bd=d;bi=i;}}
      acc[bi][0]+=r*w;acc[bi][1]+=g*w;acc[bi][2]+=b*w;acc[bi][3]+=w;
    }
    cs=acc.map((a,i)=>a[3]?[a[0]/a[3],a[1]/a[3],a[2]/a[3]]:cs[i]);
  }
  return [...new Set(cs.map(([r,g,b])=>Math.round(r)|(Math.round(g)<<5)|(Math.round(b)<<10)))];
}
// Group palettes: each group (a histogram Map colour->count) is assigned to
// one of P palettes of `colors` entries; k-means alternating palette fits
// and group assignment. Returns {palettes:[[colours]], assign:Int16Array}.
export function fitGroupPalettes(groups,{P=7,colors=15,iterations=8}={}){
  const live=groups.map((h,i)=>i).filter(i=>groups[i].size);
  const mean=h=>{let r=0,g=0,b=0,w=0;for(const [c,k] of h){r+=R(c)*k;g+=G(c)*k;b+=B(c)*k;w+=k;}return [r/w,g/w,b/w];};
  const order=[...live].sort((a,b)=>{const ma=mean(groups[a]),mb=mean(groups[b]);return (ma[0]*3+ma[1]*6+ma[2])-(mb[0]*3+mb[1]*6+mb[2]);});
  const assign=new Int16Array(groups.length).fill(-1);
  const n=Math.max(1,Math.min(P,live.length));
  order.forEach((t,i)=>assign[t]=Math.floor(i*n/order.length));
  const err=(h,pal)=>{let e=0;for(const [c,k] of h){let bd=Infinity;for(const p of pal){const d=dist(c,p);if(d<bd)bd=d;}e+=bd*k;}return e;};
  let pals=[];
  for(let it=0;it<iterations;it++){
    pals=[];
    for(let p=0;p<n;p++){const h=new Map();for(const t of live)if(assign[t]===p)for(const [c,k] of groups[t])h.set(c,(h.get(c)??0)+k);pals.push(h.size?kmeansColors(h,colors):[0]);}
    let changed=0;
    for(const t of live){let bp=assign[t],be=Infinity;for(let p=0;p<n;p++){const e=err(groups[t],pals[p]);if(e<be){be=e;bp=p;}}if(bp!==assign[t]){assign[t]=bp;changed++;}}
    if(!changed)break;
  }
  return {palettes:pals,assign};
}
export function nearestIn(pal,c){let bi=0,bd=Infinity;for(let i=0;i<pal.length;i++){const d=dist(pal[i],c);if(d<bd){bd=d;bi=i;}}return bi;}

// BG picture with fitted palettes. `colors` per palette (15, or 14 to
// reserve index 15); `unique` = set of tile numbers never deduplicated or
// flipped (tiles patched at runtime).
export function makeBgFit(img,{maxPalettes=7,paletteBase=1,tileBase=0,iterations=8,dedupe=true,alpha=128,colors=15,unique=null}={}){
  const cols=img.width>>3,rows=img.height>>3,n=cols*rows;
  const tiles=[];
  for(let t=0;t<n;t++){
    const tx=t%cols,ty=(t/cols)|0,px=new Int32Array(64),h=new Map();
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=((ty*8+y)*img.width+tx*8+x)*4;let c=-1;if(img.data[i+3]>=alpha){c=gfx.to555(img.data[i],img.data[i+1],img.data[i+2]);h.set(c,(h.get(c)??0)+1);}px[y*8+x]=c;}
    tiles.push({px,h});
  }
  const {palettes:pals,assign}=fitGroupPalettes(tiles.map(t=>t.h),{P:maxPalettes,colors,iterations});
  const palettes=pals.map(p=>{const out=[0,...p];while(out.length<16)out.push(0);return out.slice(0,16);});
  const flip=(px,h,v)=>{const o=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)o[y*8+x]=px[(v?7-y:y)*8+(h?7-x:x)];return o;};
  const key=px=>Buffer.from(px).toString('base64');
  const out=[],index=new Map(),map=new Uint16Array(n),tileIds=new Int32Array(n);
  for(let t=0;t<n;t++){
    const p=Math.max(0,assign[t]),pal=palettes[p]??[0],px=new Uint8Array(64);
    for(let i=0;i<64;i++){const c=tiles[t].px[i];if(c>=0)px[i]=1+nearestIn(pal.slice(1,1+colors),c);}
    let id=-1,h=0,v=0;
    const fixed=unique&&unique.has(t);
    if(dedupe&&!fixed)for(const [fh,fv] of [[0,0],[1,0],[0,1],[1,1]]){const k=key(fh||fv?flip(px,fh,fv):px);if(index.has(k)){id=index.get(k);h=fh;v=fv;break;}}
    if(id<0){id=out.length;out.push(px);if(!fixed)index.set(key(px),id);}
    map[t]=((id+tileBase)&0x3ff)|(((p+paletteBase)&7)<<10)|(h<<14)|(v<<15);tileIds[t]=id;
  }
  const bytes=new Uint8Array(out.length*32);
  out.forEach((px,i)=>bytes.set(gfx.encodeTile(px,8,0,0,4),i*32));
  return {tiles:bytes,tileCount:out.length,map,palettes,tileIds,assign};
}

// A BG picture: tiles, a 32x32 map (rows past the picture repeat the last
// row), palettes. map words already carry palette/flip/priority bits.
export function bgPicture(img,{maxPalettes=7,paletteBase=1,tileBase=0,priority=0,backdrop=null,fit=false,colors=15,unique=null}={}){
  const bg=fit?makeBgFit(img,{maxPalettes,paletteBase,tileBase,colors,unique}):gfx.makeBg(img,{maxPalettes,paletteBase,tileBase,backdrop});
  const cols=img.width>>3,rows=img.height>>3,map=new Uint16Array(32*32);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const sy=Math.min(rows-1,y),sx=Math.min(cols-1,x);
    map[y*32+x]=x<cols?(bg.map[sy*cols+sx]|(priority?0x2000:0)):0;
  }
  return {tiles:bg.tiles,tileCount:bg.tileCount,map,palettes:bg.palettes,raw:bg,tileIds:bg.tileIds};
}
export const u16bytes=a=>{const o=new Uint8Array(a.length*2);a.forEach((v,i)=>{o[i*2]=v&255;o[i*2+1]=v>>8;});return o;};
