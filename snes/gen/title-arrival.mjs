// Arrival art and timelines for the title module (helper for title.mjs; no
// generate export). Everything is computed with the browser's own code:
//   engine/saiyan-pod.js     pod frames (airborne, closed, half open, open)
//   engine/native-crater.js  the original Potos hole, drawn at 2x
//   engine/native-effects.js original spell cells (orbs, sparks, lightning)
//   engine/arrival.js        drawScene's positions, reproduced per age below
// Output: OBJ cells (16x16, 4bpp) at fixed OBJ VRAM tiles, three OBJ
// palettes, per-age sprite lists relative to the sword's screen position.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// OBJ VRAM cells (16x16 = tiles t, t+1, t+16, t+17; VRAM word $6000+16t).
// Chosen from tiles never displayed or streamed on map 128 in 75 sampled
// browser states (opening, arrival, later visits) and outside party regions.
// The effect cells are needed only during the impact; they also use core's
// claimable pool regions A/B (claimed for the scene) and the companions'
// region $1A0 (no companion exists during the opening).
export const CELLS={
  crater:[0x0c0,0x0c2,0x0c4,0x0c6,0x0c8,0x0ca,0x0cc,0x0ce,0x0e0,0x0e2,0x0e4,0x0e6,0x0e8,0x0ea,0x0ec,0x0ee,0x080],
  pod:[0x088,0x08a,0x08c,0x08e,0x106,0x108,0x10a,0x10c,0x10e],
  fx:[0x082,0x084,0x086,0x160,0x162,0x164,0x166,0x122,0x124,0x126,0x128,0x12a,0x12c,0x12e,0x184,0x186,0x188,0x18a,0x1a0,0x1a2,0x1a4,0x1a6],
};
export const PAL={fx:2,crater:6,pod:7};
const PRIO=3;
// Native sprites sharing the impact's scanlines: the hero's shadow (the
// hero is hidden until he hops out) and one spare sprite.
const NATIVE_SLIVERS=4,NATIVE_SPRITES=2;
const rgb=c=>c-1; // engine colors are 1+BGR555

function cellPixels(get,w,h,cx,cy){
  const px=new Uint8Array(256);let any=false;
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const v=get(cx*16+x,cy*16+y);px[y*16+x]=v;if(v)any=true;}
  return any?px:null;
}
// 16x16 indexed cell -> 4 tiles (TL,TR,BL,BR), 32 bytes each.
function encodeCell(px){
  const tiles=[];
  for(const [ox,oy] of [[0,0],[8,0],[0,8],[8,8]]){
    const t=new Uint8Array(32);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const v=px[(oy+y)*16+ox+x],b=7-x;
      if(v>15)throw Error('pixel index out of range');
      t[y*2]|=(v&1)<<b;t[y*2+1]|=((v>>1)&1)<<b;t[16+y*2]|=((v>>2)&1)<<b;t[16+y*2+1]|=((v>>3)&1)<<b;
    }
    tiles.push(t);
  }
  return tiles;
}
// Upload runs for cells placed at the given tiles: consecutive cells in one
// tile row share a top run and a bottom run.
function uploads(cellTiles,cellData,label){
  const runs=[];
  for(let i=0;i<cellTiles.length;){
    let j=i+1;
    while(j<cellTiles.length&&cellTiles[j]===cellTiles[j-1]+2&&((cellTiles[j]&15)!==0))j++;
    const top=[],bottom=[];
    for(let k=i;k<j;k++){const [tl,tr,bl,br]=cellData[k];top.push(...tl,...tr);bottom.push(...bl,...br);}
    runs.push({vram:0x6000+cellTiles[i]*16,bytes:top});
    runs.push({vram:0x6000+(cellTiles[i]+16)*16,bytes:bottom});
    i=j;
  }
  return runs.map((r,n)=>({...r,label:`${label}_${n}`}));
}
const tileWord=(tile,pal,flipH=false)=>(tile&0x1ff)|(pal<<9)|(PRIO<<12)|(flipH?0x4000:0);

export async function arrivalArt(rom,repo){
  const eng=p=>import(pathToFileURL(join(repo,'engine',p)).href);
  const {saiyanPodFrames,drawSaiyanPod}=await eng('saiyan-pod.js');
  const {decodePotosCrater}=await eng('native-crater.js');
  const {createNativeEffects}=await eng('native-effects.js');
  const manifest=JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8'));

  // --- Pod: four 48x48 frames sharing one 15-colour palette.
  const air=new Uint16Array(48*48);
  drawSaiyanPod({plan:{},pixel(x,y,c){if(x>=0&&y>=0&&x<48&&y<48)air[y*48+x]=c;}},0,0,0,true);
  const podFrames=[air,...saiyanPodFrames.map(f=>f.pixels)];
  const podColors=[];
  for(const f of podFrames)for(const c of f)if(c&&!podColors.includes(c))podColors.push(c);
  if(podColors.length>15)throw Error('Pod needs more than 15 colours');
  const podIndex=c=>c?podColors.indexOf(c)+1:0;
  const podCells=podFrames.map(f=>{
    const cells=[];
    for(let cy=0;cy<3;cy++)for(let cx=0;cx<3;cx++){
      const px=cellPixels((x,y)=>podIndex(f[y*48+x]),48,48,cx,cy);
      cells.push({dx:cx*16,dy:cy*16,px:px??new Uint8Array(256)});
    }
    return cells;
  });

  // --- Crater: 48x32 source pixels at 2x, 7 colours, deduplicated cells
  // (horizontal mirroring included).
  const crater=decodePotosCrater(rom);
  const craterColors=[];
  for(const c of crater.pixels)if(c&&!craterColors.includes(c))craterColors.push(c);
  if(craterColors.length>7)throw Error('Crater needs more than 7 colours');
  const craterUnique=[],craterSprites=[];
  const key=px=>px.join(',');
  const mirror=px=>{const m=new Uint8Array(256);for(let y=0;y<16;y++)for(let x=0;x<16;x++)m[y*16+x]=px[y*16+15-x];return m;};
  for(let cy=0;cy<4;cy++)for(let cx=0;cx<6;cx++){
    const px=cellPixels((x,y)=>{const c=crater.pixels[(y>>1)*48+(x>>1)];return c?craterColors.indexOf(c)+1:0;},96,64,cx,cy);
    if(!px)continue;
    let i=craterUnique.findIndex(u=>key(u)===key(px)),flip=false;
    if(i<0){i=craterUnique.findIndex(u=>key(u)===key(mirror(px)));flip=i>=0;}
    if(i<0){i=craterUnique.length;craterUnique.push(px);}
    // The browser composes the crater per scanline (getColor's line y, the
    // first visible line being 1): one row above an OBJ placed at the same y.
    craterSprites.push({dx:cx*16-48,dy:cy*16-32-1,cell:i,flip});
  }
  if(craterUnique.length>CELLS.crater.length)throw Error(`Crater needs ${craterUnique.length} cells`);

  // --- Effects: 16x16 spell cells. Each frame uses 4 colours; frames are
  // packed into two OBJ palettes (fx: orbs, sparks, beam heads, lightning
  // frame 0 or the impact sparks' darker set; crater: lightning 1-2).
  const groups=createNativeEffects(rom,manifest);
  const fxPalA=[0x031c,0x2fff,0x7fff,0x0278,0x72d4,0x7b58,0x7fdc,0x76d6,0x7b39,0x7b9c,0x7d8c,0x7e52,0x7f5a];
  const fxPalB=[0x031c,0x2fff,0x7fff,0x0278,0x72d4,0x7b58,0x7fdc,0x76d6,0x7b39,0x7b9c,0x54e7,0x5d4a,0x61ad,0x6a10];
  const craterPal=[...craterColors.map(rgb),0x7fff,0x710e,0x7df4,0x7f19,0x02d4,0x03ba,0x4bff];
  if(craterPal.length>15)throw Error('Crater palette overflow');
  const fxCells=[],fxCell={};
  const want=[['gold-charge-orb'],['beam-head'],['lightning'],['impact-spark'],['gold-spark']];
  for(const [group] of want){
    fxCell[group]=[];
    groups[group].forEach((pixels,frame)=>{
      const cols=new Set();for(const c of pixels)if(c)cols.add(rgb(c));
      // palette: fx variant A covers everything except the dark impact set
      // and lightning frames 1-2; variant B (from age 36) has the dark set.
      let pal,table;
      if(group==='lightning'&&frame>0){pal=PAL.crater;table=craterPal;}
      else if([...cols].every(c=>fxPalA.includes(c)&&fxPalB.includes(c))){pal=PAL.fx;table=fxPalA;}
      else if([...cols].every(c=>fxPalA.includes(c))){pal=PAL.fx;table=fxPalA;}
      else if([...cols].every(c=>fxPalB.includes(c))){pal=PAL.fx;table=fxPalB;}
      else throw Error(`No palette for ${group} ${frame}`);
      const px=new Uint8Array(256);
      for(let i=0;i<256;i++){const c=pixels[i];if(!c)continue;const k=table.indexOf(rgb(c));if(k<0)throw Error(`colour ${rgb(c).toString(16)} missing for ${group} ${frame}`);px[i]=k+1;}
      // fxPalA and fxPalB must agree on every shared index used here
      fxCell[group].push(fxCells.length);
      fxCells.push({group,frame,pal,px,variant:table===fxPalB?'B':table===fxPalA?'A':'crater'});
    });
  }
  for(let i=0;i<10;i++)if(fxPalA[i]!==fxPalB[i])throw Error('fx palette variants disagree on shared entries');
  if(fxCells.length>CELLS.fx.length)throw Error(`Effects need ${fxCells.length} cells`);
  // Variant B cells must not appear before age 36; variant A-only lightning
  // frame 0 must not appear from age 36 (checked in the timeline below).

  // --- Timelines (engine/arrival.js drawScene).
  const craterLayout=craterSprites.map(sp=>({dy:sp.dy}));
  const podLayout=podCells[0].map(c=>({dy:c.dy}));
  const R=Math.round;
  const stamp=(list,group,frame,x,y,kind=group)=>{const f=groups[group].length;const k=((frame%f)+f)%f;list.push({dx:x-8,dy:y-8,cell:fxCell[group][k],kind});};
  // Descent: pod top-left relative to (cx, cy) and its entry trail.
  const descent=[];
  for(let age=0;age<=59;age++){
    const t=Math.min(1,age/59),x=R(64*(1-t)-24),y=R(-48-220*(1-t));
    descent.push({x,y});
  }
  // Entry trail, relative to the pod's top-left (the same every age);
  // drawn after the pod in the browser, so in front of it.
  const trail=[];
  for(let i=5;i>=1;i--)stamp(trail,'gold-charge-orb',Math.max(0,4-i),24+i*5,12-i*12);
  // Impact: pod position/frame, explosion stamps (front to back order).
  const impact=[];
  for(let age=0;age<110;age++){
    const settle=Math.min(1,age/42),podX=R(-24+24*settle),podY=R(-48-10*settle-Math.sin(settle*Math.PI)*9);
    const open=age<58?0:age<74?1:2,airborne=age<42,frame=Math.floor(age/3);
    // drawScene order: pod, (Goku), radial+beam pairs, centre orb, lightning,
    // then gold sparks; later draws are in front.
    const drawn=[];
    if(age<84){
      const radius=Math.min(48,age*1.5);
      for(let i=0;i<12;i++){
        const angle=i*Math.PI*2/12,ox=R(Math.cos(angle)*radius),oy=R(Math.sin(angle)*radius*.65);
        stamp(drawn,age<40?'gold-charge-orb':'impact-spark',frame+i,ox,-12+oy,'radial');
        if(age<44)stamp(drawn,'beam-head',frame+i,R(ox*.45),-12+R(oy*.45));
      }
      stamp(drawn,'gold-charge-orb',frame,0,-12,'centre');
      if(age<36)for(let i=-2;i<=2;i++)stamp(drawn,'lightning',frame+i,i*18,-32-Math.abs(i)*6);
    }
    if(age>=40&&age<110)for(let i=0;i<8;i++){
      const angle=i*Math.PI/4,radius=30+(age-40)/2;
      stamp(drawn,'gold-spark',frame+i,R(Math.cos(angle)*radius),-20+R(Math.sin(angle)*radius*.5));
    }
    for(const s of drawn){
      const v=fxCells[s.cell].variant;
      if(v==='B'&&age<36)throw Error('impact palette used too early');
      if(v==='A'&&fxCells[s.cell].px.some(p=>p>=11)&&age>=36)throw Error('lightning palette used too late');
      if(s.dx<-128||s.dx>127||s.dy<-128||s.dy>127)throw Error('stamp offset out of range');
    }
    // Hardware: at most 32 sprites and 34 8-pixel slivers per scanline. The
    // browser stacks up to 30 stamps around the centre; keep the most
    // visible ones that fit beside the crater (6 per line), the pod (3) and
    // the hero's shadow, in priority order, and drop the rest for this age.
    const used=new Map(),count=new Map();
    const take=(y,w=2)=>{for(let r=0;r<16;r++){used.set(y+r,(used.get(y+r)??0)+w);count.set(y+r,(count.get(y+r)??0)+1);}};
    const fits=y=>{for(let r=0;r<16;r++)if((used.get(y+r)??0)+2>34-NATIVE_SLIVERS||(count.get(y+r)??0)+1>32-NATIVE_SPRITES)return false;return true;};
    for(const c of craterLayout)take(c.dy);
    for(const c of podLayout)take(podY+c.dy);
    const order=['centre','lightning','radial','gold-spark','beam-head'];
    const keep=new Set();
    for(const kind of order)for(const st of drawn)if(st.kind===kind&&fits(st.dy)){take(st.dy);keep.add(st);}
    const kept=drawn.filter(st=>keep.has(st));
    impact.push({podX,podY,open,airborne,stamps:kept.reverse(),dropped:drawn.length-kept.length}); // OAM: first added is in front
  }
  // Goku's hop (age 78-109): y = c + round((d-c)*h - 12 sin(h*pi)); the
  // sine part in 1/256 pixels, the linear part is exact.
  const hopSine=Array.from({length:33},(_,k)=>R(12*256*Math.sin(k/32*Math.PI)));

  // --- VRAM data.
  const craterData=craterUnique.map(encodeCell);
  const podData=podCells.map(cells=>cells.map(c=>encodeCell(c.px)));
  const fxData=fxCells.map(c=>encodeCell(c.px));
  return {
    palettes:{pod:podColors.map(rgb),crater:craterPal,craterColors:craterColors.length,fxA:fxPalA,fxB:fxPalB},
    crater:{sprites:craterSprites.map(s=>({dx:s.dx,dy:s.dy,word:tileWord(CELLS.crater[s.cell],PAL.crater,s.flip)})),uploads:uploads(CELLS.crater.slice(0,craterData.length),craterData,'crater'),cells:craterData.length},
    pod:{sprites:podCells[0].map((c,i)=>({dx:c.dx,dy:c.dy,word:tileWord(CELLS.pod[i],PAL.pod)})),uploads:podData.map((d,f)=>uploads(CELLS.pod,d,`pod${f}`))},
    fx:{words:fxCells.map((c,i)=>tileWord(CELLS.fx[i],c.pal)),uploads:uploads(CELLS.fx.slice(0,fxData.length),fxData,'fx'),cells:fxData.length},
    descent,trail:trail.reverse(),impact,hopSine,
  };
}
