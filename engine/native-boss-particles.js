// Mantis Ant's death uses a generated OBJ picture, not a spell atlas cell.
// C2:3B98 seeds 256 particles with the ROM's quarter-sine table; C2:3B2A
// advances 8.8 positions and removes three particles per worker tick. The
// native Mantis Ant capture updates this picture once every seven frames.
// Its 32px-high quadrant is mirrored into the wide red/white dotted oval.
// Keep that raster and palette here, without altering the live arena VRAM.
export function createNativeBossParticles(rom){
 let seed=0x6d616e61;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>24;};
 const sine=n=>n>=246?256:rom[0x197de0+n];
 const particles=Array.from({length:256},()=>{
  const angle=random(),speed=(sine(256-random())*0x2c0)>>8;
  return{dx:(speed*sine(256-angle))>>8,dy:(speed*sine(angle))>>8};
 });
 const white=1+(rom[0x23aee]|rom[0x23aef]<<8),red=1+(rom[0x23ae8]|rom[0x23ae9]<<8);
 return function draw(x,y,age,put){
  const tick=Math.floor(age/7)+1;if(age<0||tick>=75)return;
  const colors=(tick>>1)&1?[white,red]:[red,white];
  for(let i=0;i<256-tick*3;i++){
   const p=particles[i],px=p.dx*tick>>8,py=p.dy*tick>>8;
   if(px>=128||py>=32)continue;
   const color=colors[i&1];
   for(const sx of[-1,1])for(const sy of[-1,1])put(x+(sx<0?-px-1:px),y+(sy<0?-py-1:py),color);
  }
 };
}
