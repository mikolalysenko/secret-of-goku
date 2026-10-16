import {superSaiyanHairRGB,superSaiyanHairColors,sampleSaiyanHair} from './saiyan-palette.js';
// One authored body sheet with a separate generated Super Saiyan hair layer.
// The shared hair ramp matches Goku; faces, poses and foot anchors stay fixed.
// Goku's face spans roughly eight native pixels. Sample Vegeta at the same
// facial scale instead of squeezing his taller hair/armor into a 32px box.
export const vegetaCell={width:56,height:40,x:28,y:39};
const palette=[
 [1,1,1],[3,1,2],[10,6,7], // contour and warm black hair
 [3,4,10],[5,7,17],[9,11,22], // indigo suit
 [12,12,12],[21,22,20],superSaiyanHairRGB[3], // ivory armor and gloves
 superSaiyanHairRGB[0],[23,14,6],[30,23,13], // Goku's warm skin ramp
 [11,7,2],superSaiyanHairRGB[1],superSaiyanHairRGB[2], // ochre armor and boot tips
];
const rgb=p=>1+p[0]+(p[1]<<5)+(p[2]<<10);
// Anchors in the 1254px source, relative to each evenly spaced atlas cell.
// Do not recenter on the hair or stretch each pose to its alpha bounds:
// leaning, crouching and kicking must move within one stable body scale.
const anchors=[
 [151,288],[150,288],[148,288],[145,288],
 [124,282],[147,282],[147,282],[152,282],
 [155,278],[155,278],[155,278],[155,278],
 [155,258],[155,258],[148,258],[152,258],
];
// Hairline masks at native resolution. They exclude the eyes, face outline
// and raised gloves that share the source sheet's dark contour color.
const hairlines=[
 [12,23,15,30],[12,23,14,30],[16,30,17,36],[12,25,14,31],
 [11,23,13,29],[13,24,14,30],[13,25,15,31],[12,0,0,31],
 [12,0,0,31],[12,0,0,31],[12,0,0,31],[14,26,15,31],
 [14,26,15,31],[14,26,15,31],[13,28,14,34],[13,28,14,34],
];

// Pure decoder also used by the asset regression tests. Nine coverage
// samples choose an existing palette index, never a filtered edge color.
export function decodeVegetaSheet(data,width,height,hairArt=null){
 const {width:w,height:h,x:ox,y:oy}=vegetaCell,base=[],gold=[];
 const sample=width/1254,pixel=6.5*sample,colors=palette.map(rgb);
 for(let i=0;i<16;i++){
  const x0=Math.round(i%4*width/4),y0=Math.round((i>>2)*height/4),[ax,ay]=anchors[i];
  const pixels=new Uint16Array(w*h),superPixels=new Uint16Array(w*h),hair=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const sx=x0+ax*sample+(x-ox)*pixel,sy=y0+ay*sample+(y-oy)*pixel,votes=new Uint8Array(palette.length);let coverage=0;
   for(const dy of[-.3,0,.3])for(const dx of[-.3,0,.3]){
    const px=Math.round(sx+dx*pixel),py=Math.round(sy+dy*pixel);
    if(px<x0||px>=x0+width/4||py<y0||py>=y0+height/4)continue;
    const at=(py*width+px)*4;if(data[at+3]<192)continue;
    let best=Infinity,index=0;
    for(let n=0;n<palette.length;n++){
     const p=palette[n],d=(p[0]-(data[at]>>3))**2+(p[1]-(data[at+1]>>3))**2+(p[2]-(data[at+2]>>3))**2;
     if(d<best){best=d;index=n;}
    }votes[index]++;coverage++;
   }
   if(coverage<5)continue;
   let index=0;for(let n=1;n<votes.length;n++)if(votes[n]>votes[index])index=n;
   const at=y*w+x;pixels[at]=colors[index];
   const [bottom,backX,backY,right]=hairlines[i];
   const hx=24+(x-ox)*6.5/7.75,hy=31+(y-oy)*6.5/7.75;
   if(index<=2&&hx<=right+.4&&(hy<=bottom+.4||hx<=backX+.4&&hy<=backY+.4))hair[at]=index+1;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const at=y*w+x,c=pixels[at];superPixels[at]=c;
   if(hair[at]){
    const edge=!hair[at-1]||!hair[at+1]||!hair[at-w]||!hair[at+w];
    const scale=(hairArt?.width??width)/1254;
    const sx=(i%4*1254/4+anchors[i][0]+(x-ox)*6.5)*scale,sy=((i>>2)*1254/4+anchors[i][1]+(y-oy)*6.5)*scale;
    superPixels[at]=edge?superSaiyanHairColors[0]:hairArt?sampleSaiyanHair(hairArt,sx,sy,6.5*scale)||superSaiyanHairColors[1]:superSaiyanHairColors[2];
   }
  }base.push(pixels);gold.push(superPixels);
 }
 return [...base.slice(0,8),...gold.slice(0,8),...base.slice(8),...gold.slice(8)];
}

export async function loadVegetaSprite(){
 const read=async file=>{
  const img=new Image(),url=new URL(`../assets/sprites/${file}`,import.meta.url);
  url.search=new URL(import.meta.url).search;img.src=url.href;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  return{data:ctx.getImageData(0,0,img.width,img.height).data,width:img.width,height:img.height};
 };
 const [body,hair]=await Promise.all([read('vegeta.png'),read('vegeta-ssj-hair.png')]);
 return decodeVegetaSheet(body.data,body.width,body.height,hair);
}

export function drawVegetaSprite(cells,frame,x,y,put,{flip=false,flash=false,ghost=false}={}){
 const pixels=cells?.[frame];if(!pixels)return;
 const {width:w,height:h,x:ox,y:oy}=vegetaCell;x=Math.round(x);y=Math.round(y);
 for(let py=0;py<h;py++)for(let px=0;px<w;px++){
  const c=pixels[py*w+px];if(c&&(!ghost||(px+py)%3===0))put(x+(flip?ox-px:px-ox),y+py-oy,flash?0x8000:c);
 }
}
