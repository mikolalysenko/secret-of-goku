import {newFriezaArena,fractureFortress,tickFriezaArena,ruinMask,drawFriezaDebris} from './frieza-arena.js';

const initial=()=>({age:0,arena:newFriezaArena(),spots:[],camera:null,music:null,pendingMusic:null});
// A visual aftermath on the actual Fortress deck. Do not rewrite the map,
// collision, palette RAM, Mode 7 matrices, or the native landing choreography.
export function createFortressCollapse(snes,mod,destroyed){
  const r=snes.ram,c=snes.cpu,p=snes.ppu,w=a=>r[a]|r[a+1]<<8,cycle=c.cycle,color=p?.getColor;
  let state=initial(),mask=null,maskKey='',renderFrame=-1,renderActive=false;
  const camera={cameraX:0,cameraY:0};
  const damaged=()=>mod.options.enabled&&mod.gokuActive&&destroyed()&&w(0xdc)===255;
  const active=()=>damaged()&&!mod.worldFlight&&!mod.nativeFlight&&!mod.ending?.active&&p?.mode===1;
  c.cycle=function(){
    if(this.cyclesLeft===0&&(this.r[1]&63)===3&&this.br[4]===4&&r[0x1e00]===1&&r[0x1e01]===0x26&&damaged()){
      // The map loader already made its normal JSL to the sound dispatcher.
      // Substitute the cartridge's crisis cue before its SPC transfer, so it
      // starts during the landing fade rather than after Goku can move.
      r.set([1,0x1b,0x13,0x8f],0x1e00);state.music=0x1b;
    }
    return cycle.call(this);
  };
  c.registerBreakpoints?.(c.cycle,cycle,[[3,0x0004]]);
  // Scars are deck decoration: place them from the tile stream's origin
  // and each scanline's actual BG1 scroll (including quake), never from the
  // actor camera, which trails the background while scrolling and is offset
  // in flight. Their texture is in world coordinates for the same reason.
  let cameraLine=-1;
  const sceneCamera=y=>{
    if(cameraLine!==y){
      cameraLine=y;const x0=w(0xa8),y0=w(0xaa);
      camera.cameraX=x0+((p.bgHoff[0]-x0+8)&15)-8;camera.cameraY=y0+((p.bgVoff[0]-y0+8)&15)-8;
      const key=`${state.arena.revision}:${camera.cameraX}:${camera.cameraY}`;
      if(key!==maskKey){maskKey=key;mask=ruinMask(state.arena,camera.cameraX,camera.cameraY);}
    }
    return camera;
  };
  const scarColor=(scar,x,y)=>scar===1?0x0425:scar===2?0x0849:((x+camera.cameraX+y+camera.cameraY)%9===0?0x2674:0x14cd);
  const refresh=()=>{if(renderFrame!==mod.frame){renderFrame=mod.frame;renderActive=active();cameraLine=-1;}};
  if(color)p.getColor=function(sub,x,y){
    const result=color.call(this,sub,x,y);
    refresh();
    if(!renderActive||sub||this.mode!==1||y>=224||result[1]>1)return result;
    if(result[1]===0){
      sceneCamera(y);
      const scar=mask?.[y*256+x];
      if(scar)result[0]=scarColor(scar,x,y);
    }
    // A warm scorched deck with a short red alarm pulse. Keep the native
    // fade/color math and leave dialogue, HUD and sprites readable.
    const phase=state.age%84,alarm=phase<16?Math.round(Math.sin(phase*Math.PI/16)*9):0,v=result[0];
    result[0]=Math.min(31,(v&31)+2+alarm)|(Math.max(0,((v>>5)&31)-2-(alarm>>1))<<5)|(Math.max(0,((v>>10)&31)-3-(alarm>>1))<<10);
    return result;
  };
  // The wrapper's effect on a whole scanline as compositor ops (see
  // Ppu.registerLineHook): scars paint BG1, then BG1/BG2 take the tint.
  const scarLine=new Uint16Array(256),scarPaint={type:'paint',layers:1,colors:scarLine,skipZero:true,layer:-1,pixel:0,mainOnly:true};
  const tint={type:'channels',layers:3,r:new Int32Array(32),g:new Int32Array(32),b:new Int32Array(32),layer:-1,pixel:0,mainOnly:true};
  if(color)p.registerLineHook?.('getColor',p.getColor,color,(ppu,line)=>{
    refresh();
    return !renderActive||ppu.mode!==1||line>=224;
  },{name:'fortress-collapse',plan:(ppu,y,plan)=>{
    sceneCamera(y);
    let any=false;
    for(let x=0;x<256;x++){const scar=mask?.[y*256+x];scarLine[x]=scar?scarColor(scar,x,y)+1:0;any||=!!scar;}
    if(any)plan.extra.push(scarPaint);
    const phase=state.age%84,alarm=phase<16?Math.round(Math.sin(phase*Math.PI/16)*9):0;
    for(let c=0;c<32;c++){tint.r[c]=Math.min(31,c+2+alarm);tint.g[c]=Math.max(0,c-2-(alarm>>1));tint.b[c]=Math.max(0,c-3-(alarm>>1));}
    plan.extra.push(tint);plan.skipPost=true;return true;
  }});
  function fracture(spot,radius){
    const terrain=r[0xe00b];
    fractureFortress(state.arena,spot.x,spot.y,radius,(x,y)=>mod.localFlightHook.canLand(x,y,terrain&128?1:0,terrain&3));
  }
  return{
    get active(){return active();},
    get status(){return{active:active(),age:state.age,music:state.music,scars:state.arena.scars.length,bursts:state.arena.bursts.length};},
    startLandingMusic(cpu){
      // Use the native JSL/RTL sound ABI at the world-loop landing boundary.
      // Returning here restores the flags changed by the dispatcher's PLB /
      // PLD, then the existing landing transfer proceeds exactly once.
      if(state.pendingMusic){
        if(cpu.br[3]===state.pendingMusic.sp)cpu.setP(state.pendingMusic.p);
        state.pendingMusic=null;return false;
      }
      if(state.music===0x1b)return false;
      state.pendingMusic={p:cpu.getP(),sp:cpu.br[3]};state.music=0x1b;
      r.set([1,0x1b,0x13,0x8f],0x1e00);
      cpu.pushByte(cpu.r[1]);cpu.pushWord((cpu.br[4]-1)&65535);
      cpu.r[1]=0xc3;cpu.br[4]=4;cpu.cyclesLeft=7;return true;
    },
    tick(){
      if(!active()||!mod.nativeField||!(r[0xe000]&1)||(r[0xec]&0xfe))return;
      tickFriezaArena(state.arena);
      const h=mod.status;
      if(!state.spots.length||!state.camera||Math.abs(h.cameraX-state.camera.x)>128||Math.abs(h.cameraY-state.camera.y)>128){
        state.spots=[];state.camera={x:h.cameraX,y:h.cameraY};const terrain=r[0xe00b];
        for(let y=32;y<208;y+=32)for(let x=16;x<256;x+=32){
          const wx=x+h.cameraX,wy=y+h.cameraY;
          if(Math.hypot(wx-h.x,wy-h.y)<26)continue;
          if(mod.localFlightHook?.canLand(wx,wy,terrain&128?1:0,terrain&3))state.spots.push({x:wx,y:wy});
        }
        if(!state.spots.length)return;
        for(let i=0;i<3;i++)fracture(state.spots[Math.floor(i*state.spots.length/3)],14+i*3);
      }
      if(++state.age%32===1){
        const spot=state.spots[(Math.floor(state.age/32)*7+3)%state.spots.length];
        fracture(spot,12+(Math.floor(state.age/32)%3)*5);
        mod.playSound?.('fortressBreak');mod.feedback?.pulse(5);
      }
    },
    draw(layer){
      if(!active())return;
      const h=mod.status;
      drawFriezaDebris(state.arena,layer,h.cameraX,h.cameraY);
      // Native spell cells supply fire and smoke, including while the native
      // dialogue interpreter owns the controls.
      for(const b of state.arena.bursts){
        if(b.age>36)continue;
        const phase=b.age>>2,x=b.x-h.cameraX,y=b.y-h.cameraY;
        layer.stamp('gold-spark',phase,x,y-b.age*.35);
        layer.stamp('impact-spark',phase+2,x+7,y-4-b.age*.5);
      }
    },
    snapshot(){return structuredClone(state);},
    restore(saved){state=saved?structuredClone(saved):initial();mask=null;maskKey='';renderFrame=-1;},
  };
}
