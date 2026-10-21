// The wish flight for the ending generator (wish-flight.js): the night
// world under the rising Balls, as a Mode 7 floor.
//
// The browser samples the world texture (world-texture.js) per pixel:
// z = floor(20000 / (y - horizon + 6)), side = floor((x - 128) z / 164),
// X = originX + ((vx (z + travel) - vy side) >> 8), likewise Y. On the
// cartridge that is one Mode 7 matrix per line K = y - horizon + 6:
// A = -vy T1(K), C = vx T1(K) (the step along the line), B = vx T2(K),
// D = vy T2(K) (the line's start, times K), with T1 = 256 z / 164 and
// T2 = 256 z / K in 8.8 and (vx, vy) / 256 the heading. The floor's tiles
// and map are converted from the cartridge's own world data at run time
// (C6:0000 packed tiles, C6:7D80 palette nibbles, the row RLE of C0:9A00)
// into a 128x128 tile window chosen here to hold most of what the browser
// samples; outside it Mode 7 repeats the window.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gfx,imageToSurface,objCell,u16bytes,nearestIn} from './ending-art.mjs';
import {kiFrames,kiCell,starCell,dragonPicture} from './ending-vista.mjs';

export const FLIGHT={kMin:13,kMax:160,poseFrom:60,poseTo:240,turnFrom:180,turnTo:420};
// OBJ name table 1 (VRAM $6000, tiles 256-479): cells f (16x16, tile
// (f >> 3) * 32 + (f & 7) * 2), the vista's rows 0-3: Balls 0-7, Shenron
// 8-30, the star tiles 31; cells 32-54 buffer the next Shenron size.
// Once Shenron has gone: sparks 8-11 (the vista's
// cells 32-35), the Balls at size 10 in row 2 (16-22), at sizes 8, 6, 4
// (one at a time) in row 3's top tiles, the star tiles still at 31.
export const FCELL={ball:0,dragon:8,spark:8,ball10:16,small:24,stars:31};

export async function flightAssets(o,{rom,repo,engine}){
  const dragonCells=o.vistaDragonCells,ballPal=o.vistaBallPalette;
  const {wishFlightPose,wishFlightTiming:T}=await engine(repo,'wish-flight.js');
  const {orbitVectors}=await engine(repo,'orbit-pixels.js');
  const word=a=>rom[a]|rom[a+1]<<8;
  const originX=rom[0x67a80+198*2]*16,originY=rom[0x67a81+198*2]*16;
  o.def('ENDING_FLIGHT_OX',originX);o.def('ENDING_FLIGHT_OY',originY);
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{n=clamp(n);return n*n*(3-2*n);};
  const heading=age=>{
    const turn=ease((age-180)/240)*3,index=Math.floor(turn),blend=turn-index;
    const a=orbitVectors[12+index],b=orbitVectors[Math.min(15,13+index)];
    return [Math.round(a[0]+(b[0]-a[0])*blend),Math.round(a[1]+(b[1]-a[1])*blend)];
  };
  // Per age 60..240: horizon, Shenron's y (signed), the Balls' ring centre
  // y and radius (wishFlightPose).
  const pose=[];
  for(let age=FLIGHT.poseFrom;age<=FLIGHT.poseTo;age++){
    const p=wishFlightPose(age),u=ease((age-T.rise)/(T.apex-T.rise));
    pose.push(p.horizon,p.dragonY&255,Math.round(192-136*u),Math.round(28-u*16));
  }
  o.blob('flight_pose',Uint8Array.from(pose));
  // Per age 180..420: the heading (vx, vy + 256), both 0..255 on this turn.
  const turn=[];
  for(let age=FLIGHT.turnFrom;age<=FLIGHT.turnTo;age++){const [vx,vy]=heading(age);if(vx<0||vx>255||vy+256<0||vy+256>255)throw Error('flight heading out of range');turn.push(vx,vy+256);}
  o.blob('flight_turn',Uint8Array.from(turn));
  // T1, T2 per K (8.8), K = kMin..kMax.
  const t12=[];
  for(let K=FLIGHT.kMin;K<=FLIGHT.kMax;K++){const z=Math.floor(20000/K);t12.push(Math.round(256*z/164),Math.round(256*z/K));}
  if(Math.max(...t12)>32767)throw Error('flight T table overflows a Mode 7 parameter');
  o.blob('flight_t12',u16bytes(Uint16Array.from(t12)));
  o.def('ENDING_FLIGHT_KMIN',FLIGHT.kMin);o.def('ENDING_FLIGHT_KMAX',FLIGHT.kMax);
  // The window: count the browser's floor samples per world tile over the
  // flight (every 6th frame) and take the 128x128 window holding the most.
  const count=new Float64Array(512*512);
  for(let age=30;age<480;age+=6){
    const p=wishFlightPose(age),h=p.horizon,[vx,vy]=heading(age),travel=Math.round(age*.75);
    for(let y=h+1;y<224;y++){
      const z=Math.floor(20000/(y-h+6));
      for(let x=0;x<256;x+=2){
        const side=Math.floor((x-128)*z/164);
        const X=(originX+((vx*(z+travel)-vy*side)>>8))&4095,Y=(originY+((vy*(z+travel)+vx*side)>>8))&4095;
        count[(Y>>3)*512+(X>>3)]+=1;
      }
    }
  }
  let best={n:-1};
  for(let y0=0;y0<512;y0+=4)for(let x0=0;x0<=384;x0+=4){
    let n=0;for(let dy=0;dy<128;dy+=2)for(let dx=0;dx<128;dx+=2)n+=count[((y0+dy)&511)*512+x0+dx];
    if(n>best.n)best={n,x0,y0};
  }
  let total=0;for(const v of count)total+=v;
  o.def('ENDING_FLIGHT_WX',best.x0);o.def('ENDING_FLIGHT_WY',best.y0);
  // World tiles used inside the window (1 bit each, tiles 0-239).
  const used=new Uint8Array(30);let runs=0;
  for(let r=0;r<128;r++){
    const y=(best.y0+r)&511,bank=6+((rom[0x67fc0+(y>>3)]>>(y&7))&1);let at=(bank<<16)+word(0x68000+y*2),x=0;
    while(x<512){const op=rom[at++],n=op<0xc0?1:op-0xbf,v=op<0xc0?op:rom[at++];if(x+n>best.x0&&x<best.x0+128){used[v>>3]|=1<<(v&7);runs++;}x+=n;}
  }
  o.table('ending_flight_tileuse','db',[...used]);
  // Below the horizon the first lines (K < kMin) show the far floor: its
  // most common colour (night palette) as the backdrop there.
  const world=(await engine(repo,'world-texture.js')).decodePlanetTexture(rom);
  const far=new Map();
  for(let age=60;age<480;age+=20){
    const p=wishFlightPose(age),h=p.horizon,[vx,vy]=heading(age),travel=Math.round(age*.75);
    for(let y=h+1;y<h+FLIGHT.kMin-6+1&&y<224;y++){const z=Math.floor(20000/(y-h+6));for(let x=0;x<256;x+=4){const side=Math.floor((x-128)*z/164);const c=world.sample(originX+((vx*(z+travel)-vy*side)>>8),originY+((vy*(z+travel)+vx*side)>>8),true);far.set(c,(far.get(c)??0)+1);}}
  }
  o.def('ENDING_FLIGHT_FAR',[...far].sort((a,b)=>b[1]-a[1])[0][0]);
  // Stars (createWishFlight): 86, from the browser's hash.
  const stars=[];
  for(let i=0;i<86;i++){let n=Math.imul(i+137,0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);const s=(n>>>20)&3,cell=FCELL.stars,tile=((cell>>3)*32+(cell&7)*2+(s&1)+(s>>1)*16)&255;stars.push((n>>>0)%256,(n>>>8)%160,tile);}
  o.blob('flight_stars',Uint8Array.from(stars));
  // Sprites after the scatter (all 16x16): cell row 2 holds the Balls at
  // size 10 (cells 16-22); row 3's top tiles hold one smaller size at a
  // time, Ball i's 8x8 tile at column 2 i (the three tiles beside and below
  // it stay empty, so it is drawn as the top-left of a 16x16 sprite), the
  // star tiles at columns 14-15. Blob: row 2 (1 KiB), then row 3's top
  // tiles for sizes 8, 6, 4 (512 bytes each).
  const sheet=gfx.readPng(join(repo,'assets/sprites/dragon-balls.png')),bs=imageToSurface(sheet,128);
  const frames=kiFrames(bs,sheet.width,sheet.height,4,2);
  const index=s=>{const ix=new Uint8Array(s.length);for(let i=0;i<s.length;i++)if(s[i]){const c=s[i]-1;let bi=1,bd=Infinity;for(let k=1;k<16;k++){const p=ballPal[k];const d=3*((c&31)-(p&31))**2+4*((c>>5&31)-(p>>5&31))**2+2*((c>>10&31)-(p>>10&31))**2;if(d<bd){bd=d;bi=k;}}ix[i]=bi;}return ix;};
  const row2=new Uint8Array(0x400);
  for(let i=0;i<7;i++){const b=objCell(index(kiCell(bs,sheet.width,frames[i],10)),16,0,0,16),base=((FCELL.ball10+i)&7)*0x40;row2.set(b.subarray(0,64),base);row2.set(b.subarray(64,128),base+0x200);}
  const star=objCell(starCell(),16,0,0,16);
  const tops=[8,6,4].map(size=>{
    const top=new Uint8Array(0x200);
    for(let i=0;i<7;i++){
      const src=index(kiCell(bs,sheet.width,frames[i],size)),px=new Uint8Array(64);   // centred on (8, 8)
      for(let y=0;y<8;y++)for(let x=0;x<8;x++)px[y*8+x]=src[(y+4)*16+x+4];
      top.set(gfx.encodeTile(px,8,0,0,4),i*2*32);
    }
    top.set(star.subarray(0,64),14*32);   // the star tiles' top pair
    return top;
  });
  const cellsBlob=new Uint8Array(0x400+3*0x200);cellsBlob.set(row2,0);tops.forEach((t,k)=>cellsBlob.set(t,0x400+k*0x200));
  o.blob('flight_cells',cellsBlob);
  // Every integer width, sampled from the same original image as the
  // browser's blit. Rows wholly above the screen at the FIRST age of a
  // width never come back, so omit their cells. Each image is a whole
  // number of 1 KiB OBJ rows; it streams into the hidden buffer in vblank.
  // The star cell at the end of buffer 0 is retained in every image.
  const palettes=o.vistaDragonPalettes.map(p=>p.slice(1));
  const templates=new Uint8Array(25*256),sizes=[],uploads=[];
  const firstAge=w=>{for(let a=60;a<=240;a++)if(wishFlightPose(a).dragonSize===w)return a;};
  for(let age=60;age<=240;age++)sizes.push(72-wishFlightPose(age).dragonSize);
  let scaleBytes=0;
  for(let w=72;w>=48;w--){
    const h=Math.round(w*140/128),surface=dragonPicture(repo,w,h),dy=wishFlightPose(firstAge(w)).dragonY,cells=[];
    for(let cy=0;cy<5;cy++)for(let cx=0;cx<5;cx++){
      const s=new Uint16Array(256);
      for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(cx*16+x<w&&cy*16+y<h)s[y*16+x]=surface[(cy*16+y)*w+cx*16+x];
      if(!s.some((c,i)=>c&&cy*16+(i>>4)+dy>=0))continue;
      const error=pal=>s.reduce((sum,c)=>{if(!c)return sum;const v=c-1,p=pal[nearestIn(pal,v)];return sum+3*((v&31)-(p&31))**2+4*((v>>5&31)-(p>>5&31))**2+2*((v>>10&31)-(p>>10&31))**2;},0);
      const pal=w===72?dragonCells.find(c=>c.cx===cx&&c.cy===cy).pal:Number(error(palettes[1])<error(palettes[0]));
      cells.push({cx,cy,pal,ix:s.map(c=>c?1+nearestIn(palettes[pal],c-1):0)});
    }
    if(cells.length>23)throw Error(`flight Shenron width ${w}: too many cells`);
    const bytes=new Uint8Array(Math.ceil(cells.length/8)*1024),base=(72-w)*256;
    for(let i=0;i<23;i++)templates[base+i*4+1]=224;
    cells.forEach((c,i)=>{
      const b=objCell(c.ix,16,0,0,16),at=(i>>3)*1024+(i&7)*64;
      bytes.set(b.subarray(0,64),at);bytes.set(b.subarray(64),at+512);
      const tile=32+(i>>3)*32+(i&7)*2;
      templates.set([128-(w>>1)+c.cx*16,c.cy*16,tile,0x21|(c.pal?10:0)],base+i*4);
      templates[base+92+c.cy]++;
    });
    templates.set(templates.subarray(base,base+128),base+128);
    for(let i=0;i<23;i++)templates[base+128+i*4+2]+=96;
    if(bytes.length===3072){bytes.set(star.subarray(0,64),2048+448);bytes.set(star.subarray(64),2560+448);}
    const name=`flight_dragon_${w}`;
    if(w!==72&&bytes.length){o.blob(name,bytes);scaleBytes+=bytes.length;}
    uploads.push({name:w===72?'vista_obj+$400':name,size:bytes.length});
  }
  o.blob('flight_dragon_oam',templates);
  o.blob('flight_sizes',Uint8Array.from(sizes));
  o.cut.raw('ending_flight_dragon_dma:');
  for(const u of uploads)o.cut.raw(`\tdl ${u.size?'ending_'+u.name:0}\n\tdb 0\n\tdw ${u.size},0`);
  o.def('ENDING_FLIGHT_DRAGON_CELLS',23);
  o.stats.flightDragon={widths:25,xdata:scaleBytes,templates:templates.length,maxUpload:3072};
  // The Balls' directions (orbitVectors of headings 8, 10, 12, 14, 0, 3, 5)
  // and their trails: (d 7 j) >> 8 for j = 1..3.
  const dirs=[8,10,12,14,0,3,5].map(h=>orbitVectors[h]);
  o.table('ending_flight_ballvec','dw',dirs.flatMap(v=>v.map(c=>c&0xffff)));
  // (the sprite's top-left: the ball minus this)
  o.table('ending_flight_trail','dw',dirs.flatMap(([dx,dy])=>[1,2,3].flatMap(j=>[((dx*j*7)>>8)+8,((dy*j*7)>>8)+8])).map(v=>v&0xffff));
  // The ring before the scatter (radius 12..28): each Ball's offset, bytes.
  const ring=[];for(let r=12;r<=28;r++)for(const [dx,dy] of dirs)ring.push(((dx*r)>>8)&255,((dy*r)>>8)&255);
  o.blob('flight_ring',Uint8Array.from(ring));
  // Night floor colours: palette p colour i at C6:483E + 30 p + 2 i (i >= 1),
  // colour 0 of every palette the base colour.
  o.stats.flight={window:best,share:best.n/total*4,runs,tilesUsed:[...used].reduce((a,b)=>a+b.toString(2).split('1').length-1,0)};
}
