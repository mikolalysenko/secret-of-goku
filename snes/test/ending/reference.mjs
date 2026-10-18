// Reference pictures for the ending tests, composed with the browser
// engine's own formulas and assets (planet-view.js kaiPlanet, kai-planet.js
// createKaiArt, native-radio.js radioPixels), plus a tolerant comparison
// against Mesen screenshots.
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const gfx=await import(pathToFileURL(join(repo,'snes/tools/gfx.mjs')).href);
const engine=f=>import(pathToFileURL(join(repo,'engine',f)).href);

export function surfaceToRgba(surface,w=256,h=224){
  const out=new Uint8Array(w*h*4);
  for(let i=0;i<w*h;i++){const c=surface[i];if(!c){out[i*4+3]=255;continue;}const v=c-1;out[i*4]=(v&31)<<3|(v&31)>>2;out[i*4+1]=(v>>5&31)<<3|(v>>5&31)>>2;out[i*4+2]=(v>>10&31)<<3|(v>>10&31)>>2;out[i*4+3]=255;}
  return out;
}
const toSurface=(img,alpha=1)=>{const o=new Uint16Array(img.width*img.height);for(let i=0;i<o.length;i++)if(img.data[i*4+3]>=alpha)o[i]=1+(img.data[i*4]>>3)+((img.data[i*4+1]>>3)<<5)+((img.data[i*4+2]>>3)<<10);return o;};

let kaiArt=null;
async function loadKaiArt(){
  if(kaiArt)return kaiArt;
  const bg=toSurface(gfx.resize(gfx.readPng(join(repo,'assets/sprites/kai-planet.png')),256,224),0);
  for(let i=0;i<bg.length;i++)if(!bg[i])bg[i]=1;
  const sheet=gfx.readPng(join(repo,'assets/sprites/kai-npcs.png')),W=sheet.width,H=sheet.height,pix=toSurface(sheet,128);
  const frames=[];
  for(let i=0;i<16;i++){
    const x0=Math.round(i%4*W/4),x1=Math.round((i%4+1)*W/4),y0=Math.round((i>>2)*H/4)+(i>=4&&i<8?32:0),y1=Math.round(((i>>2)+1)*H/4)+(i<4?16:0);
    let x=x1,y=y1,right=x0,bottom=y0;
    for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(pix[yy*W+xx]){x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);}
    frames.push({x,y,w:right-x+1,h:bottom-y+1});
  }
  const scale=[32/Math.max(...frames.slice(0,4).map(f=>f.h)),22/Math.max(...frames.slice(4).map(f=>f.h))];
  const goku=toSurface(gfx.readPng(join(repo,'assets/sprites/goku.png'))),ssj=toSurface(gfx.readPng(join(repo,'assets/sprites/ssj.png')));
  kaiArt={bg,pix,W,frames,scale,goku:{pixels:goku,width:2016},ssj:{pixels:ssj,width:1760}};
  return kaiArt;
}

// The browser's Goku atlas (assets/sprites/goku.png: cell (column, row) at
// (32 column, 32 + 32 row)) and native effect cells (charge-orb, ...).
export async function gokuAtlas(){return (await loadKaiArt()).goku;}
let effectCells=null;
export async function nativeEffects(rom){
  if(!effectCells){const {createNativeEffects}=await engine('native-effects.js');effectCells=createNativeEffects(rom,JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8')));}
  return effectCells;
}

// planet-view kaiPlanet() for a given state.
export async function kaiReference({rom,kaiFrame=0,bubbles={x:86,y:160,frame:5,flip:false},goku='goku',gokuVisible=true,card=null}){
  const a=await loadKaiArt(),surface=new Uint16Array(256*224);
  surface.set(a.bg);
  const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(c>0&&x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
  const npc=(frame,x,y,flip=false)=>{
    const f=a.frames[frame],s=a.scale[frame<4?0:1],w=Math.round(f.w*s),h=Math.round(f.h*s);
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const c=a.pix[(f.y+Math.floor(yy*f.h/h))*a.W+f.x+Math.floor((flip?w-1-xx:xx)*f.w/w)];if(c)put(x-Math.floor(w/2)+xx,y-h+yy,c);}
  };
  const g=a[goku];
  const actors=[
    {y:139,draw:()=>npc(kaiFrame,116,139)},
    {y:bubbles.y,draw:()=>npc(bubbles.frame,bubbles.x,bubbles.y,bubbles.flip)},
    {y:162,draw:()=>{if(gokuVisible)for(let py=0;py<32;py++)for(let px=0;px<32;px++){const c=g.pixels[(32+py)*g.width+px];if(c)put(151-16+px,162-31+py,c);}}},
  ];
  actors.sort((p,q)=>p.y-q.y).forEach(x=>x.draw());
  if(card){
    const {radioPixels}=await engine('native-radio.js');
    const px=radioPixels(rom,card);
    for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=px[y*240+x];if(c)put(x+8,y+14,c);}
  }
  return surfaceToRgba(surface);
}

// shenron-ending prepare() for the vista phases (summon, dragon, wish; the
// scatter's first 30 frames are the wish at 96, dimmed): the engine's own
// tree vista, then Shenron, the cliff, the Balls, the fallout, Goku from
// behind and the sparks, with the browser's dim/brighten.
let vistaArt=null;
export async function vistaReference({rom,phase,age,eighth=false,dimmed=0}){
  if(!vistaArt){
    const {createManaTreeVista}=await engine('mana-tree-vista.js');
    const a=await loadKaiArt();
    const shenron=gfx.readPng(join(repo,'assets/sprites/shenron.png'));
    const sheet=gfx.readPng(join(repo,'assets/sprites/dragon-balls.png')),bs=toSurface(sheet,128),W=sheet.width,H=sheet.height;
    const frames=[];
    for(let i=0;i<8;i++){
      const x0=Math.round(i%4*W/4),x1=Math.round((i%4+1)*W/4),y0=Math.round(Math.floor(i/4)*H/2),y1=Math.round((Math.floor(i/4)+1)*H/2);
      let x=x1,y=y1,right=x0,bottom=y0;
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(bs[yy*W+xx]){x=Math.min(x,xx);right=Math.max(right,xx);y=Math.min(y,yy);bottom=Math.max(bottom,yy);}
      frames.push({x,y,w:right-x+1,h:bottom-y+1});
    }
    vistaArt={draw:createManaTreeVista(rom),dragon:{pixels:toSurface(shenron,1),width:shenron.width,height:shenron.height},
      balls:{pixels:bs,width:W,frames},goku:a.goku,effects:await nativeEffects(rom)};
  }
  const v=vistaArt,surface=new Uint16Array(256*224);
  const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
  const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
  const blit=(a,x,y,w,h,sx=0,sy=0,sw=a.width,sh=a.height)=>{for(let py=0;py<h;py++)for(let px=0;px<w;px++){const c=a.pixels[(sy+Math.floor(py*sh/h))*a.width+sx+Math.floor(px*sw/w)];if(c)put(x+px,y+py,c);}};
  const ball=(frame,x,y,size)=>{const f=v.balls.frames[frame%8],w=Math.round(size*f.w/Math.max(f.w,f.h)),h=Math.round(size*f.h/Math.max(f.w,f.h));
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const c=v.balls.pixels[(f.y+Math.floor(yy*f.h/h))*v.balls.width+f.x+Math.floor(xx*f.w/w)];if(c)put(x-w/2+xx,y-h/2+yy,c);}};
  const stamp=(frame,x,y)=>{const fr=v.effects['gold-spark'],cell=fr[((frame%fr.length)+fr.length)%fr.length];for(let py=0;py<16;py++)for(let px=0;px<16;px++){const c=cell[py*16+px];if(c)put(Math.round(x)+px-8,Math.round(y)+py-8,c);}};
  const mixAll=f=>{for(let i=0;i<surface.length;i++){const c=surface[i]-1;surface[i]=rgb(f(c&31),f(c>>5&31),f(c>>10&31));}};
  const rise=phase==='dragon'?Math.max(0,1-age/96):phase==='wish'?0:1,scroll=Math.round(8*(1-rise*rise));
  v.draw(put,{foreground:false,destroyed:phase!=='wish',x:30,y:44-Math.round(scroll/4)});
  if(phase==='dragon'||phase==='wish')blit(v.dragon,92,66+Math.round(160*rise*rise),72,79);
  v.draw(put,{foreground:true,x:0,y:156-scroll});
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7-Math.PI/2;ball(i,Math.round(128+Math.cos(a)*28),Math.round(184+scroll+Math.sin(a)*12),12);}
  if(eighth)ball(7,128,172+scroll,12);
  if(phase==='summon')for(let i=0;i<32;i++)put((i*61+age/12|0)%256,(i*47+age/3|0)%224,rgb(21,24,17));
  blit(v.goku,112,172+scroll,32,32,0,32+3*32,32,32);
  if(phase==='dragon'&&age<96)for(let i=0;i<4;i++)stamp((age>>2)+i,106+i*15,172+scroll-((age*3+i*29)%112));
  if(phase==='wish'&&age<72){for(let i=0;i<4;i++)stamp((age>>3)+i,114+(i&1)*24,132+(i>>1)*26);if(age<36){const a=.65*(1-age/36);mixAll(n=>Math.round(n+(31-n)*a));}}
  if(dimmed)mixAll(n=>Math.round(n*(1-dimmed)));
  if(phase==='summon'&&age<48){const a=1-age/48;mixAll(n=>Math.round(n*(1-a)));}
  return surfaceToRgba(surface);
}

// The wish flight as shenron-ending prepare() draws the scatter from 30:
// createWishFlight (the world texture, stars, Shenron, the Balls, sparks)
// with its flash, dimmed from black until 60.
let flightArt=null;
export async function flightReference({rom,age}){
  if(!flightArt){
    const {createWishFlight}=await engine('wish-flight.js');
    const shenron=gfx.readPng(join(repo,'assets/sprites/shenron.png'));
    const sheet=gfx.readPng(join(repo,'assets/sprites/dragon-balls.png')),bs=toSurface(sheet,128),W=sheet.width,H=sheet.height;
    const frames=[];
    for(let i=0;i<8;i++){
      const x0=Math.round(i%4*W/4),x1=Math.round((i%4+1)*W/4),y0=Math.round(Math.floor(i/4)*H/2),y1=Math.round((Math.floor(i/4)+1)*H/2);
      let x=x1,y=y1,right=x0,bottom=y0;
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(bs[yy*W+xx]){x=Math.min(x,xx);right=Math.max(right,xx);y=Math.min(y,yy);bottom=Math.max(bottom,yy);}
      frames.push({x,y,w:right-x+1,h:bottom-y+1});
    }
    const state={surface:null};
    const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<224)state.surface[y*256+x]=c;};
    const blit=(a,x,y,w,h,sx=0,sy=0,sw=a.width,sh=a.height)=>{for(let py=0;py<h;py++)for(let px=0;px<w;px++){const c=a.pixels[(sy+Math.floor(py*sh/h))*a.width+sx+Math.floor(px*sw/w)];if(c)put(x+px,y+py,c);}};
    const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
    const mod={spriteLayer:{effects:await nativeEffects(rom)},kiArt:{draw(key,frame,x,y,size,put){const f=frames[frame%8],w=Math.round(size*f.w/Math.max(f.w,f.h)),h=Math.round(size*f.h/Math.max(f.w,f.h));for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const c=bs[(f.y+Math.floor(yy*f.h/h))*W+f.x+Math.floor(xx*f.w/w)];if(c)put(x-w/2+xx,y-h/2+yy,c);}}}};
    flightArt={state,rgb,draw:createWishFlight({cart:{data:rom},ppu:{}},mod,{put,rgb,blit}),dragon:{pixels:toSurface(shenron,1),width:shenron.width,height:shenron.height}};
  }
  const f=flightArt,surface=new Uint16Array(256*224);f.state.surface=surface;
  const light=f.draw(age,f.dragon);
  const mixAll=g=>{for(let i=0;i<surface.length;i++){const c=surface[i]-1;surface[i]=f.rgb(g(c&31),g(c>>5&31),g(c>>10&31));}};
  if(light)mixAll(n=>Math.round(n+(31-n)*light));
  if(age<60){const a=(60-age)/30;mixAll(n=>Math.round(n*(1-a)));}
  return surfaceToRgba(surface);
}

// Fraction of pixels whose channels all differ by at most `tol` (8-bit),
// within the optional rectangle {x0,y0,x1,y1}.
export function compare(pngPath,ref,{tol=24,rect=null}={}){
  const img=gfx.readPng(pngPath);
  if(img.width!==256||img.height!==224)throw Error(`unexpected screenshot size ${img.width}x${img.height}`);
  const r=rect??{x0:0,y0:0,x1:256,y1:224};let same=0,total=0;
  for(let y=r.y0;y<r.y1;y++)for(let x=r.x0;x<r.x1;x++){
    const i=(y*256+x)*4;total++;
    if(Math.abs(img.data[i]-ref[i])<=tol&&Math.abs(img.data[i+1]-ref[i+1])<=tol&&Math.abs(img.data[i+2]-ref[i+2])<=tol)same++;
  }
  return same/total;
}
export function writeRef(path,rgba){return gfx.writePng({width:256,height:224,data:rgba});}

// planet-view.js itself (doomed globe, explosion, escape, fatal), driven
// through its getColor hook with stand-ins for the mod and PPU: the picture
// the browser composes, without the BG3 dialogue.
let planetView=null;
export async function planetReference({rom,phase,age,night=true,ssj=false,fatal=false}){
  if(!planetView){
    const {createPlanetView}=await engine('planet-view.js');
    const {createNativeEffects}=await engine('native-effects.js');
    const a=await loadKaiArt();
    const ppu={getColor:()=>[0,5,0]},state={outcome:'bad',phase:'doomed',age:0};
    const mod={options:{enabled:true},gokuActive:true,frame:0,frieza:{crisisActive:true,permanent:false},
      ending:{defeated:false,nativeDeath:false,get planetScene(){return state;}},
      read8:()=>0,read16:()=>0,nativeField:true,
      spriteLayer:{effects:createNativeEffects(rom,JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8'))),atlas:{goku:a.goku,ssj:a.ssj}}};
    const view=createPlanetView({ppu,cart:{data:rom},ram:new Uint8Array(0x20000)},mod);view.load(rom);
    planetView={ppu,state,mod};
  }
  const {ppu,state,mod}=planetView;
  for(const k of Object.keys(state))delete state[k];
  Object.assign(state,{outcome:'bad',phase,age},fatal?{fatal:true}:{});
  mod.frieza.crisisActive=night;mod.frieza.permanent=ssj;mod.ending.defeated=fatal;mod.frame++;
  const out=new Uint8Array(256*224*4);
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){const c=ppu.getColor(0,x,y)[0],i=(y*256+x)*4;out[i]=(c&31)<<3|(c&31)>>2;out[i+1]=(c>>5&31)<<3|(c>>5&31)>>2;out[i+2]=(c>>10&31)<<3|(c>>10&31)>>2;out[i+3]=255;}
  return out;
}
// planet-view.js itself with a shot (world-ki.js cutaway): the Fortress
// cutaway's whole picture at age, for the given target and crisis.
let cutView=null;
export async function cutawayReference({rom,age,target={x:2432,y:3024},night=false}){
  if(!cutView){
    const {createPlanetView}=await engine('planet-view.js');
    const {createNativeEffects}=await engine('native-effects.js');
    const a=await loadKaiArt();
    const ppu={getColor:()=>[0,5,0]},shot={age:0,max:186,target,mega:true};
    const mod={options:{enabled:true},gokuActive:true,frame:0,frieza:{crisisActive:false,permanent:false},
      worldKi:{get cinematic(){return shot;}},ending:null,
      read8:()=>0,read16:()=>0,nativeField:true,
      spriteLayer:{effects:createNativeEffects(rom,JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8'))),atlas:{goku:a.goku,ssj:a.ssj}}};
    const view=createPlanetView({ppu,cart:{data:rom},ram:new Uint8Array(0x20000)},mod);view.load(rom);
    cutView={ppu,shot,mod};
  }
  const {ppu,shot,mod}=cutView;
  Object.assign(shot,{age,target});mod.frieza.crisisActive=night;mod.frame++;
  const out=new Uint8Array(256*224*4);
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){const c=ppu.getColor(0,x,y)[0],i=(y*256+x)*4;out[i]=(c&31)<<3|(c&31)>>2;out[i+1]=(c>>5&31)<<3|(c>>5&31)>>2;out[i+2]=(c>>10&31)<<3|(c>>10&31)>>2;out[i+3]=255;}
  return out;
}

// Best match among the browser ages a-spread..a+spread around the still's
// recorded age: {score, age, ref}.
export async function bestPlanetMatch(pngPath,opts,age,{tol=24,rect=null,spread=1}={}){
  let best={score:-1,age};
  for(let a=Math.max(0,age-spread);a<=age+spread;a++){
    const ref=await planetReference({...opts,age:a}),score=compare(pngPath,ref,{tol,rect});
    if(score>best.score)best={score,age:a,ref};
  }
  return best;
}
