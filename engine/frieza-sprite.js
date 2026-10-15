// Prepare fixed native-sized cells once. Moving a tail never moves the torso
// anchor; no per-frame crop scaling or subpixel sprite placement.
const palette=[[3,2,5],[8,4,12],[13,6,18],[19,9,25],[25,14,30],[31,22,31],[31,31,31],[26,27,29],[21,22,26],[16,17,22],[12,12,17],[30,4,8],[20,2,5],[27,18,22],[7,7,11]];
export function prepareFriezaSprite(sheet){
 const nearest=new Map(),color=value=>{if(!value)return 0;if(nearest.has(value))return nearest.get(value);const raw=value-1,r=raw&31,g=raw>>5&31,b=raw>>10&31;let best=Infinity,chosen;
  for(const c of palette){const d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(d<best){best=d;chosen=1+c[0]+(c[1]<<5)+(c[2]<<10);}}nearest.set(value,chosen);return chosen;};
 const cells=sheet.frames.map((f,i)=>{
  const h=i===7?27:i===4||i===5?34:40,scale=h/f.h,w=Math.round(f.w*scale),out=new Uint16Array(48*48);
  let sum=0,count=0;for(let y=0;y<Math.floor(f.h*.23);y++)for(let x=0;x<f.w;x++)if(sheet.pixels[(f.y+y)*sheet.width+f.x+x]){sum+=x;count++;}
  const pivot=Math.round((count?sum/count:f.w/2)*scale);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const xx=24-pivot+x,yy=44-h+y;if(xx<0||xx>=48||yy<0||yy>=48)continue;out[yy*48+xx]=color(sheet.pixels[(f.y+Math.floor(y/scale))*sheet.width+f.x+Math.floor(x/scale)]);}
  return out;
 });
 return{...sheet,cells};
}
export function drawFriezaSprite(sheet,frame,x,y,put,{flip=false,tiny=false,ghost=0}={}){
 const cell=sheet?.cells?.[frame];if(!cell)return;const step=tiny?2:1,size=48/step,left=Math.round(x)-24/step,top=Math.round(y)-44/step;
 for(let py=0;py<size;py++)for(let px=0;px<size;px++){const c=cell[py*step*48+(flip?47-px*step:px*step)];if(c&&(!ghost||(px+py+ghost)%3===0))put(left+px,top+py,ghost?1+10+(7<<5)+(18<<10):c);}
}
