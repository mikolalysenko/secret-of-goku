// Shared SNES graphics conversion for the cartridge generators.
// Images are {width, height, data: Uint8Array RGBA}. Colours are RGB555
// words (0bbbbbgggggrrrrr). Palette index 0 is always transparent.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let PNG=null;
function png(){if(!PNG)PNG=require('pngjs').PNG;return PNG;}

export function readPng(path){
  const p=png().sync.read(readFileSync(path));
  return {width:p.width,height:p.height,data:new Uint8Array(p.data)};
}
export function writePng(img){
  const P=png(),p=new P({width:img.width,height:img.height});
  p.data=Buffer.from(img.data);return P.sync.write(p);
}
export function blank(width,height){return {width,height,data:new Uint8Array(width*height*4)};}
export function crop(img,x,y,w,h){
  const out=blank(w,h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const sx=x+i,sy=y+j;if(sx<0||sy<0||sx>=img.width||sy>=img.height)continue;
    const s=(sy*img.width+sx)*4,d=(j*w+i)*4;
    out.data[d]=img.data[s];out.data[d+1]=img.data[s+1];out.data[d+2]=img.data[s+2];out.data[d+3]=img.data[s+3];
  }
  return out;
}
// Downscale by an integer factor. 'center' samples the block centre (for
// art authored at N× nearest-neighbour), 'mode' takes the most common
// opaque colour in the block (robust to slight misalignment).
export function downscale(img,factor,method='mode'){
  const w=Math.floor(img.width/factor),h=Math.floor(img.height/factor),out=blank(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let r=0,g=0,b=0,a=0;
    if(method==='center'){
      const s=((y*factor+(factor>>1))*img.width+(x*factor+(factor>>1)))*4;
      r=img.data[s];g=img.data[s+1];b=img.data[s+2];a=img.data[s+3];
    }else{
      const counts=new Map();let opaque=0;
      for(let j=0;j<factor;j++)for(let i=0;i<factor;i++){
        const s=((y*factor+j)*img.width+(x*factor+i))*4;
        if(img.data[s+3]<128)continue;opaque++;
        const k=to555(img.data[s],img.data[s+1],img.data[s+2]);counts.set(k,(counts.get(k)??0)+1);
      }
      if(opaque*2>=factor*factor){
        let best=-1,bn=-1;for(const[k,n]of counts)if(n>bn){bn=n;best=k;}
        [r,g,b]=from555(best);a=255;
      }
    }
    const d=(y*w+x)*4;out.data[d]=r;out.data[d+1]=g;out.data[d+2]=b;out.data[d+3]=a>=128?255:0;
  }
  return out;
}
export const to555=(r,g,b)=>((b>>3)<<10)|((g>>3)<<5)|(r>>3);
export const from555=c=>[(c&31)*255/31|0,((c>>5)&31)*255/31|0,((c>>10)&31)*255/31|0];
const dist555=(a,b)=>{const dr=(a&31)-(b&31),dg=((a>>5)&31)-((b>>5)&31),db=((a>>10)&31)-((b>>10)&31);return 3*dr*dr+4*dg*dg+2*db*db;};
// Histogram of opaque RGB555 colours.
export function histogram(img,alpha=128){
  const m=new Map();
  for(let i=0;i<img.data.length;i+=4){if(img.data[i+3]<alpha)continue;const k=to555(img.data[i],img.data[i+1],img.data[i+2]);m.set(k,(m.get(k)??0)+1);}
  return m;
}
// Reduce a weighted colour set to n colours (k-means seeded by popularity and spread).
export function quantize(hist,n){
  const colors=[...hist.entries()];
  if(colors.length<=n)return colors.map(([c])=>c);
  colors.sort((a,b)=>b[1]-a[1]);
  const centers=[colors[0][0]];
  while(centers.length<n){
    let best=null,bd=-1;
    for(const[c,w]of colors){let d=Infinity;for(const k of centers)d=Math.min(d,dist555(c,k));const s=d*Math.sqrt(w);if(s>bd){bd=s;best=c;}}
    centers.push(best);
  }
  let cs=centers.map(c=>from555(c));
  for(let it=0;it<12;it++){
    const acc=cs.map(()=>[0,0,0,0]);
    for(const[c,w]of colors){
      let bi=0,bd=Infinity;const rgb=from555(c);
      for(let i=0;i<cs.length;i++){const d=(rgb[0]-cs[i][0])**2*3+(rgb[1]-cs[i][1])**2*4+(rgb[2]-cs[i][2])**2*2;if(d<bd){bd=d;bi=i;}}
      acc[bi][0]+=rgb[0]*w;acc[bi][1]+=rgb[1]*w;acc[bi][2]+=rgb[2]*w;acc[bi][3]+=w;
    }
    cs=acc.map((a,i)=>a[3]?[a[0]/a[3],a[1]/a[3],a[2]/a[3]]:cs[i]);
  }
  const out=[...new Set(cs.map(([r,g,b])=>to555(Math.round(r),Math.round(g),Math.round(b))))];
  return out;
}
export function nearest(palette,c,start=1){
  let bi=start,bd=Infinity;
  for(let i=start;i<palette.length;i++){const d=dist555(palette[i],c);if(d<bd){bd=d;bi=i;}}
  return bi;
}
// Map an image to palette indices (0 = transparent). palette[0] is ignored.
export function indexImage(img,palette,alpha=128){
  const out=new Uint8Array(img.width*img.height),cache=new Map();
  for(let p=0;p<out.length;p++){
    const i=p*4;if(img.data[i+3]<alpha)continue;
    const c=to555(img.data[i],img.data[i+1],img.data[i+2]);
    let v=cache.get(c);if(v===undefined){v=nearest(palette,c);cache.set(c,v);}out[p]=v;
  }
  return out;
}
// One 8x8 tile from an index buffer (width w) at (x, y) into SNES planar bytes.
export function encodeTile(idx,w,x,y,bpp=4){
  const out=new Uint8Array(bpp*8);
  for(let row=0;row<8;row++){
    for(let plane=0;plane<bpp;plane++){
      let byte=0;
      for(let col=0;col<8;col++){const v=idx[(y+row)*w+x+col]??0;if((v>>plane)&1)byte|=0x80>>col;}
      const pair=plane>>1,lo=plane&1;out[pair*16+row*2+lo]=byte;
    }
  }
  return out;
}
export function decodeTile(bytes,offset=0,bpp=4){
  const px=new Uint8Array(64);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    let v=0;for(let plane=0;plane<bpp;plane++){const pair=plane>>1,lo=plane&1;if(bytes[offset+pair*16+row*2+lo]&(0x80>>col))v|=1<<plane;}
    px[row*8+col]=v;
  }
  return px;
}
// Arrange an index image (multiple of 16 px) as 16x16 OBJ blocks in VRAM
// order: each block is tiles n, n+1 (top) and n+16, n+17 (bottom) when laid
// out in a 16-tile-wide name table. Returns {tiles:[Uint8Array 32B], blocks:[[tl,tr,bl,br] indices]}.
export function objBlocks16(idx,w,h,bpp=4){
  const tiles=[],blocks=[];
  for(let by=0;by<h;by+=16)for(let bx=0;bx<w;bx+=16){
    const b=[];for(const[dx,dy]of[[0,0],[8,0],[0,8],[8,8]]){b.push(tiles.length);tiles.push(encodeTile(idx,w,bx+dx,by+dy,bpp));}
    blocks.push(b);
  }
  return {tiles,blocks};
}
export function palettesToBytes(palettes,size=16){
  const out=new Uint8Array(palettes.length*size*2);
  palettes.forEach((p,i)=>{for(let c=0;c<size;c++){const v=p[c]??0;out[(i*size+c)*2]=v&255;out[(i*size+c)*2+1]=v>>8;}});
  return out;
}
const tileKey=t=>Buffer.from(t).toString('base64');
function flipTile(px,h,v){const o=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)o[y*8+x]=px[(v?7-y:y)*8+(h?7-x:x)];return o;}
// Convert a full-colour image into a BG layer: up to `maxPalettes` palettes
// of 15 colours (+ shared index 0) assigned per 8x8 tile, deduplicated tiles
// with flips. Returns {tiles: Uint8Array, tileCount, map: Uint16Array (w/8*h/8), palettes: [[16 colours]]}.
// Map words: tile | (pal + paletteBase) << 10 | hflip << 14 | vflip << 15.
export function makeBg(img,{bpp=4,maxPalettes=8,paletteBase=0,tileBase=0,backdrop=null,dedupe=true,alpha=128}={}){
  const cols=img.width>>3,rows=img.height>>3,per=(1<<bpp)-1;
  const tileHists=[];
  for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++){
    const h=new Map();
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=((ty*8+y)*img.width+tx*8+x)*4;if(img.data[i+3]<alpha)continue;const c=to555(img.data[i],img.data[i+1],img.data[i+2]);if(backdrop!==null&&c===backdrop)continue;h.set(c,(h.get(c)??0)+1);}
    tileHists.push(h);
  }
  // Greedy palette grouping: merge tile colour sets while each group fits.
  let groups=tileHists.map((h,i)=>({tiles:[i],hist:new Map(h)})).filter(g=>g.hist.size>0);
  const reduce=g=>{if(g.hist.size>per){const q=quantize(g.hist,per);const nh=new Map();for(const[c,w]of g.hist){const k=q[nearest([0,...q],c)-1];nh.set(k,(nh.get(k)??0)+w);}g.hist=nh;}};
  groups.forEach(reduce);
  const union=(a,b)=>{const s=new Set(a.hist.keys());for(const k of b.hist.keys())s.add(k);return s.size;};
  groups.sort((a,b)=>b.hist.size-a.hist.size);
  let merged=[];
  for(const g of groups){
    let best=-1,bs=Infinity;
    for(let i=0;i<merged.length;i++){const u=union(merged[i],g);if(u<=per&&u<bs){bs=u;best=i;}}
    if(best>=0){for(const[c,w]of g.hist)merged[best].hist.set(c,(merged[best].hist.get(c)??0)+w);merged[best].tiles.push(...g.tiles);}
    else merged.push({tiles:[...g.tiles],hist:new Map(g.hist)});
  }
  // Too many groups: merge the most similar pairs and re-quantise.
  while(merged.length>maxPalettes){
    let bi=0,bj=1,bs=Infinity;
    for(let i=0;i<merged.length;i++)for(let j=i+1;j<merged.length;j++){const u=union(merged[i],merged[j]);if(u<bs){bs=u;bi=i;bj=j;}}
    const a=merged[bi],b=merged[bj];for(const[c,w]of b.hist)a.hist.set(c,(a.hist.get(c)??0)+w);a.tiles.push(...b.tiles);merged.splice(bj,1);reduce(a);
  }
  const palettes=merged.map(g=>{const p=[backdrop??0,...[...g.hist.keys()].sort((a,b)=>a-b)];while(p.length<per+1)p.push(0);return p;});
  const tilePal=new Int16Array(cols*rows).fill(0);
  merged.forEach((g,pi)=>g.tiles.forEach(t=>tilePal[t]=pi));
  const tiles=[],index=new Map(),map=new Uint16Array(cols*rows);
  for(let t=0;t<cols*rows;t++){
    const tx=t%cols,ty=(t/cols)|0,pal=palettes[tilePal[t]]??[0];
    const px=new Uint8Array(64);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=((ty*8+y)*img.width+tx*8+x)*4;if(img.data[i+3]<alpha)continue;const c=to555(img.data[i],img.data[i+1],img.data[i+2]);if(backdrop!==null&&c===backdrop)continue;px[y*8+x]=nearest(pal,c);}
    let id=-1,h=0,v=0;
    if(dedupe){for(const[fh,fv]of[[0,0],[1,0],[0,1],[1,1]]){const k=tileKey(flipTile(px,fh,fv));if(index.has(k)){id=index.get(k);h=fh;v=fv;break;}}}
    if(id<0){id=tiles.length;tiles.push(px);index.set(tileKey(px),id);}
    map[t]=((id+tileBase)&0x3ff)|(((tilePal[t]+paletteBase)&7)<<10)|(h<<14)|(v<<15);
  }
  const bytes=new Uint8Array(tiles.length*bpp*8);
  tiles.forEach((px,i)=>bytes.set(encodeTile(px,8,0,0,bpp),i*bpp*8));
  return {tiles:bytes,tileCount:tiles.length,map,palettes};
}
// Render index data back to RGBA for visual checks.
export function renderIndexed(idx,w,h,palette){
  const out=blank(w,h);
  for(let p=0;p<w*h;p++){const v=idx[p];if(!v)continue;const[r,g,b]=from555(palette[v]);out.data[p*4]=r;out.data[p*4+1]=g;out.data[p*4+2]=b;out.data[p*4+3]=255;}
  return out;
}
// Nearest-neighbour resize matching a canvas drawImage without smoothing.
export function resize(img,w,h){
  const out=blank(w,h);
  for(let y=0;y<h;y++){const sy=Math.min(img.height-1,Math.floor((y+0.5)*img.height/h));
    for(let x=0;x<w;x++){const sx=Math.min(img.width-1,Math.floor((x+0.5)*img.width/w));
      const s=(sy*img.width+sx)*4,d=(y*w+x)*4;out.data.set(img.data.subarray(s,s+4),d);}}
  return out;
}
// Render a makeBg() result back to RGBA for visual checks.
export function renderBg(bg,cols,rows,bpp=4,paletteBase=0,tileBase=0){
  const out=blank(cols*8,rows*8);
  for(let t=0;t<cols*rows;t++){
    const w=bg.map[t],id=(w&0x3ff)-tileBase,pal=bg.palettes[((w>>10)&7)-paletteBase],h=(w>>14)&1,v=(w>>15)&1;
    const px=decodeTile(bg.tiles,id*bpp*8,bpp);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=px[(v?7-y:y)*8+(h?7-x:x)];if(!c)continue;const[r,g,b]=from555(pal[c]);const d=(((t/cols|0)*8+y)*out.width+(t%cols)*8+x)*4;out.data[d]=r;out.data[d+1]=g;out.data[d+2]=b;out.data[d+3]=255;}
  }
  return out;
}
