import {installArrivalEventData} from './arrival-event-data.js';
import {decodePotosCrater} from './native-crater.js';
import {drawSaiyanPod,saiyanPodFrames} from './saiyan-pod.js';
import {crownGoku} from './native-names.js';

// A single hand-off in the native sword event. Text, input waits, sound, ghost,
// inventory and story flags still execute in the original event interpreter.
export function createArrival(snes,mod){
  let event=null,crater=null,craterOnScreen=false,craterX=0,craterY=0;
  const groundPalette=new Uint16Array(128),craterColors=new Map();
  const state={phase:'prologue',ticks:0,arrived:false,started:false,crater:false,effectsSettled:false};
  const pointer=()=>mod.read16(0xd1)|(mod.read8(0xd3)<<16);
  const setPointer=address=>{mod.write16(0xd1,address);mod.write8(0xd3,address>>16);};
  const setPhase=phase=>{
    if(state.phase!==phase){
      state.phase=phase;state.ticks=0;
      if(phase==='descent')mod.playSound?.('flight');
      if(phase==='impact')mod.playSound?.('impact');
    }else state.ticks++;
  };
  const nativeProgress=()=>mod.read8(0xcf10)>0&&(
    ((mod.read8(0xe000)&1)!==0&&[0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0].every((v,i)=>mod.read8(0x100+i)===v))||
    mod.nativeFlight||(!mod.flight&&mod.read8(0xe4)===1&&mod.read8(0xe5)===1&&(mod.read8(0xe000)&1)!==0));
  const api={
    get phase(){return state.phase;},get ticks(){return state.ticks;},
    get arrived(){return state.arrived;},get crater(){return state.crater;},
    get animating(){return state.phase==='descent'||state.phase==='impact';},
    load(rom,{potos=false}={}){
      event?.dispose();event=installArrivalEventData(snes.cart,rom);crater=decodePotosCrater(rom);
      for(let p=1;p<=6;p++)for(let i=1;i<16;i++){
        const at=0xc8000+26*210+(p-1)*30+(i-1)*2;groundPalette[p*16+i]=rom[at]|rom[at+1]<<8;
      }
      Object.assign(state,{phase:potos?'complete':'prologue',ticks:0,arrived:potos,started:potos,crater:false,effectsSettled:potos});
      craterOnScreen=false;
    },
    snapshot(){return {version:1,...state};},
    restore(saved){
      if(saved?.version===1&&['prologue','queued','descent','impact','ghost','dialogue','complete'].includes(saved.phase)){
        Object.assign(state,{phase:saved.phase,ticks:Math.max(0,saved.ticks|0),arrived:!!saved.arrived,started:!!saved.started,crater:!!saved.crater,effectsSettled:!!saved.effectsSettled});
      }else{
        // Old checkpoints predate the scripted arrival. Native sword progress
        // distinguishes the original boy prologue from the existing Goku game.
        const arrived=nativeProgress();
        Object.assign(state,{phase:arrived?'complete':'prologue',ticks:0,arrived,started:arrived,crater:false,effectsSettled:false});
        const phase=event?.classify(pointer());
        if(phase&&phase!=='finish'){state.phase=phase;state.started=true;state.arrived=phase!=='descent';state.crater=state.arrived;}
      }
      craterOnScreen=false;
    },
    beforeFrame(){
      if(!event)return;
      if(state.phase==='complete'&&!state.effectsSettled&&mod.read8(0xd0)===0){
        // Repair completed checkpoints made with the old 2D03 command.
        // That selects a weaker continuous quake ($49=60); 2D04 stops it.
        // Run once, only in the sword clearing, so later native/attack shakes
        // retain their own lifetime and ownership.
        if(mod.read16(0xdc)===128&&mod.read8(0x49)===0x60)mod.write8(0x49,0);
        state.effectsSettled=true;
      }
      const pc=pointer();
      if(!state.started&&mod.options.enabled&&mod.read16(0xdc)===128&&mod.read8(0xcf10)===0&&pc===event.hook&&(mod.read8(0xd0)&0x80)){
        setPointer(event.entry);state.started=true;setPhase('queued');return;
      }
      if(!state.started){
        // Covers native saves and debug area fixtures loaded after the sword.
        if(nativeProgress()){state.arrived=true;state.started=true;setPhase('complete');}
        return;
      }
      const phase=event.classify(pc);
      // The original grunt and closing box may still be waiting at the entry
      // pointer. Start the dive only when the native 60-frame pause begins.
      if(phase==='descent'&&pc<event.labels.descentWait)return;
      if(phase==='finish'){
        setPointer(event.resume);mod.write8(0xd0,1);setPhase('complete');return;
      }
      if(phase){
        setPhase(phase);
        if(!state.arrived&&['impact','ghost','dialogue'].includes(phase)){
          state.arrived=true;state.crater=true;
          crownGoku(snes.ram); // native GOKU name; the boy's name moves to the slot tail
          mod.attackHeld=0;mod.nativeTapFrames=0;mod.charging=false;mod.charge=0;
        }
      }
    },
    drawScene(layer){
      if(!api.animating)return false;
      const cameraX=mod.read16(0xe002)-mod.readSigned16(0xe020),cameraY=mod.read16(0xe004)-mod.readSigned16(0xe022);
      const cx=500-cameraX,cy=948-cameraY,age=state.ticks,frame=Math.floor(age/3);
      if(state.phase==='descent'){
        const t=Math.min(1,age/59),x=Math.round(cx+64*(1-t)-24),y=Math.round(cy-48-220*(1-t));
        // Goku stays inside the red-windowed pod until its hatch opens.
        // The hot entry trail is still made of original Mana spell cells.
        for(let i=5;i>=1;i--)layer.stamp('gold-charge-orb',Math.max(0,4-i),x+24+i*5,y+12-i*12);
        drawSaiyanPod(layer,x,y,0,true);
      }else{
        // The capsule bounces into the back of the crater, opens its hatch,
        // and Goku hops out toward the unchanged native actor position.
        const settle=Math.min(1,age/42),podX=Math.round(cx-24+24*settle),podY=Math.round(cy-48-10*settle-Math.sin(settle*Math.PI)*9);
        const open=age<58?0:age<74?1:2;
        drawSaiyanPod(layer,podX,podY,open,age<42);
        // Keep the actual sprite cells at native resolution. Multiple blasts
        // spread out from the impact instead of stretching one explosion.
        if(age>=78){
          const hop=Math.min(1,(age-78)/32),targetX=mod.readSigned16(0xe020)-16,targetY=mod.readSigned16(0xe022)-31;
          const x=Math.round((podX+8)*(1-hop)+targetX*hop),y=Math.round((podY+13)*(1-hop)+targetY*hop-Math.sin(hop*Math.PI)*12);
          const column=hop<1?37:36;
          layer.blit('goku',column,0,x,y);
          layer.plan.sprite={x,y,width:32,height:32,row:0,column,arrival:true};
        }
        if(age<84){
          const radius=Math.min(48,age*1.5),count=12;
          for(let i=0;i<count;i++){
            const angle=i*Math.PI*2/count,ox=Math.round(Math.cos(angle)*radius),oy=Math.round(Math.sin(angle)*radius*.65);
            layer.stamp(age<40?'gold-charge-orb':'impact-spark',frame+i,cx+ox,cy-12+oy);
            if(age<44)layer.stamp('beam-head',frame+i,cx+Math.round(ox*.45),cy-12+Math.round(oy*.45));
          }
          layer.stamp('gold-charge-orb',frame,cx,cy-12);
          if(age<36)for(let i=-2;i<=2;i++)layer.stamp('lightning',frame+i,cx+i*18,cy-32-Math.abs(i)*6);
        }
        if(age>=40&&age<110)for(let i=0;i<8;i++){
          const angle=i*Math.PI/4,radius=30+(age-40)/2;
          layer.stamp('gold-spark',frame+i,cx+Math.round(Math.cos(angle)*radius),cy-20+Math.round(Math.sin(angle)*radius*.5));
        }
      }
      return true;
    },
  };

  // The crater is a map decoration underneath all native sprites, dialogue,
  // rings and menus. RGB enters before the PPU applies brightness/color math.
  const ppu=snes.ppu,renderLine=ppu.renderLine,getColor=ppu.getColor;
  ppu.renderLine=function(line){
    if(line===0){
      craterOnScreen=mod.options.enabled&&state.crater&&mod.read16(0xdc)===128&&ppu.mode===1&&mod.read8(0xe4)===1&&mod.read8(0xe5)===1;
      craterX=500-(mod.read16(0xe002)-mod.readSigned16(0xe020))-48;
      craterY=948-(mod.read16(0xe004)-mod.readSigned16(0xe022))-32;
      if(craterOnScreen){
        // The native sword flash animates CGRAM, not screen brightness. Apply
        // its shared channel offsets to the borrowed Potos soil palette too.
        // Palettes6/7 contain cycling river colors. Including them in the
        // maximum makes the stationary crater flash with the water forever.
        const delta=[0,0,0];
        for(let p=1;p<=5;p++)for(let i=1;i<16;i++)for(let c=0;c<3;c++){
          const shift=c*5;delta[c]=Math.max(delta[c],((ppu.cgram[p*16+i]>>shift)&31)-((groundPalette[p*16+i]>>shift)&31));
        }
        craterColors.clear();
        for(const color of crater.pixels)if(color&&!craterColors.has(color)){
          let tinted=0;for(let c=0;c<3;c++)tinted|=Math.min(31,(((color-1)>>(c*5))&31)+delta[c])<<(c*5);
          craterColors.set(color,tinted);
        }
      }
    }
    return renderLine.call(this,line);
  };
  ppu.getColor=function(sub,x,y){
    const result=getColor.call(this,sub,x,y);
    if(craterOnScreen&&(result[1]===0||result[1]===1)){
      const px=Math.floor((x-craterX)/2),py=Math.floor((y-craterY)/2);
      if(px>=0&&py>=0&&px<48&&py<32){const color=crater.pixels[py*48+px];if(color)result[0]=craterColors.get(color);}
      // Once the dust clears, the open capsule stays in the crater as map
      // scenery, behind every native actor/window. Use opaque OBJ color math
      // so the river cannot make the metal hull look submerged.
      if(!api.animating){
        const pod=saiyanPodFrames[2],px=x-craterX-48,py=y-craterY+26;
        if(px>=0&&py>=0&&px<pod.width&&py<pod.height){
          const color=pod.pixels[py*pod.width+px];if(color){result[0]=color-1;result[1]=4;result[2]=0x86;}
        }
      }
    }
    return result;
  };
  // getColor's effect on a whole scanline as compositor paints (see
  // Ppu.registerLineHook): crater colors on BG1/BG2 pixels, then the open
  // pod over the same layers as OBJ palette 0x86. Other lines are untouched.
  const craterLine=new Uint16Array(256),podLine=new Uint16Array(256);
  const craterPaint={type:'paint',layers:3,colors:craterLine,skipZero:true,layer:-1,pixel:0,mainOnly:false};
  const podPaint={type:'paint',layers:3,colors:podLine,skipZero:true,layer:4,pixel:0x86,mainOnly:false};
  const craterRow=y=>{const py=Math.floor((y-craterY)/2);return py>=0&&py<32?py:-1;};
  const podRow=y=>{if(api.animating)return -1;const py=y-craterY+26;return py>=0&&py<saiyanPodFrames[2].height?py:-1;};
  ppu.registerLineHook?.('getColor',ppu.getColor,getColor,(p,line)=>!craterOnScreen||craterRow(line)<0&&podRow(line)<0,{name:'arrival',plan:(p,line,plan)=>{
    const cy=craterRow(line),py=podRow(line);
    if(cy>=0){
      let any=false;
      for(let x=0;x<256;x++){const px=Math.floor((x-craterX)/2),color=px>=0&&px<48?crater.pixels[cy*48+px]:0;craterLine[x]=color?craterColors.get(color)+1:0;any||=!!color;}
      if(any)plan.extra.push(craterPaint);
    }
    if(py>=0){
      const pod=saiyanPodFrames[2];let any=false;
      for(let x=0;x<256;x++){const px=x-craterX-48,color=px>=0&&px<pod.width?pod.pixels[py*pod.width+px]:0;podLine[x]=color;any||=!!color;}
      if(any)plan.extra.push(podPaint);
    }
    plan.skipPost=true;return true;
  }});
  mod.arrival=api;
  return api;
}
