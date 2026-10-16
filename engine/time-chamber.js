import {decodeMetatiles} from '../tools/rom/map-codec.mjs';

export const chamber={map:72,width:64,height:64,pavilion:{x:432,y:240,width:160,height:112}};
// Follow the dome and hourglasses rather than blocking the transparent
// corners of the artwork. The front steps remain usable training floor.
const pavilionRows=['....##....','.#.####.#.','##########','##########','##########','.########.'];
// Both native planes must cover the entire expanded room. A 1x1 blank BG2
// left the preceding map's tiles in WRAM, including foreground/collision.
// Recoloring that stale background hid its art but still masked the actors.
export function chamberLayout(){
 const {width:w,height:h}=chamber,tiles=new Uint8Array(w*h).fill(70);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)
  if(x<2||y<2||x>=w-2||y>=h-2||pavilionRows[y-15]?.[x-27]==='#')tiles[y*w+x]=11;
 return tiles;
}
export const chamberForeground=()=>new Uint8Array(chamber.width*chamber.height);
// Vanilla map compression: literals, previous-pixel runs, previous-row runs.
// The expanded room still fits in the trial's own original map-piece slot.
export function encodeChamberPiece(tiles,width=chamber.width,height=chamber.height){
 const out=[(width-1)*2,(height-1)*2];
 for(let i=0;i<tiles.length;){
  let row=0,run=0;
  if(i>=width)while(row<128&&i+row<tiles.length&&tiles[i+row]===tiles[i+row-width])row++;
  if(i)while(run<8&&i+run<tiles.length&&tiles[i+run]===tiles[i-1])run++;
  if(row>=3&&row>=run){out.push(0xe0,row-1);i+=row;}
  else if(run>=2){out.push(0xc0+run-1);i+=run;}
  else out.push(tiles[i++]);
 }return Uint8Array.from(out);
}

// Reuse the palace's original 8px stonework for the pale training floor.
// All sampling, palette conversion and placement happen before PPU fades,
// brightness, OBJ priority and native dialogue/rings, never over the canvas.
function palaceFloor(rom){
 const word=a=>rom[a]|rom[a+1]<<8,long=a=>word(a)|rom[a+2]<<16;
 const words=decodeMetatiles(rom.subarray(long(0xb4000+23*3),long(0xb4003+23*3))).metatiles[277],gfx=[];
 for(let a=0xc0000+word(0xce27e+23*2),end=0xc0000+word(0xce280+23*2);a<end;a+=3){
  const n=word(a),mode=n>>>13,bpp=mode===6?4:mode>=4?3:2,fill=bpp===2?((mode&2)?4:0)|((mode&1)?8:0):bpp===3&&(mode&1)?8:0;
  for(let i=0;i<=rom[a+2];i++){
   const at=long(0xce270+(bpp-2)*3)+((n&8191)+i)*bpp*8,tile=new Uint8Array(64);
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){let c=fill;for(let p=0;p<bpp;p++)c|=(rom[at+(bpp===3&&p===2?16+y:(p>>1)*16+y*2+(p&1))]>>(7-x)&1)<<p;tile[y*8+x]=c;}gfx.push(tile);
  }
 }
 const pixels=new Uint16Array(256),palette=0xc8000+93*210;
 for(let q=0;q<4;q++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const n=words[q],c=gfx[n&1023][(n&32768?7-y:y)*8+(n&16384?7-x:x)],rgb=word(palette+((n>>10&7)-1)*30+(c-1)*2),light=Math.round(((rgb&31)+(rgb>>5&31)+(rgb>>10&31))/3);
  const white=29+Math.round(light/16);pixels[((q>>1)*8+y)*16+(q&1)*8+x]=1+white+(white<<5)+(Math.min(31,white+1)<<10);
 }return pixels;
}

export function createTimeChamber(snes,mod,{loadArt=true}={}){
 let floor=null,pavilion=null,loaded=null;
 const r=snes.ram,p=snes.ppu,previous=p.getColor;
 const ready=loadArt?(async()=>{
  const img=new Image(),url=new URL('../assets/sprites/time-chamber.png',import.meta.url);url.search=new URL(import.meta.url).search;img.src=url.href;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  const data=ctx.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]>=192){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const {width,height}=chamber.pavilion;pavilion=new Uint16Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const at=(Math.round(y0+y*(y1-y0)/(height-1))*c.width+Math.round(x0+x*(x1-x0)/(width-1)))*4;if(data[at+3]<192)continue;
   // Quantized RGB555, nearest neighbour at the game's actual pixel scale.
   pavilion[y*width+x]=1+(data[at]>>3)+((data[at+1]>>3)<<5)+((data[at+2]>>3)<<10);
  }
 })():Promise.resolve();
 // DC changes as soon as a door is selected, well before the outgoing map
 // fades. Wait for the new room's actors, otherwise the old cave flashes white.
 const active=()=>mod.options.enabled&&mod.gokuActive&&mod.trial?.roomLoaded&&(r[0xdc]|r[0xdd]<<8)===72&&mod.nativeField&&p.mode===1;
 // The whole effect on the inner [color, layer, pixel] (result or a new array).
 // No CPU runs while a scanline renders, so the room state and scroll are
 // fixed per (frame, line); cache them instead of re-reading every pixel.
 let lineFrame=-1,lineY=-1,lineActive=false,scrollX=0,scrollY=0;
 const scroll=a=>(r[a]|r[a+1]<<8)<<16>>16;
 function shade(sub,x,y,result){
  if(lineFrame!==mod.frame||lineY!==y){lineFrame=mod.frame;lineY=y;lineActive=active();scrollX=scroll(0xa8);scrollY=scroll(0xaa);}
  const l=result[1];
  if(!lineActive||!floor||y>224||!(l===0||l===1||l===5))return result;
  // Actual native scroll registers remain authoritative even when the ring
  // moves its character portrait, or the camera pauses for a conversation.
  const wx=x+scrollX,wy=y+scrollY,v=chamber.pavilion;
  let color=floor[(wy&15)*16+(wx&15)];
  // Repeated wide tile seams make speed readable in the white expanse.
  if((wx&63)===0||(wy&63)===0)color=1+28+(29<<5)+(30<<10);
  if(wx<32||wy<32||wx>=992||wy>=992)color=1+23+(25<<5)+(28<<10);
  const px=wx-v.x,py=wy-v.y;if(px>=0&&py>=0&&px<v.width&&py<v.height&&pavilion?.[py*v.width+px])color=pavilion[py*v.width+px];
  result[0]=color-1;result[1]=0;result[2]=1;return result;
 }
 if(previous)p.getColor=function(sub,x,y){return shade(sub,x,y,previous.call(this,sub,x,y));};
 if(previous)p.registerLineHook?.('getColor',p.getColor,previous,(ppu,line)=>!active()||!floor||line>224,{name:'time-chamber',
  post:(ppu,sub,x,y,r)=>{const t=shade(sub,x,y,r);if(t!==r){r[0]=t[0];r[1]=t[1];r[2]=t[2];}}});
 return{ready,load(){
  const rom=snes.cart.data;if(loaded===rom)return;loaded=rom;
  const bytes=encodeChamberPiece(chamberLayout()),blank=encodeChamberPiece(chamberForeground()),start=0xfe243,foreground=start+bytes.length;
  // Pack the two pieces together in their existing combined 388-byte slot.
  // Keep the next piece (714) intact; no shared cave art is modified.
  if(bytes.length+blank.length>388)throw new Error('Time Chamber exceeds native trial map slots');
  rom.set(bytes,start);rom.set(blank,foreground);
  const pointer=0xd0004+713*2;rom[pointer]=foreground&255;rom[pointer+1]=(foreground>>8)&255;
  // Enter below the central doorway; the native door retains its walk-in.
  rom[0x83000+0x304*4+1]=64;
  floor=palaceFloor(rom);
 },get active(){return active();},dispose(){if(previous)p.getColor=previous;}};
}
