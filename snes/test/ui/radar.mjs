// The Dragon Radar as the browser mod draws it (engine/dragon-radar.js run
// on a stand-in emulator), for a world-flight state read from the cartridge:
//   renderRadar({rom, ram:{fa,fc,f6,fx,fy}, quest, frieza, crisis, sweepAngle,
//                blink}) -> {pixels: Map 'x,y' -> RGB555, text, target, bearing}
// sweepAngle is the cartridge's quantised sweep (0-63); the browser's frame
// is chosen so its continuous sweep lands on the same angle and its blink
// phase matches.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

export async function renderRadar({ram,quest,frieza={},crisis=false,fortressDestroyed=false,sweepAngle,blink}){
  const {createDragonRadar,radarTarget,radarBearing}=await import(pathToFileURL(resolve(repo,'engine/dragon-radar.js')).href);
  let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  if(rom.length%0x8000===512)rom=rom.slice(512);
  const mem=new Uint8Array(0x20000);
  const w16=(a,v)=>{mem[a]=v&255;mem[a+1]=v>>8&255;};
  w16(0xfa,ram.fa);w16(0xfc,ram.fc);w16(0xf6,ram.f6);w16(0x128,ram.fx);w16(0x12a,ram.fy);
  const snes={ram:mem,cart:{data:rom},ppu:{forcedBlank:false,getColor(){return 0;}}};
  const count=n=>{let c=0;for(let i=0;i<7;i++)c+=n>>i&1;return c;};
  const mod={options:{enabled:true},gokuActive:true,worldFlight:true,charging:false,frame:0,
    flight:{docking:false},radio:{status:{visible:false}},
    worldKi:{status:{shot:null,explosion:null,fortressDestroyed}},
    quest:{status:{mask:quest.held,count:count(quest.held),stolen:!!frieza.stolen,seedMask:quest.collected,wished:!!quest.wished}},
    frieza:{status:frieza,crisisActive:crisis}};
  // a browser frame whose sweep is the cartridge's angle and blink matches
  const turn=2*Math.PI/0.045,base=sweepAngle*2*Math.PI/64/0.045;
  let frame=base;
  for(let k=0;k<200;k++){const f=base+k*turn;if((f%30<22)===!!blink){frame=f;break;}}
  mod.frame=frame;
  const radar=createDragonRadar(snes,mod);
  const st=radar.status;
  const pixels=new Map();
  for(let y=8;y<56;y++)for(let x=8;x<56;x++){const c=snes.ppu.getColor(0,x,y);if(Array.isArray(c))pixels.set(`${x},${y}`,c[0]);}
  const target=radarTarget(rom,mod.quest.status,{frieza,fortressDestroyed,fortress:{x:ram.fx,y:ram.fy}});
  const bearing=target&&radarBearing({x:ram.fa&4095,y:ram.fc&4095},ram.f6,target);
  const text=target&&`RADAR ${mod.quest.status.stolen?'8TH BALL':`${mod.quest.status.count}/7`}  ${bearing.guide}\nNext: ${target.name}\n${crisis?'CORE: 5 MINUTES REMAIN':target.hint}`;
  return {pixels,text,target,bearing,visible:st.visible};
}
