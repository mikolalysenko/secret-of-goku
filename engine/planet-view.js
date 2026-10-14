import {decodePlanetTexture} from './world-texture.js';
import {radioPixels} from './native-radio.js';

// A 256x224 RGB555 picture surface, before native brightness/color math.
// It never writes Mode 7 matrices, sky HDMA, VRAM, or the landing ABI.
export function createPlanetView(snes,mod){
  const p=snes.ppu,previous=p.getColor,surface=new Uint16Array(256*224);
  let texture=null,frame=-1,preparedState=null,globe=null,globeKey='',card=null,cardKey='';
  const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
  const blue=[rgb(4,7,20),rgb(6,17,30),rgb(16,26,31),rgb(31,31,31)];
  const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(c>0&&x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
  function disc(x,y,r,c){for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)if(xx*xx+yy*yy<=r*r)put(x+xx,y+yy,c);}
  function line(x,y,xx,yy,c){const steps=Math.ceil(Math.max(Math.abs(xx-x),Math.abs(yy-y)));for(let i=0;i<=steps;i++)put(x+(xx-x)*i/(steps||1),y+(yy-y)*i/(steps||1),c);}
  function blit(a,x,y,sx,sy,w,h){if(!a)return;for(let py=0;py<h;py++)for(let px=0;px<w;px++){const c=a.pixels[(sy+py)*a.width+sx+px];if(c)put(x+px,y+py,c);}}
  function spell(group,frame,x,y){
    const frames=mod.spriteLayer.effects[group];if(!frames?.length)return;
    const pixels=frames[frame%frames.length];
    for(let py=0;py<16;py++)for(let px=0;px<16;px++){const c=pixels[py*16+px];if(c)put(x+px-8,y+py-8,c);}
  }
  function sky(age){
    surface.fill(rgb(0,0,2));
    for(let i=0;i<92;i++){
      const x=(i*73+23)%256,y=(i*53+11)%224,c=rgb(9+i%5,11+i%6,17+i%7);
      put(x,y,c);if(i%17===0&&((age>>4)+i)%4===0){put(x-1,y,c);put(x+1,y,c);put(x,y-1,c);put(x,y+1,c);}
    }
  }
  function planet(target,night){
    const key=`${target.x}:${target.y}:${night}`;if(key===globeKey&&globe)return;
    globeKey=key;globe=new Uint16Array(256*224);
    // Put the actual strike site on the upper-right limb of the globe.
    const cx=87,cy=140,r=72,hitX=.62,hitY=-.69,hitZ=Math.sqrt(1-hitX*hitX-hitY*hitY);
    const lon=target.x/4096*Math.PI*2-Math.atan2(hitX,hitZ),lat=target.y/4096*Math.PI-Math.asin(hitY);
    for(let y=cy-r-3;y<=cy+r+3;y++)for(let x=cx-r-3;x<=cx+r+3;x++){
      const nx=(x-cx)/r,ny=(y-cy)/r,d=nx*nx+ny*ny;if(d>1.07)continue;
      let color;
      if(d>1)color=blue[d<1.035?1:0]-1;
      else{
        const z=Math.sqrt(1-d),wx=(lon+Math.atan2(nx,z))*4096/(Math.PI*2),wy=(lat+Math.asin(ny))*4096/Math.PI;
        const raw=texture.sample(wx,wy,night),light=Math.max(.26,Math.min(1,.35+z*.65-nx*.16-ny*.18));
        const shade=c=>Math.min(31,Math.floor(c*light+((x+y)&1)*.4));
        color=shade(raw&31)|(shade(raw>>5&31)<<5)|(shade(raw>>10&31)<<10);
      }
      globe[y*256+x]=color+1;
    }
  }
  function drawPlanet(target,night,shake=0){
    planet(target,night);
    for(let y=0;y<224;y++)for(let x=0;x<256;x++){const c=globe[y*256+x];if(c)put(x+shake,y,c);}
  }
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
    if(age<48){
      drawPlanet(target,true,age>25?(age%4<2?-1:1):0);
      // Bright cracks split the real continents before the sphere bursts.
      for(let i=0;i<7;i++){
        const a=i*.89,end=Math.min(68,age*2),dx=Math.cos(a),dy=Math.sin(a);
        for(let t=0;t<end;t++)put(87+dx*t+Math.sin(t*.4+i)*2,140+dy*t,age<30?rgb(30,12,2):rgb(31,27,16));
      }
    }else{
      const t=age-48,radius=8+t*3;
      // Break the actual world picture into tumbling pieces, with native
      // spell sparks between them, rather than replacing it with flat dots.
      planet(target,true);
      if(t<110)for(let gy=72;gy<212;gy+=8)for(let gx=15;gx<160;gx+=8){
        const nx=gx+4-87,ny=gy+4-140,d=Math.hypot(nx,ny);if(d>73)continue;
        const seed=(gx*31+gy*17)%23,speed=.3+seed*.035,travel=t*speed+t*t*.002;
        const x=gx+nx/(d||1)*travel,y=gy+ny/(d||1)*travel,fade=Math.max(0,1-(t-40)/70);
        for(let py=0;py<8;py++)for(let px=0;px<8;px++){
          const raw=globe[(gy+py)*256+gx+px];if(!raw||t>55&&(px+py+seed)%3===0)continue;
          const c=raw-1,hot=Math.max(0,1-t/42),shade=(v,glow)=>Math.min(31,Math.floor((v+glow*hot)*fade));
          put(x+(seed&1?7-px:px),y+py,rgb(shade(c&31,22),shade(c>>5&31,10),shade(c>>10&31,2)));
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
    const t=state.age-72;
    drawPlanet(state.target,true,t>28&&t<49?(t%4<2?-1:1):0);
    // A Death Ball dives toward the globe. Goku's blue counterbeam carries
    // it back into space; the damaged Fortress remains for the final fight.
    const u=Math.min(1,t/32),ox=226-85*u,oy=8+73*u,r=8+Math.floor(u*10);
    if(t<49){
      for(let i=0;i<7;i++){const a=i*Math.PI/3.5+t*.14;line(ox+Math.cos(a)*(r-1),oy+Math.sin(a)*(r-1),ox+Math.cos(a)*(r+7),oy+Math.sin(a)*(r+7),rgb(28,8,28));}
      disc(ox,oy,r,rgb(14,2,20));disc(ox-2,oy-2,r-3,rgb(28,5,24));disc(ox-4,oy-4,Math.max(2,r-9),rgb(31,23,30));
    }
    if(t>20)beam(t-20);
    // Small pieces of the Fortress silhouette peel away from the impact.
    for(let i=0;i<23;i++){
      const bx=130+i%7*3,by=77+Math.floor(i/7)*3,torn=Math.max(0,t-29-i%7);
      const x=bx+torn*(i%2?1:-1)*(.12+i%5*.06),y=by-torn*(.25+i%4*.1);
      if(torn>70)continue;
      for(let yy=0;yy<3;yy++)for(let xx=0;xx<3;xx++)put(x+xx,y+yy,yy===0?rgb(19,20,12):rgb(5,10,9));
    }
    if(t>29&&t<75){
      const radius=(t-29)*2;
      for(let i=0;i<150;i++){const a=i*Math.PI/75;put(141+Math.cos(a)*radius,81+Math.sin(a)*radius*.45,t<42?blue[3]:blue[1]);}
      for(let i=0;i<8;i++){const a=i*2.39996,d=(t-29)*.85;spell('impact-spark',(t>>2)+i,141+Math.cos(a)*d,81+Math.sin(a)*d);}
    }
    // One streak reaches beyond the planet and disappears among the stars.
    if(t>=49&&t<90){const q=t-49;line(162+q*3,57-q*3.4,177+q*3,40-q*3.4,blue[3]);}
    if(t>101){const f=Math.max(0,(118-t)/17);for(let i=0;i<surface.length;i++){const c=surface[i]-1;surface[i]=rgb(Math.floor((c&31)*f),Math.floor((c>>5&31)*f),Math.floor((c>>10&31)*f));}}
  }
  function kaiPlanet(state){
    // Authored pixel scenery: the tiny round lawn, curved road, house, tree,
    // car and blue antennaed Kai. No borrowed picture or canvas smoothing.
    const cx=128,cy=181,rx=99,ry=35;
    for(let y=146;y<218;y++)for(let x=24;x<232;x++){
      const d=(x-cx)**2/rx**2+(y-cy)**2/ry**2;if(d>1)continue;
      const grain=(x*17+y*31)%29,shade=Math.floor(Math.max(0,y-177)/7),edge=d>.93;
      put(x,y,edge?rgb(3,9-shade,4):grain<4?rgb(13-shade,23-shade,7):rgb(8-shade,18-shade,5));
      const road=Math.abs(Math.hypot((x-128)*.62,(y-181)*1.5)-31);
      if(y>167&&road<5.5)put(x,y,road>4?rgb(9,10,9):rgb(18+grain%3,18+grain%3,16+grain%3));
    }
    // Small house and its red tiled roof.
    for(let y=143;y<171;y++)for(let x=55;x<94;x++)put(x,y,y>165?rgb(15,10,6):x>86?rgb(18,16,11):y%7===0?rgb(21,19,13):rgb(26,24,17));
    for(let y=130;y<146;y++)for(let x=51+(145-y);x<98-(145-y);x++)put(x,y,y===145?rgb(9,4,3):((x+y)%7===0||y%4===0)?rgb(27,13,7):rgb(18,5,4));
    for(let y=151;y<171;y++)for(let x=72;x<81;x++)put(x,y,rgb(9,7,6));
    for(const x of[59,84])for(let y=151;y<159;y++)for(let xx=x;xx<x+5;xx++)put(xx,y,rgb(9,19,25));
    for(let y=122;y<168;y++)for(let x=184;x<190;x++)put(x,y,x<186?rgb(19,12,5):rgb(11,7,4));
    for(const[x,y,r]of[[184,116,16],[196,120,13],[175,125,12]]){disc(x+1,y+2,r,rgb(4,11,4));disc(x-2,y-2,r-3,rgb(9,19,5));}
    for(let y=101;y<138;y++)for(let x=164;x<209;x++)if(surface[y*256+x]===rgb(9,19,5)&&(x*7+y*13)%23<4)put(x,y,rgb(13,23,7));
    // Kai's famously impractical car on a very small road.
    for(let y=192;y<201;y++)for(let x=53;x<81;x++)put(x,y,rgb(24,4,5));
    for(let y=187;y<193;y++)for(let x=60;x<75;x++)put(x,y,rgb(9,19,25));
    disc(59,201,3,rgb(1,1,2));disc(76,201,3,rgb(1,1,2));
    const kai=[
      '..d...........d..','...d.........d...','....d.......d....','.....bbbbbbb.....','....bbccccbbbd...',
      '...bbccccccbbbd..','..bbbccccccbbbdd.','..kkkwkkbkkwkkkd.','..kkkkkkbkkkkkkd.',
      '..bbbccccccbbbdd.','...bbwwwwwwbbdd..','....bbccccbbdd...','.....bbbbbbb.....','....rrrrrrrrr....',
      '...rrkkkkkkkrr...','..rrkkkkkkkkkrr..','.drrkkkkkkkkkrrd.','bbrrkkkwwwkkkrrbb',
      'bcrrkkwwwwwkkrrcb','bcrrkkwkwkwkkrrcb','.brrkkwwwwwkkrrb.','..rrkkkwwwkkkrr..',
      '..rrkkkkkkkkkrr..','..rrkkkkkkkkkrr..','...rrrrrrrrrrr...','....kkk.kkkk.....','...kkkk.kkkkk....',
    ],colors={b:rgb(10,23,27),c:rgb(16,28,30),d:rgb(5,14,18),k:rgb(1,2,4),w:rgb(30,28,17),r:rgb(23,5,4)};
    kai.forEach((row,y)=>[...row].forEach((v,x)=>{if(colors[v])put(108+x,145+y,colors[v]);}));
    const goku=mod.spriteLayer.atlas[mod.frieza?.permanent?'ssj':'goku'];
    const arriving=state.phase==='kai'&&state.age<12;
    if(!arriving||state.age>5)blit(goku,139,146,0,32,32,32);
    if(arriving)for(let i=0;i<9;i++)line(142+i*3,143+i%3*2,142+i*3,177-i%2*4,blue[1+i%3]);
    if(state.phase==='complete'){
      const text=state.outcome==='bad'?'         BAD ENDING\n      THE WORLD IS GONE.':'        SECRET OF GOKU\n          THE END';
      if(text!==cardKey){cardKey=text;card=radioPixels(snes.cart.data,text);}
      for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=card[y*240+x];if(c)put(x+8,y+14,c);}
    }
  }
  function prepare(state,isShot){
    frame=mod.frame;preparedState=state;const age=state.age;sky(age);
    const target=state.target??{x:2432,y:3024};
    if(state.kind==='frieza-cosmic')cosmicBattle(state);
    else if(isShot){drawPlanet(target,!!mod.frieza?.crisisActive);beam(age);}
    else if(['kai','complete'].includes(state.phase))kaiPlanet(state);
    else if(state.phase==='explode')explodingPlanet(age,target);
    else if(state.phase==='escape'){
      explodingPlanet(125+age,target);
      const goku=mod.spriteLayer.atlas[mod.frieza?.permanent?'ssj':'goku'];
      if(age<15){blit(goku,168,68,(mod.frieza?.permanent?22:26)*32,32,32,32);for(let i=0;i<12;i++)line(170+i*2,64+age,170+i*2,104-age,blue[i%3]);}
    }else{
      drawPlanet(target,!!mod.frieza?.crisisActive);
      if(state.phase==='depart'){
        const t=Math.min(1,age/48),x=124+140*t,y=81-115*t;
        line(x-10,y+14,x-27,y+34,blue[1]);line(x-8,y+12,x-20,y+27,blue[2]);
        const ssj=!!mod.frieza?.permanent;blit(mod.spriteLayer.atlas[ssj?'ssj':'goku'],x-16,y-16,(ssj?34:38)*32,128,32,32);
      }
    }
    if(isShot&&age>164){const factor=Math.max(0,(186-age)/22);for(let i=0;i<surface.length;i++){const c=surface[i]-1;surface[i]=1+Math.floor((c&31)*factor)+(Math.floor((c>>5&31)*factor)<<5)+(Math.floor((c>>10&31)*factor)<<10);}}
  }
  p.getColor=function(sub,x,y){
    const result=previous.call(this,sub,x,y);
    if(sub||y>224||!mod.options.enabled||!mod.gokuActive||!texture)return result;
    const shot=mod.worldKi?.cinematic??mod.frieza?.cinematic,state=shot??mod.ending?.planetScene;
    if(!state)return result;
    if(frame!==mod.frame||preparedState!==state)prepare(state,!!shot);
    // Keep native event text above the ending picture. The aerial cut has no
    // HUD/radar/radio at all, including the source camera's compass.
    if(!shot&&result[1]===2&&y<170&&state.phase!=='complete')return result;
    return[y===224?0:surface[y*256+x]-1,4,0x86];
  };
  return{load(rom){texture=decodePlanetTexture(rom);frame=-1;globeKey='';},dispose(){p.getColor=previous;}};
}
