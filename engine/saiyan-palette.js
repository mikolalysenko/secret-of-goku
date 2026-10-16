// Shared RGB555 ramp for both Super Saiyans: ochre, amber, gold, cream.
// Hair keeps a warm outline without borrowing skin or armor highlights.
export const superSaiyanHairRGB=[[16,10,3],[25,20,7],[31,28,12],[31,30,24]];
export const superSaiyanHairColors=superSaiyanHairRGB.map(([r,g,b])=>1+r+(g<<5)+(b<<10));

export function sampleSaiyanHair(image,x,y,step=1){
 const votes=new Uint8Array(4);let count=0;
 for(const dy of[-.3,0,.3])for(const dx of[-.3,0,.3]){
  const px=Math.round(x+dx*step),py=Math.round(y+dy*step);
  if(px<0||py<0||px>=image.width||py>=image.height)continue;
  const at=(py*image.width+px)*4,[r,g,b,a]=image.data.subarray(at,at+4);
  if(a<192||r<g*.9||g<b*1.12)continue;
  let best=Infinity,index=0;
  for(let i=0;i<4;i++){
   const c=superSaiyanHairRGB[i],d=(c[0]-(r>>3))**2+(c[1]-(g>>3))**2+(c[2]-(b>>3))**2;
   if(d<best){best=d;index=i;}
  }votes[index]++;count++;
 }
 if(count<4)return 0;
 let best=0;for(let i=1;i<4;i++)if(votes[i]>votes[best])best=i;
 return superSaiyanHairColors[best];
}
