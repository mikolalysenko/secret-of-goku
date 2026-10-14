import {radioPixels} from './native-radio.js';

// Native-sized picture surface, before the PPU's brightness and color math.
// Dialogue remains the cartridge's own BG3 window and event interpreter.
export function createShenronEnding(snes,mod){
 const p=snes.ppu,previous=p.getColor,surface=new Uint16Array(256*224);
 let state=null,prepared=-1,dragon=null,endCard=null;
 const image=new Image(),url=new URL('../assets/sprites/shenron.png',import.meta.url);url.search=new URL(import.meta.url).search;image.src=url.href;
 const ready=image.decode().then(()=>{
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height).data,pixels=new Uint16Array(image.width*image.height);
  for(let i=0;i<pixels.length;i++)if(rgba[i*4+3])pixels[i]=1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10);
  dragon={pixels,width:image.width,height:image.height};
 });
 const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
 const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
 function blit(a,x,y,w,h,sourceX=0,sourceY=0,sw=a.width,sh=a.height){
  for(let py=0;py<h;py++)for(let px=0;px<w;px++){
   const c=a.pixels[(sourceY+Math.floor(py*sh/h))*a.width+sourceX+Math.floor(px*sw/w)];if(c)put(x+px,y+py,c);
  }
 }
 function prepare(){
  prepared=mod.frame;surface.fill(0);if(!state)return;
  const village=state.phase==='village'||state.phase==='complete',age=state.age;
  const goku=mod.spriteLayer.atlas[mod.frieza?.permanent?'ssj':'goku'];
  if(village){
   // Randi is the original native boy actor again; Goku stands beside him.
   const x=mod.readSigned16(0xe020),y=mod.readSigned16(0xe022);
   if(goku)blit(goku,x+10,y-31,32,32,0,32,32,32);
   if(state.phase==='complete'){
    endCard??=radioPixels(snes.cart.data,'       SECRET OF GOKU\n          THE END\nOriginal game by SQUARE');
    for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=endCard[y*240+x];if(c)put(x+8,y+8,c);}
   }
   return;
  }
  // Dithered night sky and a dark green horizon, using 5-bit SNES colors.
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){
   const band=Math.floor(y/32),dither=(x+y)&1;
   put(x,y,y<184?rgb(0,2+band+dither,5+band):rgb(2,7+dither,4));
  }
  for(let i=0;i<42;i++)put((i*73+19)%256,(i*41+13)%180,rgb(13,20,18));
  if(['dragon','wish'].includes(state.phase)&&dragon){
   const rise=Math.max(0,1-age/72),y=66+Math.round(142*rise*rise),bob=Math.floor(age/24)%3===1?-1:0;
   blit(dragon,64,y+bob,128,140);
  }
  const scattered=state.phase==='wish',travel=Math.min(1,age/90);
  for(let i=0;i<7;i++){
   const angle=i*Math.PI*2/7-Math.PI/2;
   const x=128+Math.cos(angle)*(scattered?28+travel*180:28),y=196+Math.sin(angle)*(scattered?12+travel*150:12);
   for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)if(dx*dx+dy*dy<20)put(x+dx,y+dy,Math.abs(dx)+Math.abs(dy)>5?rgb(17,7,0):rgb(31,20,2));
   if(!scattered){put(x-1,y-2,rgb(31,30,16));for(let star=0;star<=i;star++)put(x-2+star%3*2,y-1+Math.floor(star/3)*2,rgb(24,2,1));}
  }
  // The final falling flakes are explicitly called fallout in the dialogue.
  if(state.phase==='summon')for(let i=0;i<32;i++)put((i*61+age/12|0)%256,(i*47+age/3|0)%224,rgb(21,24,17));
  if(goku)blit(goku,112,177,32,32,0,32+3*32,32,32);
  if(state.phase==='dragon'&&age<72){
   const height=Math.min(164,age*3);
   for(let yy=0;yy<height;yy++)for(let xx=-2;xx<=2;xx++)put(128+xx+((yy>>3)&1),197-yy,rgb(26,31,12));
  }
 }
 p.getColor=function(sub,x,y){
  const c=previous.call(this,sub,x,y);
  if(!state||!mod.options.enabled||sub||y>=224)return c;
  if(prepared!==mod.frame)prepare();
  if(c[1]===2&&y<170)return c; // dialogue stays; omit the combat HUD during the wish
  const pixel=surface[y*256+x];return pixel?[pixel-1,4,0x86]:c;
 };
 return{
  ready,
  begin(){if(state)return;mod.cancelCombat();mod.localFlight=false;mod.localLift=0;state={phase:'summon',age:0,party:Number(!!(snes.ram[0xe200]&1))|Number(!!(snes.ram[0xe400]&1))<<1};},
  cue(phase){
   if(!state)return;state.phase=phase;state.age=0;prepared=-1;
   if(phase==='dragon'){mod.playSound?.('powerBurst');}
   if(phase==='wish'){mod.quest?.wish();mod.playSound?.('charged');}
   if(phase==='village'){
    // End with a living Randi, never a ghost left by the battle state.
    snes.ram[0xe190]=snes.ram[0xe191]=0;mod.write16(0xe182,mod.read16(0xe184));
   }
  },
  tick(){if(state)state.age++;},
  get active(){return !!state;},get complete(){return state?.phase==='complete';},
  get nativeBoy(){return state?.phase==='village'||state?.phase==='complete';},
  get status(){return state?{...state}:null;},
  snapshot(){return state?{...state}:null;},restore(saved){state=saved?{...saved}:null;prepared=-1;},
  dispose(){p.getColor=previous;},
 };
}
