// Shared native-resolution ki sprites, reused by ground, orbit and endings.
export function createKiArt(){
 const sheets=new Map();
 const deathPalette=[[3,0,3],[9,0,8],[15,1,12],[23,2,16],[30,4,19],[31,8,9],[31,10,20],[31,16,24],[31,23,28],[31,31,31],[31,12,0],[31,21,3],[31,29,8],[31,28,30],[20,4,1]];
 const ready=Promise.all([['death',3,2,'death-ball.png'],['dragon',4,2,'dragon-balls.png']].map(async([key,cols,rows,file])=>{
  const image=new Image(),url=new URL(`../assets/sprites/${file}`,import.meta.url);url.search=new URL(import.meta.url).search;image.src=url.href;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height).data,pixels=new Uint16Array(image.width*image.height);
  for(let i=0;i<pixels.length;i++)if(rgba[i*4+3]>=128)pixels[i]=1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10);
  if(key==='death'){
   const mapped=new Map();for(let i=0;i<pixels.length;i++)if(pixels[i]){
    const c=pixels[i];if(!mapped.has(c)){const v=c-1,r=v&31,g=v>>5&31,b=v>>10&31;let score=Infinity,nearest;
     for(const color of deathPalette){const d=(r-color[0])**2+(g-color[1])**2+(b-color[2])**2;if(d<score){score=d;nearest=color;}}
     mapped.set(c,1+nearest[0]+(nearest[1]<<5)+(nearest[2]<<10));
    }pixels[i]=mapped.get(c);
   }
  }
  const frames=[];
  for(let i=0;i<cols*rows;i++){
   const x0=Math.round(i%cols*image.width/cols),x1=Math.round((i%cols+1)*image.width/cols),y0=Math.round(Math.floor(i/cols)*image.height/rows),y1=Math.round((Math.floor(i/cols)+1)*image.height/rows);
   let x=x1,y=y1,right=x0,bottom=y0;
   for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(pixels[yy*image.width+xx]){x=Math.min(x,xx);right=Math.max(right,xx);y=Math.min(y,yy);bottom=Math.max(bottom,yy);}
   frames.push({x,y,w:right-x+1,h:bottom-y+1});
  }
  const cells=new Map();
  if(key==='death')for(const size of[16,24,32,48,64,80])frames.forEach((f,index)=>{
   const cell=new Uint16Array(size*size),w=Math.round(size*f.w/Math.max(f.w,f.h)),h=Math.round(size*f.h/Math.max(f.w,f.h)),left=(size-w)>>1,top=(size-h)>>1;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)cell[(top+y)*size+left+x]=pixels[(f.y+Math.floor(y*f.h/h))*image.width+f.x+Math.floor(x*f.w/w)];
   cells.set(`${index}:${size}`,cell);
  });
  sheets.set(key,{pixels,width:image.width,frames,cells});
 }));
 return{ready,draw(key,frame,x,y,size,put){
  const a=sheets.get(key);if(!a)return;frame%=a.frames.length;
  if(key==='death'){
   size=[16,24,32,48,64,80].reduce((best,n)=>Math.abs(n-size)<Math.abs(best-size)?n:best,16);
   const cell=a.cells.get(`${frame}:${size}`),left=Math.round(x)-size/2,top=Math.round(y)-size/2;
   for(let yy=0;yy<size;yy++)for(let xx=0;xx<size;xx++){const c=cell[yy*size+xx];if(c)put(left+xx,top+yy,c);}return;
  }
  const f=a.frames[frame],w=Math.round(size*f.w/Math.max(f.w,f.h)),h=Math.round(size*f.h/Math.max(f.w,f.h));
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const c=a.pixels[(f.y+Math.floor(yy*f.h/h))*a.width+f.x+Math.floor(xx*f.w/w)];if(c)put(x-w/2+xx,y-h/2+yy,c);}
 }};
}
