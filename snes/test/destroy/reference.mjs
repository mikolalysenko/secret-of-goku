#!/usr/bin/env node
// Browser-mod reference for the destroy module's Mesen tests. Runs the
// original JavaScript destruction pipeline (engine/native-plants.js with the
// dungeon demolition planner and scenery replacements, engine/native-barriers.js
// target selection) on the WRAM of an import bundle (snes/tools/snesjs-export.mjs)
// and prints what the browser mod would change for one attack:
//   node snes/test/destroy/reference.mjs <bundleDir> '{"x":536,"y":670,"dir":3,"kind":"punch"}'
// kind: punch | beam | mega (full Super Saiyan beam). dir: 0 down 1 right 2 left 3 up.
// Optional: length, halfWidth, taper, strength, layer.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const {createNativePlants}=await import(resolve(repo,'engine/native-plants.js'));
const {createNativeLocalFlight}=await import(resolve(repo,'engine/native-local-flight.js'));
const {kiBarriers,beamTouchesBarrier,barrierHitEvent,barrierFloorEvents,floorTileEvent}=await import(resolve(repo,'engine/native-barriers.js'));
const {lockedDoorAt}=await import(resolve(repo,'engine/breakable-doors.js'));
const {shipMaps}=await import(resolve(repo,'engine/sandship-wreck.js'));

export const facing=[[0,1],[1,0],[-1,0],[0,-1]];

export function loadRom(){
  let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  if(rom.length%0x8000===512)rom=rom.slice(512);
  return rom;
}

// A minimal SnesJs-shaped object: RAM, cartridge and a CPU whose only
// instruction boundary is the native redraw queue consumer C0:C7C3.
export function fakeSnes(wram,rom){
  const cpu={r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,waiting:false,stopped:false,nmiWanted:false,abortWanted:false,irqWanted:false,i:false,cycle(){}};
  return{ram:wram,cart:{data:rom},cpu,frames:1000,ppu:{mode:1}};
}

export function createReference(wram,rom){
  const snes=fakeSnes(wram,rom),r=wram,word=a=>r[a]|r[a+1]<<8;
  const applied=[];
  const flight=createNativeLocalFlight(snes,{});
  const breakable=()=>shipMaps.includes(word(0xdc))&&r[0xcf28]>=1&&r[0xcf28]<10;
  const plants=createNativePlants(snes,{canCut:()=>true,
    sceneryReplacement:tile=>flight.breakScenery(tile),
    demolitionPlan:(tiles,attack)=>flight.dungeon.demolish(tiles,attack),
    demolishes:policy=>policy==='super-beam'||breakable()&&['beam','objects'].includes(policy),
    onCut:result=>applied.push(result)});
  // One native boundary per frame, with the redraw queue free.
  function frame(){
    snes.frames++;r[0x82]=0;r[0x2e]=0;r[0x95]=0;
    const before=applied.length;
    snes.cpu.r[1]=0;snes.cpu.br[4]=0xc7c3;snes.cpu.cyclesLeft=0;snes.cpu.cycle();
    return applied.length>before;
  }
  // One boundary; the applied row in the drain() format, or null.
  function step(i=0){
    if(!frame())return null;
    return{frame:i,redraw:[r[0x82],r[0x83]],sound:r[0x95],tiles:applied.at(-1).tiles.map(t=>({tx:t.tx,ty:t.ty,layer:t.layer,tile:t.tile,replacement:t.replacement,demolition:!!t.demolition}))};
  }
  function drain(max=200){
    const rows=[];
    for(let i=0;i<max&&(plants.pending||i<2);i++){const row=step(i);if(row)rows.push(row);}
    return rows;
  }
  function barrierTarget(attack){
    // Same selection as createNativeBarriers().hit(), without dispatching.
    const map=word(0xdc),melee=attack.kind==='punch';
    const beam={x:attack.x,y:attack.y,dx:facing[attack.dir][0],dy:facing[attack.dir][1],length:attack.length,width:attack.halfWidth,strength:attack.strength??1,melee};
    if((beam.strength??0)<.85)return null;
    const ki=kiBarriers.find(b=>b.map===map&&(!b.beamOnly||!melee)&&r[0xcf00+b.flag]<b.min&&beamTouchesBarrier(beam,b));
    if(ki)return{kind:'barrier',id:ki.id,event:ki.event,door:ki.door};
    const mod={read8:a=>r[a&0x1ffff],read16:a=>word(a&0x1ffff),snes,barriers:null};
    const width=Math.min(2048,word(0xc0)),height=Math.min(2048,word(0xc2));
    const length=Math.min(640,beam.length),pad=beam.width+8,x1=beam.x+beam.dx*length,y1=beam.y+beam.dy*length,candidates=[];
    for(let ty=Math.max(0,Math.floor((Math.min(beam.y,y1)-pad)/16));ty<Math.min(height/16,Math.ceil((Math.max(beam.y,y1)+pad)/16));ty++)
    for(let tx=Math.max(0,Math.floor((Math.min(beam.x,x1)-pad)/16));tx<Math.min(width/16,Math.ceil((Math.max(beam.x,x1)+pad)/16));tx++){
      const tile=plants.metadata(tx,ty);
      const hitTile=(tile.code&0xf0)===0xf0,source=hitTile?tile.replacement*16+(tile.code&15):floorTileEvent(mod,tile),door=lockedDoorAt(mod,source),event=hitTile?barrierHitEvent(map,source):barrierFloorEvents.get(source);
      if(!event&&!door)continue;
      if(source>=0x565&&source<=0x568&&r[0xcf42]!==3)continue;
      const candidate={kind:'tile',id:door?.id??`tile-${tile.layer}-${tx}-${ty}-${source}`,event,door:door?.id,source,rect:[tx*16,ty*16,16,16],tx,ty};
      if(beamTouchesBarrier(beam,candidate))candidates.push(candidate);
    }
    candidates.sort((a,b)=>Math.hypot(a.rect[0]-beam.x,a.rect[1]-beam.y)-Math.hypot(b.rect[0]-beam.x,b.rect[1]-beam.y));
    return candidates[0]??null;
  }
  return{snes,plants,flight,frame,step,drain,barrierTarget,applied};
}

// The browser beam's frames (mana-mod.js releaseCharge / beamProfile /
// beamGeometry): a point-blank strike from the feet at release, then one
// call per frame for ages 1..max-1 with the growing (and, at full power,
// tapering and fading) band. strength = charge / cap.
export function beamTimeline({x,y,dir,kind='mega',strength=1,id=7}){
  const mega=kind==='mega';
  const width=mega?80:5+strength*14,range=mega?640:320,max=mega?64:24,speed=mega?48:32;
  const steps=[{x,y,dir,length:28,halfWidth:9,taper:0,id:0}];
  for(let age=1;age<max;age++){
    const life=max-age;
    steps.push({x,y,dir,length:Math.min(range,(age+1)*speed),halfWidth:width*(mega?Math.min(1,(age+1)/6,life/10):1),taper:mega?44:0,id});
  }
  return steps;
}

// Run a timeline through the browser pipeline: each frame one beam() call,
// then the native redraw boundary; then drain the queue.
export function simulateTimeline(ref,steps,policy){
  const rows=[];
  steps.forEach((st,i)=>{
    const[dx,dy]=facing[st.dir];
    ref.plants.beam({x:st.x,y:st.y,dx,dy,length:st.length,halfWidth:st.halfWidth,taper:st.taper,policy});
    const row=ref.step(i);if(row)rows.push(row);
  });
  return rows.concat(ref.drain());
}

export function attackProfile(spec){
  const kind=spec.kind??'punch';
  const base=kind==='punch'?{length:28,halfWidth:9,taper:0,policy:'objects',strength:1}:
    kind==='mega'?{length:640,halfWidth:80,taper:44,policy:'super-beam',strength:1}:
    {length:320,halfWidth:19,taper:0,policy:'beam',strength:1};
  return{...base,...spec,kind};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [dir,json]=process.argv.slice(2);
  const attack=attackProfile(JSON.parse(json??'{}'));
  const wram=new Uint8Array(readFileSync(resolve(dir,'wram.bin')));
  const ref=createReference(wram,loadRom());
  const[dx,dy]=facing[attack.dir];
  const queued=ref.plants.beam({x:attack.x,y:attack.y,dx,dy,length:attack.length,halfWidth:attack.halfWidth,taper:attack.taper,policy:attack.policy,collisionLayer:attack.layer});
  const barrier=ref.barrierTarget(attack);
  const rows=ref.drain();
  console.log(JSON.stringify({map:wram[0xdc]|wram[0xdd]<<8,attack,queued:queued.length,barrier,rows},null,1));
}
