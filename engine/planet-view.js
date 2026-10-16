import {decodePlanetTexture} from './world-texture.js';
import {radioPixels} from './native-radio.js';
import {createOrbitView} from './frieza-orbit-view.js';
import {kaiActors,newKaiScene} from './kai-planet.js';
import {fracturePlanet,fragmentPose} from './planet-fragments.js';
import {createCollateralView} from './frieza-collateral-view.js';
import {pullbackStart} from './frieza-cinematic.js';
import {drawFriezaSprite} from './frieza-sprite.js';
import {createOrbitEffects} from './orbit-effects.js';
import {projectOrbitBackground} from './orbit-camera.js';
import {clashCamera} from './frieza-finale.js';
import {createAerialMeleeView} from './aerial-melee.js';
import {departureOrbit} from './ending-departure.js';
import {bossRushDeathTiming as deathTiming,bossRushDeathPose} from './boss-rush-death.js';

// Scatter once with an independent random sequence for each coordinate.
// The former pair of modular strides made obvious diagonal rows of stars.
// A fixed seed preserves the sky across frames and checkpoint replays.
const stars=(()=>{
  let seed=0x53a19e27;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;},result=[];
  while(result.length<100){
    const x=Math.floor(random()*256),y=Math.floor(random()*224);
    if(result.some(s=>Math.abs(s.x-x)+Math.abs(s.y-y)<4))continue;
    result.push({x,y,shade:Math.floor(random()*4),phase:Math.floor(random()*240),bright:random()<.05});
  }
  return result;
})();

// A 256x224 RGB555 picture surface, before native brightness/color math.
// It never writes Mode 7 matrices, sky HDMA, VRAM, or the landing ABI.
export function createPlanetView(snes,mod){
  const p=snes.ppu,previous=p.getColor,surface=new Uint16Array(256*224);
  let texture=null,frame=-1,preparedState=null,globe=null,globeKey='',fragments=null,card=null,cardKey='';
  let viewFrame=-1,viewLine=-1,viewX=256,view=null;
  const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
  const blue=[rgb(4,7,20),rgb(6,17,30),rgb(16,26,31),rgb(31,31,31)];
  const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(c>0&&x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
  const orbitFx=createOrbitEffects(snes,mod,put);
  function disc(x,y,r,c){for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)if(xx*xx+yy*yy<=r*r)put(x+xx,y+yy,c);}
  function line(x,y,xx,yy,c){const steps=Math.ceil(Math.max(Math.abs(xx-x),Math.abs(yy-y)));for(let i=0;i<=steps;i++)put(x+(xx-x)*i/(steps||1),y+(yy-y)*i/(steps||1),c);}
  function blit(a,x,y,sx,sy,w,h){if(!a)return;for(let py=0;py<h;py++)for(let px=0;px<w;px++){const c=a.pixels[(sy+py)*a.width+sx+px];if(c)put(x+px,y+py,c);}}
  function spell(group,frame,x,y){
    const frames=mod.spriteLayer.effects[group];if(!frames?.length)return;
    const pixels=frames[frame%frames.length];
    for(let py=0;py<16;py++)for(let px=0;px<16;px++){const c=pixels[py*16+px];if(c)put(x+px-8,y+py-8,c);}
  }
  function sky(age,camera){
    surface.fill(rgb(0,0,2));
    for(const star of stars){
      const {shade,phase,bright}=star;
      const point=camera?projectOrbitBackground(camera,star,bright?3:1+(shade&1)):star;
      const x=((point.x%256)+256)%256,y=((point.y%224)+224)%224;
      const c=rgb(5+shade*2,7+shade*2,11+shade*3);
      put(x,y,c);if(bright&&(age+phase)%240<9){put(x-1,y,c);put(x+1,y,c);put(x,y-1,c);put(x,y+1,c);}
    }
  }
  function planet(target,night,view={x:87,y:140,r:72}){
    // Mode 7-style fixed camera increments and four palette shade bands.
    // Texture movement stays on a small integer grid, without smooth light
    // gradients introducing hundreds of interpolated sprite colors.
    target={x:Math.round(target.x/8)*8,y:Math.round(target.y/8)*8};
    const key=`${target.x}:${target.y}:${night}:${view.x}:${view.y}:${view.r}`;if(key===globeKey&&globe)return;
    globeKey=key;globe=new Uint16Array(256*224);fragments=null;
    // Put the actual strike site on the upper-right limb of the globe.
    const cx=Math.round(view.x),cy=Math.round(view.y),r=Math.round(view.r),hitX=.62,hitY=-.69,hitZ=Math.sqrt(1-hitX*hitX-hitY*hitY);
    const lon=target.x/4096*Math.PI*2-Math.atan2(hitX,hitZ),lat=target.y/4096*Math.PI-Math.asin(hitY);
    for(let y=Math.max(0,cy-r-3);y<=Math.min(223,cy+r+3);y++)for(let x=Math.max(0,cx-r-3);x<=Math.min(255,cx+r+3);x++){
      const nx=(x-cx)/r,ny=(y-cy)/r,d=nx*nx+ny*ny;if(d>1.07)continue;
      let color;
      if(d>1)color=blue[d<1.035?1:0]-1;
      else{
        const z=Math.sqrt(1-d),wx=(lon+Math.atan2(nx,z))*4096/(Math.PI*2),wy=(lat+Math.asin(ny))*4096/Math.PI;
        const raw=texture.sample(wx,wy,night),light=Math.max(1,Math.min(4,Math.round((.35+z*.65-nx*.16-ny*.18)*4)));
        const shade=c=>(c*light)>>2;
        color=shade(raw&31)|(shade(raw>>5&31)<<5)|(shade(raw>>10&31)<<10);
      }
      globe[y*256+x]=color+1;
    }
  }
  function drawPlanet(target,night,shake=0,view){
    planet(target,night,view);
    for(let y=0;y<224;y++)for(let x=0;x<256;x++){const c=globe[y*256+x];if(c)put(x+shake,y,c);}
  }
  const pale=(color,alpha)=>{
    const c=color-1,mix=(n,t)=>Math.round(n+(t-n)*alpha);
    return rgb(mix(c&31,28),mix(c>>5&31,30),mix(c>>10&31,31));
  };
  function flash(alpha,native=false){
    const add=Math.round(alpha*31);
    for(let i=0;i<surface.length;i++){
      if(native){const c=surface[i]-1;surface[i]=rgb(Math.min(31,(c&31)+add),Math.min(31,(c>>5&31)+add),Math.min(31,(c>>10&31)+add));}
      else surface[i]=pale(surface[i],alpha);
    }
  }
  const drawOrbit=createOrbitView(snes,mod,{put,disc,line,spell,rgb,drawPlanet,flash});
  const collateral=createCollateralView(snes,{put,disc,line,rgb});
  const aerialMelee=createAerialMeleeView(snes,mod,{put,rgb,flash});
  function beam(age){
    const start={x:132,y:90},dx=.66,dy=-.7513,envelope=Math.max(0,Math.min(1,(age+8)/14,(112-age)/30));
    const length=210*Math.min(1,(age+12)/24),width=18*envelope;
    if(envelope>0)for(let y=0;y<114;y++)for(let x=100;x<256;x++){
      const along=(x-start.x)*dx+(y-start.y)*dy,across=Math.abs((x-start.x)*dy-(y-start.y)*dx);
      const radius=width*(.48+.52*Math.min(1,(along+6)/32));
      if(along<0||along>length||across>radius)continue;
      const edge=radius-across;put(x,y,blue[edge<2?0:edge<4?1:edge<7?2:3]);
    }
    // A shock ring wraps the strike point, then breaks into drifting dust.
    const spread=8+age*.26;
    if(age<88)for(let i=0;i<80;i++){
      const a=i*Math.PI/40;put(start.x+Math.cos(a)*spread,start.y+Math.sin(a)*spread*.34,blue[age<25?3:1]);
    }
    for(let i=0;i<64;i++){
      const delay=i%9*3,t=age-delay;if(t<0||t>105+i%5*9)continue;
      const a=i*2.39996,speed=.16+(i%7)*.065,px=start.x+Math.cos(a)*t*speed+dx*t*.19,py=start.y+Math.sin(a)*t*speed+dy*t*.13;
      const color=t<25?blue[2+i%2]:t<70?rgb(16+i%4,18+i%4,20+i%5):rgb(7,9,13);
      if((i+t)%4!==0||t<70)disc(px,py,t<60&&i%4===0?2:1,color);
    }
  }
  function explodingPlanet(age,target){
    planet(target,true);fragments??=fracturePlanet(globe);
    if(age<48){
      drawPlanet(target,true,age>25?(age%4<2?-1:1):0);
      // Fracture seams spread outward and become the chunks' actual edges.
      const reach=age*1.9,shake=age>25?(age%4<2?-1:1):0;
      for(const p of fragments)for(const v of p.pixels)if(v.edge&&Math.hypot(v.x-87,v.y-140)<reach)
        put(v.x+shake,v.y,age<30?rgb(30,12,2):rgb(31,27,16));
    }else{
      const t=age-48,radius=8+t*3;
      // Uneven continental shards tumble out with hot, broken edges. Their
      // masks are never padded to rectangles; rotation leaves real voids.
      if(t<115)for(const p of fragments){
        const pose=fragmentPose(p,t),{cos,sin,squash,heat,fade}=pose;
        const radius=Math.ceil(Math.hypot(p.width,p.height));
        // Sample backwards through the rotation so the solid rock does not
        // acquire checkerboard holes between rounded destination pixels.
        for(let depth=1;depth>=0;depth--)for(let y=Math.max(0,Math.floor(pose.y-radius));y<Math.min(224,pose.y+radius);y++)for(let x=Math.max(0,Math.floor(pose.x-radius));x<Math.min(256,pose.x+radius);x++){
          const dx=x-pose.x-depth*2,dy=y-pose.y-depth*3;
          const sx=Math.round(dx*cos+dy*sin+p.x-p.left),sy=Math.round((-dx*sin+dy*cos)/squash+p.y-p.top);
          if(sx<0||sy<0||sx>=p.width||sy>=p.height)continue;
          const i=sy*p.width+sx,raw=p.colors[i];if(!raw)continue;const c=raw-1;
          const shade=(value,glow)=>Math.min(31,Math.floor((value+glow*heat)*fade));
          const color=depth?rgb(shade(8,18),shade(3,6),shade(3,0)):p.edges[i]?rgb(shade(c&31,26),shade(c>>5&31,12),shade(c>>10&31,2)):
            rgb(shade(c&31,10),shade(c>>5&31,4),shade(c>>10&31,0));
          put(x,y,color);
        }
      }
      if(t<8)disc(87,140,Math.min(86,18+t*10),rgb(31,31,31));
      if(t<70)for(let i=0;i<18;i++){
        const a=i*2.39996,dist=20+t*(.65+i%5*.17);
        spell('gold-spark',(t>>2)+i,87+Math.cos(a)*dist,140+Math.sin(a)*dist);
      }
      if(t<90)for(let i=0;i<180;i++){const a=i*Math.PI/90;put(87+Math.cos(a)*radius,140+Math.sin(a)*radius*.42,t<28?blue[3]:blue[1]);}
    }
  }
  function cosmicBattle(state){
    if(aerialMelee(state))return;
    if(collateral.draw(state))return;
    const t=state.age-pullbackStart,uZoom=Math.max(0,Math.min(1,t/200)),ease=uZoom*uZoom*(3-2*uZoom);
    const view={x:Math.round(95*ease),y:Math.round(282-128*ease),r:Math.round(240-136*ease)};
    drawPlanet(state.target,true,0,view);
    // Project everything through ONE camera, in planet-radius units. The
    // strike site, Death Ball and beam widths all
    // shrink and move with the globe instead of sliding over the zoom.
    const project=(x,y)=>({x:Math.round(view.x+x*view.r),y:Math.round(view.y+y*view.r)});
    const source={x:.62,y:-.69},dx=181/256,dy=-181/256,point=d=>project(source.x+dx*d,source.y+dy*d);
    const origin=point(0),scale=view.r/104;
    if(t>=35&&t<190){
      const envelope=Math.max(0,Math.min(1,(t-35)/18,(190-t)/35)),width=13*envelope*scale;
      const end=point(Math.min(3,(t-35)/24));
      orbitFx.beam(origin.x,origin.y,end.x,end.y,width,t);
    }
    if(t<140){
      const distance=t<70?1.15*(1-t/70):((t-70)/30)**1.4,orb=point(distance);
      mod.kiArt?.draw('death',(t>>3)%12,orb.x,orb.y,Math.round(29*scale/16)*16,put);
    }
    // Two tiny fighters leave the surface after the shot has passed. Their
    // final positions match the orbital encounter's opening composition.
    if(t>=150){
      const u=Math.min(1,(t-150)/70),g={x:origin.x+(156-origin.x)*u,y:origin.y+(155-origin.y)*u},f={x:origin.x+(202-origin.x)*u,y:origin.y+(57-origin.y)*u};
      const a=mod.spriteLayer.atlas.ssj;
      if(a)for(let y=0;y<16;y++)for(let x=0;x<16;x++){const c=a.pixels[(128+y*2)*a.width+34*32+x*2];if(c)put(g.x-8+x,g.y-8+y,c);}
      drawFriezaSprite(mod.frieza.portraitAtlas,4,f.x,f.y+10,put,{tiny:true,flip:true});
    }
  }
  function kaiPlanet(state){
    // Full opaque Snake Way / golden-cloud map: no orbital starfield leaks
    // into the overhead epilogue. The native dialogue still draws above it.
    mod.kaiArt?.backdrop(surface);
    const scene=state.kai??newKaiScene(),b=scene.bubbles;
    const goku=mod.spriteLayer.atlas[state.outcome==='good'?'goku':mod.frieza?.permanent?'ssj':'goku'];
    const arriving=state.phase==='kai'&&state.age<12;
    const walk=b.walking?Math.floor(b.step/9)%4:1,row=b.direction==='down'?4:b.direction==='up'?8:12;
    const kaiFrame=state.phase==='complete'?3:state.outcome==='bad'?2:Math.floor(state.age/28)%2;
    const actors=[
      {y:kaiActors.kai.y,draw:()=>mod.kaiArt?.npc(kaiFrame,kaiActors.kai.x,kaiActors.kai.y,put)},
      {y:b.y,draw:()=>mod.kaiArt?.npc(row+walk,b.x,b.y,put,b.direction==='left')},
      {y:kaiActors.goku.y,draw:()=>{
        if(!arriving||state.age>5)blit(goku,kaiActors.goku.x-16,kaiActors.goku.y-31,0,32,32,32);
        if(arriving)for(let i=0;i<9;i++)line(138+i*3,129+i%3*2,138+i*3,163-i%2*4,blue[1+i%3]);
      }},
    ];
    actors.sort((a,b)=>a.y-b.y).forEach(a=>a.draw());
    if(state.phase==='complete'){
      const text=state.outcome==='bad'?'         BAD ENDING\n      THE WORLD IS GONE.':'        SECRET OF GOKU\n          THE END';
      if(text!==cardKey){cardKey=text;card=radioPixels(snes.cart.data,text);}
      for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=card[y*240+x];if(c)put(x+8,y+14,c);}
    }
  }
  function prepare(state,isShot){
    frame=mod.frame;preparedState=state;const age=state.age;
    if(state.fatal){
      const pose=bossRushDeathPose(state);
      if(state.orbit&&age<deathTiming.black){
        sky(state.orbit.age,pose.camera);drawOrbit(state.orbit,pose);
      }else if(age<deathTiming.planet)surface.fill(1);
      else{
        sky(age);
        if(age<deathTiming.rupture)drawPlanet(state.target??{x:2432,y:3024},true,age>deathTiming.rupture-36?(age%4<2?-1:1):0);
        else explodingPlanet(age-deathTiming.rupture,state.target??{x:2432,y:3024});
      }
      const light=pose.light;
      for(let i=0;i<surface.length;i++){const c=surface[i]-1;surface[i]=rgb(Math.round((c&31)*light),Math.round((c>>5&31)*light),Math.round((c>>10&31)*light));}
      if(age>=deathTiming.gameOver){
        const key='          GAME OVER\n\n      The planet is gone.';
        if(cardKey!==key){cardKey=key;card=radioPixels(snes.cart.data,key);}
        for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=card[y*240+x];if(c)put(x+8,y+80,c);}
      }
      return;
    }
    sky(age,state.kind==='frieza-orbit'?(state.clash?clashCamera(state):state.camera):null);
    const target=state.target??{x:2432,y:3024};
    if(state.kind==='frieza-orbit')drawOrbit(state);
    else if(state.kind==='frieza-cosmic')cosmicBattle(state);
    else if(isShot){drawPlanet(target,!!mod.frieza?.crisisActive);beam(age);}
    else if(['kai','complete'].includes(state.phase)){
      kaiPlanet(state);
      if(state.outcome==='good'&&state.phase==='kai'&&age<32){
        const scale=age/32;for(let i=0;i<surface.length;i++){const c=surface[i]-1;surface[i]=rgb(Math.round((c&31)*scale),Math.round((c>>5&31)*scale),Math.round((c>>10&31)*scale));}
      }
    }
    else if(state.phase==='explode')explodingPlanet(age,target);
    else if(state.phase==='escape'){
      explodingPlanet(125+age,target);
      const goku=mod.spriteLayer.atlas[mod.frieza?.permanent?'ssj':'goku'];
      if(age<15){blit(goku,168,68,(mod.frieza?.permanent?22:26)*32,32,32,32);for(let i=0;i<12;i++)line(170+i*2,64+age,170+i*2,104-age,blue[i%3]);}
    }else{
      drawPlanet(target,!!mod.frieza?.crisisActive);
      if(state.phase==='depart'){
        const pose=departureOrbit(age),goku=mod.spriteLayer.atlas.goku;
        // Match the established orbital scale, sampling the original flight
        // cell at half size. No free-angle trails or instantaneous full cut.
        if(goku)for(let py=0;py<16;py++)for(let px=0;px<16;px++){
          const c=goku.pixels[(128+py*2)*goku.width+38*32+px*2];if(c)put(pose.x-8+px,pose.y-16+py,c);
        }
        for(let i=0;i<surface.length;i++){
          const c=surface[i]-1,mix=n=>Math.round((n+(31-n)*pose.white)*(1-pose.black));
          surface[i]=rgb(mix(c&31),mix(c>>5&31),mix(c>>10&31));
        }
      }
    }
    if(isShot&&!['frieza-orbit','frieza-cosmic'].includes(state.kind)&&age>164){const factor=Math.max(0,(186-age)/22);for(let i=0;i<surface.length;i++){const c=surface[i]-1;surface[i]=1+Math.floor((c&31)*factor)+(Math.floor((c>>5&31)*factor)<<5)+(Math.floor((c>>10&31)*factor)<<10);}}
  }
  function selectView(){
    if(!mod.options.enabled||!mod.gokuActive)return null;
    if(mod.ending?.defeated){
      const state=mod.ending.planetScene;
      return mod.ending.nativeDeath?{light:bossRushDeathPose(state).light}:{state,fatal:true};
    }
    const returning=mod.frieza?.returnScene;
    if(returning&&returning.age<24)return{pale:1-returning.age/24};
    const orbit=mod.frieza?.orbit;
    // Let the cartridge show and operate its real inventory/status pages.
    const ring=orbit&&mod.nativeField&&!!(mod.read8(0xec)&12);
    if(orbit&&(!mod.nativeField||mod.read8(0xec)&0xfe&&!ring))return null;
    const shot=mod.worldKi?.cinematic??mod.frieza?.cinematic??orbit,state=shot??mod.ending?.planetScene;
    return state?{state,shot,orbit,ring}:null;
  }
  // The whole effect on the inner [color, layer, pixel] (result or a new array).
  function shade(sub,x,y,result){
    if(sub||y>224||!texture)return result;
    // Scene/party getters are relatively expensive. Ordinary ground fights
    // used to evaluate all of them for every pixel, even with no globe in
    // view. Resolve once per scanline; a new query pass also refreshes the
    // selection for paused menus and restored checkpoints in the same frame.
    if(viewFrame!==mod.frame||viewLine!==y||x<=viewX){viewFrame=mod.frame;viewLine=y;view=selectView();}
    viewX=x;if(!view)return result;
    if(view.light!==undefined){const c=result[0],light=view.light;result[0]=Math.round((c&31)*light)|(Math.round((c>>5&31)*light)<<5)|(Math.round((c>>10&31)*light)<<10);return result;}
    if(view.pale!==undefined){result[0]=pale(result[0]+1,view.pale)-1;return result;}
    const {state,shot,orbit,ring}=view;
    if(frame!==mod.frame||preparedState!==state)prepare(state,!!shot);
    if(view.fatal){result[0]=y===224?0:surface[y*256+x]-1;result[1]=4;result[2]=0x86;return result;}
    // Keep native event text above the ending picture. The aerial cut has no
    // HUD/radar/radio at all, including the source camera's compass.
    if(!shot&&result[1]===2&&y<170&&state.phase!=='complete')return result;
    // The native HP digits, gauge and Goku portrait stay visible through the
    // introduction and beam struggle too. Native rings draw above the same
    // paused orbital picture; full inventory/status pages own their screen.
    if(orbit&&(ring||y>=190)&&(result[1]===2||result[1]===4))return result;
    result[0]=y===224?0:surface[y*256+x]-1;result[1]=4;result[2]=0x86;return result;
  }
  p.getColor=function(sub,x,y){return shade(sub,x,y,previous.call(this,sub,x,y));};
  p.registerLineHook?.('getColor',p.getColor,previous,(ppu,line)=>{
    if(line>224||!texture)return true;
    viewFrame=mod.frame;viewLine=line;viewX=-1;view=selectView();
    return !view;
  },{name:'planet-view',post:(ppu,sub,x,y,r)=>{const t=shade(sub,x,y,r);if(t!==r){r[0]=t[0];r[1]=t[1];r[2]=t[2];}}});
  return{ready:collateral.ready,load(rom){texture=decodePlanetTexture(rom);frame=-1;viewFrame=-1;viewX=256;globeKey='';},
    renderDefeat(){
      const state=mod.ending?.planetScene;if(!state?.fatal)return;
      if(mod.ending.nativeDeath)return;
      prepare(state,false);
      // Emit the same 256px picture through the emulator's output buffer.
      // After the native collapse/reaper, no CPU/APU execution can trigger
      // a native defeat warp or save writes underneath the planet sequence.
      for(let y=1;y<225;y++)for(let x=0;x<256;x++){
        const c=(surface[Math.min(223,y)*256+x]||1)-1,at=(y*512+x*2)*3;
        for(let i=0;i<2;i++){p.pixelOutput[at+i*3]=(c&31)*255/31;p.pixelOutput[at+i*3+1]=(c>>5&31)*255/31;p.pixelOutput[at+i*3+2]=(c>>10&31)*255/31;}
      }
      p.frameOverscan=false;p.frameInterlace=false;
    },dispose(){p.getColor=previous;}};
}
