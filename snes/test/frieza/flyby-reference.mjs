// Browser flyby art over the same native world frame. The paired Mesen
// capture disables only the new renderer; story, flight and input still run.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {readPng,writePng} from '../../tools/gfx.mjs';
import {friezaFlybyPose,deathBallFlybyPose,deathBallTiming as timing} from '../../../engine/frieza-flyby.js';
import {prepareFriezaSprite,drawFriezaSprite} from '../../../engine/frieza-sprite.js';
import {createDeathBallArt} from '../../../engine/death-ball-art.js';
import {createOrbitEffects} from '../../../engine/orbit-effects.js';

function atlas(repo){
  const a=readPng(join(repo,'assets/sprites/frieza.png')),pixels=Uint16Array.from({length:a.width*a.height},(_,i)=>a.data[i*4+3]>=128?1+(a.data[i*4]>>3)+((a.data[i*4+1]>>3)<<5)+((a.data[i*4+2]>>3)<<10):0),frames=[];
  for(let i=0;i<8;i++){
    const x0=Math.round(i%4*a.width/4),x1=Math.round((i%4+1)*a.width/4),y0=Math.round((i>>2)*a.height/2),y1=Math.round(((i>>2)+1)*a.height/2);
    let x=x1,y=y1,r=x0,b=y0;
    for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(pixels[yy*a.width+xx]){x=Math.min(x,xx);y=Math.min(y,yy);r=Math.max(r,xx);b=Math.max(b,yy);}
    frames.push({x,y,w:r-x+1,h:b-y+1});
  }
  return prepareFriezaSprite({pixels,width:a.width,frames});
}
const rgba=rgb=>Uint8Array.from({length:256*224*4},(_,i)=>i%4===3?255:rgb[(i>>2)*3+i%4]);
const png=(path,rgb)=>writeFileSync(path,writePng({width:256,height:224,data:rgba(rgb)}));
const percent=(n,d)=>d?Math.round(10000*n/d)/100:null;

export function compareFlyby({repo,actualDir,baseDir,pictures,outDir}){
  mkdirSync(outDir,{recursive:true});
  const rom=readFileSync(join(repo,'rom/secret-of-mana-us.sfc')),sprite=atlas(repo),death=createDeathBallArt(rom),rows=[];
  for(const {name,age,brightness=15} of Object.values(pictures).sort((a,b)=>a.age-b.age)){
    const actual=readFileSync(join(actualDir,name+'.rgb')),base=readFileSync(join(baseDir,name+'.rgb')),body=readFileSync(join(baseDir,name+'.mask'));
    const expected=Buffer.from(base),kind=new Uint8Array(256*224),pose=friezaFlybyPose(age),ball=deathBallFlybyPose(age);
    let layer=1;
    const put=(x,y,c)=>{
      if(x<0||x>=256||y<0||y>=224||!c)return;
      const i=y*256+x;
      if(layer===1&&age<timing.throw&&body[i])return;
      const v=c-1;expected[i*3]=Math.floor((v&31)*brightness/15)*255/31;expected[i*3+1]=Math.floor((v>>5&31)*brightness/15)*255/31;expected[i*3+2]=Math.floor((v>>10&31)*brightness/15)*255/31;kind[i]=layer;
    };
    if(ball.visible)death(ball.frame,ball.x,ball.y,ball.size,put,{cinematic:true});
    layer=2;if(pose.visible)drawFriezaSprite(sprite,pose.frame,pose.x,pose.y,put,{});
    layer=3;const fx=createOrbitEffects({cart:{data:rom}},{spriteLayer:{effects:{}}},put);
    if(age>=timing.impact&&age<timing.impact+120)for(const [i,[x,y]] of [[96,200],[80,186],[112,184],[96,170],[70,176],[122,168],[96,150]].entries()){
      const a=age-timing.impact-i*10;if(a>=0&&a<74)fx.burst(x,y,a,{large:true});
    }
    layer=4;if(age>=timing.impact&&age<timing.impact+8)for(let y=0;y<224;y+=2)for(let x=(y>>1)&1;x<256;x+=2)put(x,y,0x8000);
    const total=[0,0,0,0,0],same=[0,0,0,0,0];let ballRed=0,ballUnion=0,all=0,bodyN=0,bodySame=0;
    for(let i=0;i<kind.length;i++){
      const match=[0,1,2].every(c=>Math.abs(actual[i*3+c]-expected[i*3+c])<=24),k=kind[i];total[k]++;if(match){same[k]++;all++;}
      if(body[i]){bodyN++;if(match)bodySame++;}
      // Large-ball silhouette, independent of its deliberately flattened
      // texture. Count red pixels only in the ball's bounding square and
      // exclude Goku / Frieza, which retain their own depth and palette.
      if(ball.visible&&ball.size>32&&k!==2&&!body[i]){
        const x=i&255,y=i>>8,s=Math.min(224,ball.size);
        if(x>=ball.x-s/2&&x<ball.x+s/2&&y>=ball.y-s/2&&y<ball.y+s/2){
          const red=actual[i*3]>75&&actual[i*3]>actual[i*3+1]*1.45&&actual[i*3]>actual[i*3+2]*1.45;
          if(k===1||red)ballUnion++;if(k===1&&red)ballRed++;
        }
      }
    }
    const r={age,frameAgreement:percent(all,kind.length),artAgreement:percent(same.slice(1).reduce((a,b)=>a+b,0),total.slice(1).reduce((a,b)=>a+b,0)),frieza:percent(same[2],total[2]),ball:percent(same[1],total[1]),silhouette:percent(ballRed,ballUnion),bursts:percent(same[3],total[3]),checker:percent(same[4],total[4]),background:percent(same[0],total[0]),body:percent(bodySame,bodyN)};
    rows.push(r);png(join(actualDir,name+'.png'),actual);png(join(outDir,name+'-browser.png'),expected);png(join(outDir,name+'-world.png'),base);
    const diff=Buffer.from(actual);for(let i=0;i<kind.length;i++)if(![0,1,2].every(c=>Math.abs(actual[i*3+c]-expected[i*3+c])<=24)){diff[i*3]=255;diff[i*3+1]=0;diff[i*3+2]=255;}png(join(outDir,name+'-diff.png'),diff);
  }
  writeFileSync(join(outDir,'agreement.json'),JSON.stringify(rows,null,2)+'\n');
  return rows;
}
