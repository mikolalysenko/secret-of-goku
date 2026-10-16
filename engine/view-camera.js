// The camera the background was actually drawn with. mod.status derives
// its camera from Goku's own OAM screen position, which runs one movement
// update behind (or ahead of) the BG scroll and wobbles with his walk, so
// world-anchored custom sprites drawn from it bounce against the ground.
// $A8/$AA are the tile stream's origin; BG1's fine scroll (this frame's
// register, including any native quake) supplies the low bits.
export function viewCamera(mod){
 const ppu=mod.snes.ppu,x0=mod.read16(0xa8),y0=mod.read16(0xaa);
 if(!ppu?.bgHoff)return{cameraX:mod.status.cameraX,cameraY:mod.status.cameraY};
 return{cameraX:x0+((ppu.bgHoff[0]-x0+8)&15)-8,cameraY:y0+((ppu.bgVoff[0]-y0+8)&15)-8};
}
