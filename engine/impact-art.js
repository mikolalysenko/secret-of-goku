// "Impact frame" art for connected hits: starbursts sized by the blow and
// the finishing kick's expanding shockwave with radial speed lines. Shared
// by the browser (sprite-layer.js draws the parts) and the cartridge
// generator (snes/gen/fx.mjs packs the same cells and assemblies for
// FX_STAR / FX_SHOCK), so both builds show identical pixels. No game art.
//
// Cells are 16x16 tone maps: 0 transparent, 1 the white core, 2 the rim
// tint. The cartridge draws them in the impact spark's own palette class
// (blue, or gold for Super Saiyan blows), which holds both colours, so an
// impact frame never needs another OBJ palette. A star is mirror symmetric
// about both axes through its centre (the corner between four pixels): one
// quadrant cell, flipped into the other three. The shockwave reuses five
// cells (three arc pieces, two speed lines) placed further out each frame,
// so after its first frame nothing new has to be uploaded.
export const IMPACT_COLORS={blue:[0x7fff,0x76d6],gold:[0x7fff,0x2fff]};
export const IMPACT_STAR_LIFE=2;
// The shockwave leaves the contact one frame after the starburst (frames
// IMPACT_SHOCK_DELAY .. +IMPACT_SHOCK_LIFE-1 after the contact), so the
// contact's own frame carries only the burst.
export const IMPACT_SHOCK_LIFE=6;
export const IMPACT_SHOCK_DELAY=1;
// Long spike radius of each star size (ki, jab, cross, kick).
const STAR_RADIUS=[7,12,14,16];
// Shockwave: ring radius per frame, the radius the arc pieces are drawn
// for, and the speed lines' length and gap beyond the ring.
const SHOCK_RADIUS=[11,15,19,22,25,27];
const ARC_RADIUS=19,ARC_HALF=Math.PI/9,LINE_LENGTH=6,LINE_GAP=4;

// An eight-pointed star: long spikes on the axes, shorter ones on the
// diagonals, straight edges between tips and valleys (pixel centres tested).
function starPolygon(long,short,valley){
  const points=[];
  for(let k=0;k<16;k++){
    const a=k*Math.PI/8,r=k%2?valley:k%4===0?long:short;
    points.push([Math.cos(a)*r,Math.sin(a)*r]);
  }
  return points;
}
function insidePolygon(points,x,y){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
// The star: white with a one-pixel tinted rim.
function starTest(size){
  const R=STAR_RADIUS[size];
  const star=starPolygon(R,R*.72,R*.4),core=starPolygon(R-1.6,R*.72-1.6,R*.4-1.1);
  return (x,y)=>insidePolygon(core,x,y)||Math.hypot(x,y)<R*.5-1?1:insidePolygon(star,x,y)||Math.hypot(x,y)<R*.5?2:0;
}

// Shockwave cells, each centred on its 16x16 cell (pixel centre offsets
// -7.5..7.5): a piece of the ring facing angle a (its outward direction),
// and a speed line along angle a, white at its outer end.
function arcCell(a){
  const px=new Uint8Array(256),cx=Math.cos(a)*ARC_RADIUS,cy=Math.sin(a)*ARC_RADIUS;
  for(let j=0;j<16;j++)for(let i=0;i<16;i++){
    const x=i-7.5+cx,y=j-7.5+cy,d=Math.hypot(x,y),t=Math.atan2(y,x)-a,da=Math.abs(Math.atan2(Math.sin(t),Math.cos(t)));
    if(da>ARC_HALF)continue;
    if(Math.abs(d-ARC_RADIUS)<.75)px[j*16+i]=1;
    else if(Math.abs(d-ARC_RADIUS)<1.3)px[j*16+i]=2;
  }
  return px;
}
function lineCell(a){
  const px=new Uint8Array(256),ux=Math.cos(a),uy=Math.sin(a);
  for(let j=0;j<16;j++)for(let i=0;i<16;i++){
    const x=i-7.5,y=j-7.5,t=x*ux+y*uy,n=Math.abs(x*uy-y*ux);
    if(Math.abs(t)<=LINE_LENGTH/2&&n<.6)px[j*16+i]=t>0?1:2;
  }
  return px;
}

// Quadrant cells of a symmetric picture `span` pixels wide: cell (cx, cy)
// holds pixel centres (16 cx + i + .5, 16 cy + j + .5).
function quadrantCells(test,span){
  const cells=[],n=span/32;
  for(let cy=0;cy<n;cy++)for(let cx=0;cx<n;cx++){
    const px=new Uint8Array(256);let any=false;
    for(let j=0;j<16;j++)for(let i=0;i<16;i++){const t=test(cx*16+i+.5,cy*16+j+.5);if(t){px[j*16+i]=t;any=true;}}
    if(any)cells.push({px,cx,cy});
  }
  return cells;
}
// Parts of a symmetric picture from its quadrant cells: each cell in the
// four quadrants, flipped (ox, oy = the sprite's top-left from the centre).
function mirrored(cells){
  const parts=[];
  for(const {px,cx,cy} of cells){
    parts.push({px,ox:cx*16,oy:cy*16,h:false,v:false});
    parts.push({px,ox:-16-cx*16,oy:cy*16,h:true,v:false});
    parts.push({px,ox:cx*16,oy:-16-cy*16,h:false,v:true});
    parts.push({px,ox:-16-cx*16,oy:-16-cy*16,h:true,v:true});
  }
  return parts;
}
function fullCell(test){
  const px=new Uint8Array(256);
  for(let j=0;j<16;j++)for(let i=0;i<16;i++)px[j*16+i]=test(i-7.5,j-7.5);
  return [{px,ox:-8,oy:-8,h:false,v:false}];
}
// A cell centred at (x, y) from the picture's centre (its pixel 8, 8 lands
// there): the sprite's top-left offsets.
const placed=(px,x,y,h,v)=>({px,ox:Math.round(x)-8,oy:Math.round(y)-8,h,v});

// The shockwave at ring radius R: eight arc pieces (axes and diagonals) and
// eight speed lines between them (22.5 degrees + k * 45), all flips of the
// five cells drawn for the first quadrant's directions.
function shockParts(cells,R){
  const parts=[],{arcAxisX,arcAxisY,arcDiag,line22,line67}=cells;
  const dirs=[[1,0,arcAxisX,false,false],[-1,0,arcAxisX,true,false],[0,1,arcAxisY,false,false],[0,-1,arcAxisY,false,true],
    [1,1,arcDiag,false,false],[-1,1,arcDiag,true,false],[1,-1,arcDiag,false,true],[-1,-1,arcDiag,true,true]];
  for(const [dx,dy,px,h,v] of dirs){const s=dx&&dy?Math.SQRT1_2:1;parts.push(placed(px,dx*s*R,dy*s*R,h,v));}
  const r=R+LINE_GAP+LINE_LENGTH/2;
  for(const [ax,ay] of [[1,1],[-1,1],[1,-1],[-1,-1]]){
    for(const [px,a] of [[line22,Math.PI/8],[line67,3*Math.PI/8]])
      parts.push(placed(px,ax*Math.cos(a)*r,ay*Math.sin(a)*r,ax<0,ay<0));
  }
  return parts;
}

let cache=null;
// {stars: [size] -> parts, shock: [frame] -> parts}; parts are
// {px, ox, oy, h, v}, sharing px objects for repeated cells.
export function impactArt(){
  if(cache)return cache;
  const stars=STAR_RADIUS.map((_,size)=>size===0?fullCell(starTest(size)):mirrored(quadrantCells(starTest(size),32)));
  const cells={arcAxisX:arcCell(0),arcAxisY:arcCell(Math.PI/2),arcDiag:arcCell(Math.PI/4),line22:lineCell(Math.PI/8),line67:lineCell(3*Math.PI/8)};
  const shock=SHOCK_RADIUS.map(R=>shockParts(cells,R));
  cache={stars,shock};
  return cache;
}

// Picture of an impact effect `age` frames after the contact: star size 0-3
// for IMPACT_STAR_LIFE frames, then the shockwave's IMPACT_SHOCK_LIFE
// frames from IMPACT_SHOCK_DELAY on; null when there is none.
export function impactParts(kind,size,age){
  const art=impactArt();
  if(kind==='star')return age>=0&&age<IMPACT_STAR_LIFE?art.stars[size]:null;
  if(kind==='shock'){const f=age-IMPACT_SHOCK_DELAY;return f>=0&&f<IMPACT_SHOCK_LIFE?art.shock[f]:null;}
  return null;
}

// Draw a picture's parts at centre (x, y) with put(x, y, colour) (BGR555),
// every opaque pixel of every part flipped as the cartridge's OAM entries
// flip them, in the blue or gold tones.
export function drawImpact(parts,x,y,put,gold=false){
  if(!parts)return;
  const colors=gold?IMPACT_COLORS.gold:IMPACT_COLORS.blue;
  for(const {px,ox,oy,h,v} of parts)for(let j=0;j<16;j++)for(let i=0;i<16;i++){
    const t=px[(v?15-j:j)*16+(h?15-i:i)];
    if(t)put(x+ox+i,y+oy+j,colors[t-1]);
  }
}
