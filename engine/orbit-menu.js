// Fit the native ring and its tiny Goku preview inside the picture. This is
// a UI anchor, not an orbital camera offset: opening a menu never pans space.
export function orbitMenuView(hero){
 const x=Math.max(56,Math.min(200,Math.round(hero.x))),y=Math.max(92,Math.min(140,Math.round(hero.y)));
 return{x,y};
}
export function installOrbitMenu(snes,mod,getOrbit){
 const cpu=snes.cpu,cycle=cpu.cycle,r=snes.ram;
 const word=(at,value)=>{r[at]=value&255;r[at+1]=value>>8&255;};
 cpu.cycle=function(){
  // C0:7134 chooses the ring origin, and C0:6C6D renders it. Override
  // their screen-space origin only, never the actor's Fortress coordinates.
  if(this.cyclesLeft===0&&(this.r[1]&63)===0&&(this.br[4]===0x714a||this.br[4]===0x6c6d)&&mod.options.enabled&&mod.nativeField&&(r[0xec]&12)){
   const orbit=getOrbit();if(orbit){const view=orbitMenuView(orbit.hero);word(0x181a,view.x-8);word(0x181c,view.y-8);}
  }
  return cycle.call(this);
 };
 cpu.registerBreakpoints?.(cpu.cycle,cycle,[[0,0x714a],[0,0x6c6d]]);
 return{dispose(){cpu.cycle=cycle;}};
}
