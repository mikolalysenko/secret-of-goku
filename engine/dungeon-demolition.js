// Short debris bursts use the loaded room's own stone/timber palette.
// The actual passage is native map data, not a painted hole on the screen.
export function demolitionEffects(mod,result){
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
