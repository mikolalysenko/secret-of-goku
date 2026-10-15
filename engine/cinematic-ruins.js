// Map-aligned, broken roofs made only from each town's own tiles. The saved
// combat map is never touched; the montage keeps an intact and damaged copy.
const footprints={
 131:{x:96,y:64,rows:[[1,4],[0,5],[1,5]],floor:[16,176]},
 144:{x:72,y:136,rows:[[1,5],[0,6],[0,6],[1,5]],floor:[168,104]},
 115:{x:32,y:64,rows:[[1,4],[0,5],[0,5],[1,4]],floor:[176,160]},
 129:{x:112,y:128,rows:[[0,1],[0,2]],floor:[160,112]},
};
export function cinematicRuin(map,shot){
 const shape=footprints[shot.map],pixels=map.pixels.slice(),sites=[];
 if(!shape)return{pixels,sites};
 const sample=(x,y)=>map.pixels[y*map.width+x];
 shape.rows.forEach(([left,right],row)=>{
  for(let col=left;col<=right;col++){
   const x=shot.x+shape.x+col*16,y=shot.y+shape.y+row*16,seed=col*13+row*7;
   // Reveal native earth/paving beneath the roof, preserving surrounding
   // chimneys, gables and walls. No circular patch or generated noise fill.
   for(let py=0;py<16;py++)for(let px=0;px<16;px++)pixels[(y+py)*map.width+x+px]=sample(shot.x+shape.floor[0]+px,shot.y+shape.floor[1]+py);
   // Fallen shingles retain their original pixels/palette in small broken
   // pieces. They are baked into the map copy so camera pans cannot slide them.
   let random=((col+1)*73856093^(row+1)*19349663)>>>0;
   const next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return random>>>0;};
   for(let k=0,count=1+next()%3;k<count;k++){
    const ox=3+next()%9,oy=3+next()%9,sx0=4+next()%5,sy0=4+next()%5;
    for(let py=-2;py<=2;py++)for(let px=-3;px<=3;px++){
     if(Math.abs(px)+Math.abs(py)>4||(px===-3&&py>=0))continue;
     const sx=k&1?py+sx0:px+sx0,sy=k&1?px+sy0:py+sy0;
     pixels[(y+oy+py)*map.width+x+ox+px]=sample(x+sx,y+sy);
    }
   }
   if((col+row*3)%3===0)sites.push({x:x+8,y:y+12,seed});
  }
 });
 return{pixels,sites};
}
