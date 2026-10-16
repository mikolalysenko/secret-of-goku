// Short debris bursts use the loaded room's own stone/timber palette.
// The actual passage is native map data, not a painted hole on the screen.
import {createNativeCombustion} from './native-combustion.js';
const fireArt=new WeakMap();
export function drawDemolitionEffects(mod,layer){
 const rom=mod.snes.cart?.data;if(!rom)return;
 let draw=fireArt.get(rom);if(!draw){draw=createNativeCombustion(rom);fireArt.set(rom,draw);}
 const {cameraX,cameraY}=mod.status;
 for(const e of mod.effects)if(e.kind==='brazierBurst'){
  const age=e.max-e.life;
  // One Exploder animation for the whole pedestal, followed by two small
  // outward bursts. Original cells, integer positions, no tile-sized flashes.
  for(const [delay,dx,dy,turn]of[[0,0,-8,0],[8,-10,2,3],[12,10,2,1]]){
   const t=age-delay;if(t>=0&&t<42)draw('burst',Math.floor(t/6),e.x-cameraX+dx,e.y-cameraY+dy,(x,y,c)=>layer.pixel(x,y,c,true),{turn});
  }
 }
}
export function demolitionEffects(mod,result){
 const braziers=new Map(result.tiles.filter(t=>t.brazier).map(t=>[`${t.brazier.x}:${t.brazier.y}`,t.brazier]));
 for(const [key,b]of braziers){
  if(mod.effects.some(e=>e.kind==='brazierBurst'&&e.map===result.map&&e.key===key))continue;
  mod.effects.push({kind:'brazierBurst',map:result.map,key,x:b.x*16+16,y:b.y*16+24,life:54,max:54});
  mod.feedback?.pulse(8);
 }
 const tiles=result.tiles.filter(t=>t.demolition);if(!tiles.length)return;
 const light=c=>(c&31)+(c>>5&31)+(c>>10&31);
 const shades=[...new Set(mod.snes.ppu.cgram.slice(0,128))].filter(c=>{
  const r=c&31,g=c>>5&31,b=c>>10&31;
  return light(c)>18&&light(c)<75&&(Math.max(r,g,b)-Math.min(r,g,b)<=8||r>=g&&g>=b&&r-g<12&&g-b<12);
 }).sort((a,b)=>light(a)-light(b));
 const colors=[shades[Math.floor(shades.length*.2)]??0x18c6,shades[Math.floor(shades.length*.5)]??0x294a,shades[Math.floor(shades.length*.85)]??0x4631];
 // One burst per native redraw row, not six bursts per metatile. Two visual
 // layers often describe the same broken wall; deduplicate their locations.
 const cells=[...new Map(tiles.map(t=>[`${t.tx}:${t.ty}`,t])).values()];
 const room=6-mod.effects.filter(e=>e.kind==='rubble').length;
 const count=Math.min(1,room,cells.length);
 for(let i=0;i<count;i++){
  const x=cells.reduce((sum,t)=>sum+t.tx*16+8,0)/cells.length,y=cells[0].ty*16+8;
  mod.effects.push({kind:'rubble',x,y,seed:cells[0].tx+17*cells[0].ty+mod.frame,colors,life:32,max:32});
 }
 if(count){mod.feedback?.pulse(10);mod.radio?.defeatedBarrier(`dungeon-wall-${tiles[0].dungeon}`,{map:result.map,onceKey:`dungeon:${tiles[0].dungeon}`});}
}
