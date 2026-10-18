// Space pictures for the ending generator: the globe (planet-view.js
// planet()), the seeded starfield (planet-view.js stars) and an explosion
// fracture designed for SNES sprites (planet-fragments.js adapted: every
// piece is one 32x32 OBJ or one/two 16x16 OBJ). Surfaces are Uint16Array
// 256x224 of 1+RGB555, 0 = empty.
import {decodePlanetTexture} from '../../engine/world-texture.js';
import {rgb} from './ending-art.mjs';

export const VIEW={x:87,y:140,r:72};
export const DEFAULT_TARGET={x:2432,y:3024};
export const BLUE=[rgb(4,7,20),rgb(6,17,30),rgb(16,26,31),rgb(31,31,31)];

// planet-view.js planet(): stepped target, four light bands, 3-px rim.
export function planetSurface(rom,{target=DEFAULT_TARGET,night=true,view=VIEW}={}){
  const texture=decodePlanetTexture(rom);
  target={x:Math.round(target.x/8)*8,y:Math.round(target.y/8)*8};
  const globe=new Uint16Array(256*224);
  const cx=Math.round(view.x),cy=Math.round(view.y),r=Math.round(view.r),hitX=.62,hitY=-.69,hitZ=Math.sqrt(1-hitX*hitX-hitY*hitY);
  const lon=target.x/4096*Math.PI*2-Math.atan2(hitX,hitZ),lat=target.y/4096*Math.PI-Math.asin(hitY);
  for(let y=Math.max(0,cy-r-3);y<=Math.min(223,cy+r+3);y++)for(let x=Math.max(0,cx-r-3);x<=Math.min(255,cx+r+3);x++){
    const nx=(x-cx)/r,ny=(y-cy)/r,d=nx*nx+ny*ny;if(d>1.07)continue;
    let color;
    if(d>1)color=BLUE[d<1.035?1:0]-1;
    else{
      const z=Math.sqrt(1-d),wx=(lon+Math.atan2(nx,z))*4096/(Math.PI*2),wy=(lat+Math.asin(ny))*4096/Math.PI;
      const raw=texture.sample(wx,wy,night),light=Math.max(1,Math.min(4,Math.round((.35+z*.65-nx*.16-ny*.18)*4)));
      const shade=c=>(c*light)>>2;
      color=shade(raw&31)|(shade(raw>>5&31)<<5)|(shade(raw>>10&31)<<10);
    }
    globe[y*256+x]=color+1;
  }
  return globe;
}

// planet-view.js stars (fixed seed, independent coordinates).
export function starList(){
  let seed=0x53a19e27;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;},result=[];
  while(result.length<100){
    const x=Math.floor(random()*256),y=Math.floor(random()*224);
    if(result.some(s=>Math.abs(s.x-x)+Math.abs(s.y-y)<4))continue;
    result.push({x,y,shade:Math.floor(random()*4),phase:Math.floor(random()*240),bright:random()<.05});
  }
  return result;
}
export const starColor=shade=>rgb(5+shade*2,7+shade*2,11+shade*3);

// OBJ composition of a piece (relative to its box): one 16x16 when it fits,
// two 16x16 when one side fits 16, else one 32x32.
export function pieceSprites(w,h){
  if(w<=16&&h<=16)return [{x:0,y:0,size:16}];
  if(w<=16)return [{x:0,y:0,size:16},{x:0,y:16,size:16}];
  if(h<=16)return [{x:0,y:0,size:16},{x:16,y:0,size:16}];
  return [{x:0,y:0,size:32}];
}
export const spriteTiles=sprites=>sprites.reduce((a,s)=>a+(s.size===32?16:4),0);

// fragmentPose distance (planet-fragments.js): t*speed + .003 t^2, radial.
export const pieceOffset=(p,t)=>{const d=t*p.speed+t*t*.003;return {x:Math.round(p.dx*d),y:Math.round(p.dy*d)};};

// Per-scanline sliver load over t = 0..115 (a 16x16 is 2 slivers on 16
// lines, a 32x32 4 slivers on 32 lines); `over` counts line-frames above
// `limit` slivers (34 is the hardware limit; 2 are kept for a spark).
export function lineLoad(pieces,{limit=32}={}){
  let worst=0,over=0;
  for(let t=0;t<=115;t++){
    const line=new Int16Array(224);
    for(const p of pieces){
      const o=pieceOffset(p,t),x=p.left+o.x,y=p.top+o.y;
      for(const sp of p.sprites){
        const sx=x+sp.x,sy=y+sp.y;if(sx<=-sp.size||sx>=256)continue;
        for(let yy=sy;yy<sy+sp.size;yy++)if(yy>=0&&yy<224)line[yy]+=sp.size/8;
      }
    }
    for(let y=0;y<224;y++){worst=Math.max(worst,line[y]);if(line[y]>limit)over++;}
  }
  return {worst,over};
}

// The browser breaks the globe into 64 Voronoi shards of ~20 px; the OBJ
// tile budget (512 tiles of 8x8) cannot hold that many 32x32 cells, so the
// cartridge uses ~30 pieces: rows of random height split at random,
// staggered joints, boundaries wiggling with smooth noise inside the slack
// left to 32 px, small rim pieces merged into a neighbour, and the largest
// bricks cut along random oblique lines (triangles and trapezoids) while
// OBJ tiles remain. Among candidates, the one with the most pieces and the
// fewest overloaded scanlines during the drift wins.
export function brickFracture(globe,{candidates=60,maxTiles=496,seed0=0x6a09e667,rowMin=27,rowVar=5,jointMin=27,jointVar=5,overWeight=2,pieceWeight=20,restLimit=34}={}){
  const px=[];for(let i=0;i<globe.length;i++)if(globe[i])px.push(i);
  let top=999,bottom=-1;for(const i of px){const y=(i/256)|0;if(y<top)top=y;if(y>bottom)bottom=y;}
  let best=null;
  const bbox=set=>{let l=999,t=999,r=-1,b=-1;for(const i of set){const x=i%256,y=(i/256)|0;if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}return {l,t,r,b};};
  for(let c=0;c<candidates;c++){
    let s=(seed0+c*0x9e3779b9)>>>0;
    const rnd=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};
    const wave=amp=>{const ws=Array.from({length:3},()=>({k:.08+rnd()*.25,ph:rnd()*6.283,a:amp*(.3+rnd()*.7)}));const sum=ws.reduce((a,w)=>a+w.a,0)||1;return v=>ws.reduce((a,w)=>a+w.a*Math.sin(v*w.k+w.ph),0)*amp/sum;};
    // Columns of 32-px blocks: within a column blocks are exactly 32 lines
    // (their sprites never share a scanline); each column has its own
    // vertical offset and the joints between columns wiggle in the slack.
    let left=999,right=-1;for(const i of px){const x=i%256;if(x<left)left=x;if(x>right)right=x;}
    const cols=[];let x0=left-1-rnd()*(jointMin*.5);
    while(x0<=right){const w=jointMin+rnd()*jointVar;cols.push({x0,w,off:Math.floor(rnd()*32)});x0+=w;}
    const jf=cols.map((c,j)=>{if(!j)return ()=>0;const slack=Math.max(0,(32-Math.max(cols[j-1].w,c.w))/2-.5);return wave(slack);});
    const owner=new Int16Array(256*224).fill(-1),ids=new Map();
    for(const i of px){
      const x=i%256,yy=(i/256)|0;
      let j=0;while(j+1<cols.length&&x>=cols[j+1].x0+jf[j+1](yy))j++;
      const k=Math.floor((yy-top+cols[j].off)/32);
      const key=j*64+k;if(!ids.has(key))ids.set(key,ids.size);owner[i]=ids.get(key);
    }
    const sets=Array.from({length:ids.size},()=>new Set());
    for(const i of px)sets[owner[i]].add(i);
    for(let changed=true;changed;){
      changed=false;
      const order=sets.map((_,k)=>k).filter(k=>sets[k].size).sort((a,b)=>sets[a].size-sets[b].size);
      for(const k of order){
        if(sets[k].size>=140)break;
        const nb=new Set();for(const i of sets[k])for(const d of [1,-1,256,-256]){const o=owner[i+d];if(o>=0&&o!==k&&sets[o].size)nb.add(o);}
        let tgt=-1,bs=Infinity;
        for(const o of nb){const b=bbox(new Set([...sets[o],...sets[k]]));if(b.r-b.l>=32||b.b-b.t>=32)continue;const sc=(b.r-b.l+1)*(b.b-b.t+1);if(sc<bs){bs=sc;tgt=o;}}
        if(tgt<0)continue;
        for(const i of sets[k]){sets[tgt].add(i);owner[i]=tgt;}sets[k].clear();changed=true;break;
      }
    }
    const live=sets.map((_,k)=>k).filter(k=>sets[k].size);
    if(live.some(k=>{const b=bbox(sets[k]);return b.r-b.l>=32||b.b-b.t>=32;}))continue;
    const cost=k=>{const b=bbox(sets[k]);return spriteTiles(pieceSprites(b.r-b.l+1,b.b-b.t+1));};
    // Worst scanline (slivers) with every piece at rest.
    const restLoad=ks=>{const line=new Int16Array(224);for(const k of ks){if(!sets[k].size)continue;const b=bbox(sets[k]);for(const sp of pieceSprites(b.r-b.l+1,b.b-b.t+1))for(let yy=b.t+sp.y;yy<b.t+sp.y+sp.size&&yy<224;yy++)line[yy]+=sp.size/8;}return Math.max(...line);};
    let tiles=live.reduce((a,k)=>a+cost(k),0);
    if(tiles>maxTiles)continue;
    const split=new Set();
    for(let guard=0;guard<64;guard++){
      let k=-1,bs=0;for(const q of live)if(!split.has(q)&&sets[q].size>bs){bs=sets[q].size;k=q;}
      if(k<0||bs<420)break;
      split.add(k);
      const pts=[...sets[k]],cx=pts.reduce((a,i)=>a+i%256,0)/pts.length,cy=pts.reduce((a,i)=>a+((i/256)|0),0)/pts.length;
      const ang=(.2+rnd()*.6)*Math.PI*(rnd()<.5?1:-1),nx=Math.cos(ang),ny=Math.sin(ang),wob=wave(1.5);
      const a=new Set(),b=new Set();
      for(const i of pts){const x=i%256,y=(i/256)|0;((x-cx)*nx+(y-cy)*ny+wob(x*ny-y*nx)<0?a:b).add(i);}
      if(a.size<90||b.size<90)continue;
      const before=cost(k),old=sets[k];sets[k]=a;const nk=sets.length;sets.push(b);
      const after=cost(k)+cost(nk);
      if(tiles-before+after>maxTiles||restLoad([...live,nk])>restLimit){sets[k]=old;sets.pop();continue;}
      for(const i of b)owner[i]=nk;live.push(nk);split.add(nk);
      tiles+=after-before;
    }
    const pieces=live.map(k=>{
      const pixels=[...sets[k]],xs=pixels.map(i=>i%256),ys=pixels.map(i=>(i/256)|0);
      const p={pixels,left:Math.min(...xs),top:Math.min(...ys)};
      p.width=Math.max(...xs)-p.left+1;p.height=Math.max(...ys)-p.top+1;
      p.cx=xs.reduce((a,b)=>a+b,0)/xs.length;p.cy=ys.reduce((a,b)=>a+b,0)/ys.length;
      const a=Math.atan2(p.cy-VIEW.y,p.cx-VIEW.x);p.dx=Math.cos(a);p.dy=Math.sin(a);p.speed=.32+rnd()*.7;
      const mask=new Set(pixels);p.edge=new Set(pixels.filter(i=>[-1,1,-256,256].some(d=>!mask.has(i+d))));
      p.sprites=pieceSprites(p.width,p.height);
      return p;
    });
    const load=lineLoad(pieces);
    const score=load.over*overWeight+load.worst-pieces.length*pieceWeight;
    if(globalThis.ENDING_FRACTURE_DEBUG)console.log('candidate',c,'pieces',pieces.length,'tiles',tiles,JSON.stringify(load));
    if(!best||score<best.score)best={score,pieces,load,tiles};
  }
  if(!best)throw Error('no brick fracture fits the OBJ budget');
  return best;
}

// Fragment motion (planet-fragments.js fragmentPose): the piece moves
// radially by t*speed + .003 t^2; the cartridge reads round(dx*d),
// round(dy*d) per drift frame from a table (ending_frag_offsets).
export const FRAG_FRAMES=115;
export function pieceOffsetExact(p,t){const d=t*p.speed+t*t*.003;return {x:Math.round(p.dx*d),y:Math.round(p.dy*d)};}
export function piecePos(p,t){const o=pieceOffsetExact(p,t);return {x:p.left+o.x,y:p.top+o.y};}
// planet-view explodingPlanet sparks: spell('gold-spark', (t>>2)+i, ...)
// drawn centred on 87 + cos(a)*dist, 140 + sin(a)*dist (top-left = -8).
export const SPARKS=18;
export function sparkPos(i,t){
  const a=i*2.39996,dist=20+t*(.65+i%5*.17);
  return {x:Math.round(87+Math.cos(a)*dist)-8,y:Math.round(140+Math.sin(a)*dist)-8,frame:((t>>2)+i)&3};
}
// The white flash disc (t < 8): radius min(86, 18 + 10t).
export const discRadius=t=>t<8?Math.min(86,18+t*10):-1;

// Per-frame sprite budget of the drift (t = 0..69): pieces whose sprites
// sit wholly inside the flash disc are skipped (they would be white), then
// sparks are kept in index order while every scanline stays within 34
// slivers and 32 sprites (no time-over: the PPU would drop the first
// sprites' tiles, i.e. the sparks drawn on top). Pieces always fit (the
// fracture keeps them within 32 slivers per line).
export function sparkBudget(pieces){
  const cull=[],keep=[];
  for(let t=0;t<70;t++){
    const tiles=new Int16Array(224),count=new Int16Array(224),r=discRadius(t),culled=new Set();
    let index=0;
    // Conservative: a sprite partly off the left edge counts all its tiles.
    const add=(x,y,size)=>{
      let n=0;for(let c=0;c<size;c+=8)if(x+c<256)n++;
      if(x<=-size||!n)return;
      for(let yy=y;yy<y+size;yy++)if(yy>=0&&yy<224){tiles[yy]+=n;count[yy]++;}
    };
    pieces.forEach(p=>{
      const pos=piecePos(p,t);
      p.sprites.forEach(s=>{
        const x=pos.x+s.x,y=pos.y+s.y,k=index++;
        if(r>0){const corners=[[x,y],[x+s.size-1,y],[x,y+s.size-1],[x+s.size-1,y+s.size-1]];
          if(corners.every(([cx,cy])=>(cx-87)**2+(cy-140)**2<=r*r)){culled.add(k);return;}}
        if(x<=-s.size||x>=256||y<=-s.size||y>=224)return;
        add(x,y,s.size);
      });
    });
    cull.push(culled);
    // Greedy from a start index that rotates every frame, so in crowded
    // frames the sparks left out change (they flicker instead of vanishing).
    let mask=0;
    for(let k=0;k<SPARKS;k++){
      const i=(t*7+k)%SPARKS,s=sparkPos(i,t);
      if(s.y<=-16||s.y>=224||s.x<=-16||s.x>=256){continue;}
      let n=0;for(let c=0;c<16;c+=8)if(s.x+c<256)n++;
      let fits=true;for(let yy=s.y;yy<s.y+16;yy++)if(yy>=0&&yy<224&&(tiles[yy]+n>34||count[yy]+1>32)){fits=false;break;}
      if(!fits)continue;
      mask|=1<<i;add(s.x,s.y,16);
    }
    keep.push(mask);
  }
  return {cull,keep};
}
