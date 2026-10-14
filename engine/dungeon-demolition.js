// Short debris bursts use the loaded room's own stone/timber palette.
// The actual passage is native map data, not a painted hole on the screen.
export function demolitionEffects(mod,result){
 const tiles=result.tiles.filter(t=>t.demolition);if(!tiles.length)return;
 const light=c=>(c&31)+(c>>5&31)+(c>>10&31);
 const shades=[...new Set(mod.snes.ppu.cgram.slice(0,128))].filter(c=>{
  const r=c&31,g=c>>5&31,b=c>>10&31;
  return light(c)>18&&light(c)<75&&(Math.max(r,g,b)-Math.min(r,g,b)<=8||r>=g&&g>=b&&r-g<12&&g-b<12);
 }).sort((a,b)=>light(a)-light(b));
 const colors=[0,shades[Math.floor(shades.length*.4)]??0x294a,shades[Math.floor(shades.length*.8)]??0x4631];
 const room=18-mod.effects.filter(e=>e.kind==='rubble').length;
 const count=Math.min(6,room,tiles.length);
 for(let i=0;i<count;i++){
  const t=tiles[Math.floor(i*tiles.length/count)];
  mod.effects.push({kind:'rubble',x:t.tx*16+8,y:t.ty*16+8,seed:t.tx+17*t.ty,colors,life:36,max:36});
 }
 if(count){mod.feedback?.pulse(10);mod.radio?.defeatedBarrier(`dungeon-wall-${tiles[0].dungeon}`,{map:result.map,onceKey:`dungeon:${tiles[0].dungeon}`});}
}
