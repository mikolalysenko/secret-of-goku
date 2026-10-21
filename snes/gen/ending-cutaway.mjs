// The Fortress cutaway in world flight (planet-view.js prepare() with a shot:
// world-ki.js cutaway, 186 frames): the globe, the beam with its shock ring
// and dust, and the fade over 164-186. ending-globes supplies BG1 and its
// shared day/night palettes (planet-view with Frieza's crisis); everything else
// is built here per age with planet-view's own formulas (sky, beam):
//   BG2 (chars at $7000): the stars, plus "footprint" cells redrawn per age
//     (every cell the beam, the ring or a twinkling star ever touches; high
//     priority, with the stars outside the globe composited in);
//   OBJ: the 64 dust particles, one OAM image per age;
//   CGRAM: one 512-byte image per globe and fade level.
// All of it is extended data; per-age indexes go into the module's second
// code area (ending_cut_tables.asm).
import {rgb} from './ending-art.mjs';

export const CUT_AGES=186;
const START={x:132,y:90},DX=.66,DY=-.7513;

// planet-view.js beam(age) as three layers: the band and the ring (pixel
// maps, later put() wins) and the dust discs.
export function beamLayers(age,blue){
  const band=new Map(),ring=new Map(),dust=[];
  const put=(m,x,y,c)=>{x=Math.round(x);y=Math.round(y);if(c>0&&x>=0&&x<256&&y>=0&&y<224)m.set(y*256+x,c);};
  const envelope=Math.max(0,Math.min(1,(age+8)/14,(112-age)/30));
  const length=210*Math.min(1,(age+12)/24),width=18*envelope;
  if(envelope>0)for(let y=0;y<114;y++)for(let x=100;x<256;x++){
    const along=(x-START.x)*DX+(y-START.y)*DY,across=Math.abs((x-START.x)*DY-(y-START.y)*DX);
    const radius=width*(.48+.52*Math.min(1,(along+6)/32));
    if(along<0||along>length||across>radius)continue;
    const edge=radius-across;put(band,x,y,blue[edge<2?0:edge<4?1:edge<7?2:3]);
  }
  const spread=8+age*.26;
  if(age<88)for(let i=0;i<80;i++){
    const a=i*Math.PI/40;put(ring,START.x+Math.cos(a)*spread,START.y+Math.sin(a)*spread*.34,blue[age<25?3:1]);
  }
  for(let i=0;i<64;i++){
    const delay=i%9*3,t=age-delay;if(t<0||t>105+i%5*9)continue;
    const a=i*2.39996,speed=.16+(i%7)*.065,px=START.x+Math.cos(a)*t*speed+DX*t*.19,py=START.y+Math.sin(a)*t*speed+DY*t*.13;
    const color=t<25?blue[2+i%2]:t<70?rgb(16+i%4,18+i%4,20+i%5):rgb(7,9,13);
    if((i+t)%4!==0||t<70)dust.push({i,x:Math.round(px),y:Math.round(py),r:t<60&&i%4===0?2:1,color});
  }
  return {band,ring,dust};
}

// planet-view.js sky(age) star pixels: index -> star shade 1-4.
export function starPixels(stars,age){
  const m=new Map(),put=(x,y,v)=>{if(x>=0&&x<256&&y>=0&&y<224)m.set(y*256+x,v);};
  for(const s of stars){
    put(s.x,s.y,1+s.shade);
    if(s.bright&&(age+s.phase)%240<9){put(s.x-1,s.y,1+s.shade);put(s.x+1,s.y,1+s.shade);put(s.x,s.y-1,1+s.shade);put(s.x,s.y+1,1+s.shade);}
  }
  return m;
}

// The browser's fade (prepare(): age > 164, factor (186 - age) / 22, floor
// per channel) of a raw RGB555 colour.
export const fadeColor=(c,factor)=>Math.floor((c&31)*factor)|(Math.floor((c>>5&31)*factor)<<5)|(Math.floor((c>>10&31)*factor)<<10);
export const fadeFactor=age=>age>164?Math.max(0,(186-age)/22):1;

// space: {S, stars, starMap, globeMask (Uint8Array 256x224, 1 = globe
// pixel), pal7 (16 raw colours), blue (4 raw colours), globePals: {day,
// night} (96 raw colours each, palettes 1-6)}.
export function cutawayAssets(o,{gfx,u16bytes,xblob,space}){
  const {S,stars,starMap,globeMask,blue}=space;
  const blueC=blue.map(c=>c+1);                      // rgb()+1 form, as planet-view
  const P7=[...space.pal7];P7[13]=blue[3];            // palette 7: stars 1-4, blue[0..3] at 10-13
  const bandIdx=c=>10+blueC.indexOf(c);
  // ---- footprint: every cell the band, the ring or a twinkle touches ----
  const layers=[],cells=new Set();
  for(let a=0;a<CUT_AGES;a++){
    const l=beamLayers(a,blueC);layers.push(l);
    for(const i of l.band.keys())cells.add((i>>11)*32+((i&255)>>3));
    for(const i of l.ring.keys())cells.add((i>>11)*32+((i&255)>>3));
  }
  for(const s of stars.filter(s=>s.bright))for(const [x,y] of [[s.x,s.y],[s.x-1,s.y],[s.x+1,s.y],[s.x,s.y-1],[s.x,s.y+1]])
    if(x>=0&&x<256&&y>=0&&y<224)cells.add((y>>3)*32+(x>>3));
  const cellList=[...cells].sort((a,b)=>a-b);
  if(S+cellList.length>256)throw Error(`cutaway BG2 tiles: ${S} stars + ${cellList.length} footprint cells exceed 256`);
  // One image per footprint cell (64 indices) per age.
  const cellImages=[];
  for(let a=0;a<CUT_AGES;a++){
    const st=starPixels(stars,a),{band,ring}=layers[a],img=cellList.map(()=>new Uint8Array(64));
    cellList.forEach((cell,k)=>{
      const tx=cell&31,ty=cell>>5,px=img[k];
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        const i=(ty*8+y)*256+tx*8+x;
        let v=globeMask[i]?0:(st.get(i)??0);  // stars behind the globe stay hidden
        if(band.has(i))v=bandIdx(band.get(i));
        if(ring.has(i))v=bandIdx(ring.get(i));
        px[y*8+x]=v;
      }
    });
    cellImages.push(img.map(px=>gfx.encodeTile(px,8,0,0,4)));
  }
  // Slots in order of the ages at which each cell changes, so the cells a
  // frame redraws together are mostly neighbours (fewer, longer uploads).
  const sig=k=>{let t='';for(let a=1;a<CUT_AGES;a++)t+=cellImages[a][k].some((v,j)=>v!==cellImages[a-1][k][j])?'1':'0';return t;};
  const order=cellList.map((c,k)=>({c,k,s:sig(k)})).sort((x,y)=>x.s<y.s?1:x.s>y.s?-1:x.c-y.c);
  const fp=order.map(o=>o.c),F=fp.length,slotOf=new Map(fp.map((c,k)=>[c,k]));
  const images=cellImages.map(img=>order.map(o=>img[o.k]));
  // BG2 map: stars (palette 7, low priority) and footprint slots (high).
  const map=new Uint16Array(32*32);
  for(let t=0;t<1024;t++)map[t]=slotOf.has(t)?(S+slotOf.get(t))|(7<<10)|0x2000:starMap[t];
  const fpVram=k=>0x7000+(S+k)*16;
  // Age 0 whole; then per age the runs of consecutive slots that changed:
  // word VRAM address, byte count, the tiles; packed into <= 32 KiB blobs.
  const first=new Uint8Array(F*32);images[0].forEach((b,k)=>first.set(b,k*32));
  xblob('cut_fp0',first);
  const deltaBlobs=[];let cur=[],curLen=0;const rows=[];   // per age: blob, offset, runs, bytes
  for(let a=0;a<CUT_AGES;a++){
    const changed=a>0?images[a].map((b,k)=>b.some((v,j)=>v!==images[a-1][k][j])):[];
    const entries=[];let tiles=0;
    for(let k=0;k<changed.length;){
      if(!changed[k]){k++;continue;}
      let e=k;while(e<changed.length&&changed[e])e++;
      const run=new Uint8Array(4+(e-k)*32);
      run[0]=fpVram(k)&255;run[1]=fpVram(k)>>8;run[2]=((e-k)*32)&255;run[3]=((e-k)*32)>>8;
      for(let j=k;j<e;j++)run.set(images[a][j],4+(j-k)*32);
      entries.push(run);tiles+=e-k;k=e;
    }
    const len=entries.reduce((n,r)=>n+r.length,0);
    if(curLen+len>0x8000){deltaBlobs.push(cur);cur=[];curLen=0;}
    rows.push({blob:deltaBlobs.length,offset:curLen,count:entries.length,tiles});
    cur.push(...entries);curLen+=len;
  }
  deltaBlobs.push(cur);
  deltaBlobs.forEach((list,b)=>{const out=new Uint8Array(list.reduce((n,r)=>n+r.length,0));let at=0;for(const r of list){out.set(r,at);at+=r.length;}xblob(`cut_delta${b}`,out);});
  const maxDelta=Math.max(...rows.map(r=>r.tiles));
  // ---- dust: OBJ palettes 0-1, shapes r1 (plus) and r2 (disc) per index ----
  const dustColors=[...new Set(layers.flatMap(l=>l.dust.map(d=>d.color)))];
  if(dustColors.length>30)throw Error(`cutaway dust colours: ${dustColors.length}`);
  const dustPal=c=>{const k=dustColors.indexOf(c);return {pal:k<15?0:1,index:k%15+1};};
  const shapes=[[[1,0],[0,1],[1,1],[2,1],[1,2]],[]];
  for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++)if(xx*xx+yy*yy<=4)shapes[1].push([xx+2,yy+2]);
  const OBJ_BASE=64;                                   // OBJ tiles 64.. ($6400)
  const objTiles=new Uint8Array(2*15*32);
  for(let s=0;s<2;s++)for(let v=1;v<=15;v++){const px=new Uint8Array(64);for(const [x,y] of shapes[s])px[y*8+x]=v;objTiles.set(gfx.encodeTile(px,8,0,0,4),(s*15+v-1)*32);}
  xblob('cut_obj',objTiles);
  // One OAM image (512 + 32 bytes) per age: the last particle in front
  // (planet-view draws them in order), every other slot hidden.
  const AGES_PER_OAM=58,oamBlobs=[];
  for(let b=0;b*AGES_PER_OAM<CUT_AGES;b++){
    const n=Math.min(AGES_PER_OAM,CUT_AGES-b*AGES_PER_OAM),out=new Uint8Array(n*544);
    for(let j=0;j<n;j++){
      const a=b*AGES_PER_OAM+j,base=j*544,dust=[...layers[a].dust].reverse();
      for(let s=0;s<128;s++){out[base+s*4]=0xFF;out[base+s*4+1]=0xE0;}   // hidden below the picture
      dust.forEach((d,s)=>{
        const {pal,index}=dustPal(d.color),x=d.x-d.r,y=d.y-d.r;
        if(y<-8||y>=224||x<-8||x>=256){return;}
        const tile=OBJ_BASE+(d.r===2?15:0)+index-1;
        out[base+s*4]=x&255;out[base+s*4+1]=y&255;out[base+s*4+2]=tile&255;out[base+s*4+3]=0x30|(pal<<1)|(tile>>8);
        const hi=base+512+(s>>2),sh=(s&3)*2;out[hi]=(out[hi]&~(3<<sh))|((x<0?1:0)<<sh);
      });
    }
    oamBlobs.push(out);xblob(`cut_oam${b}`,out);
  }
  // ---- palettes: per globe (day, night) the 22 fade levels -------------
  const sky=rgb(0,0,2)-1;
  const cgramFor=(globePal,factor)=>{
    const c=new Uint16Array(256);
    c[0]=sky;
    globePal.forEach((v,k)=>{if(k%16)c[16+k]=v;});
    P7.forEach((v,k)=>{if(k)c[112+k]=v;});
    dustColors.forEach((v,k)=>{c[128+(k<15?0:16)+k%15+1]=v-1;});
    return u16bytes(c.map(v=>fadeColor(v,factor)));
  };
  for(const [name,pal] of [['day',space.globePals.day],['night',space.globePals.night]]){
    const out=new Uint8Array(22*512);
    for(let level=0;level<22;level++)out.set(cgramFor(pal,level?(22-level)/22:1),level*512);
    xblob(`cut_pal_${name}`,out);
  }
  xblob('cut_bg2_map',u16bytes(map));
  // ---- tables for the second code area ----
  const t=o.cut;
  t.def('ENDING_CUT_FP',F);
  t.def('ENDING_CUT_FP_VRAM',fpVram(0));
  t.def('ENDING_CUT_AGES',CUT_AGES);
  t.def('ENDING_CUT_OAM_AGES',AGES_PER_OAM);
  t.def('ENDING_CUT_OAM_BLOBS',oamBlobs.length);
  t.raw('ending_cut_delta_rows:');
  for(const r of rows)t.raw(`\tdl ending_cut_delta${r.blob}+${r.offset} : dw ${r.count}`);
  t.raw('ending_cut_oam_blobs:');
  for(let b=0;b<oamBlobs.length;b++)t.raw(`\tdl ending_cut_oam${b}`);
  o.stats.cutaway={footprint:F,stars:S,maxDeltaTiles:maxDelta,maxDeltaBytes:maxDelta*32,maxRuns:Math.max(...rows.map(r=>r.count)),deltaBytes:curLen,dustColors:dustColors.length,
    dustMax:Math.max(...layers.map(l=>l.dust.length))};
}
