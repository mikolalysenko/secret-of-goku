import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {blank,writePng} from '../../tools/gfx.mjs';

export async function cinematicChecks(dir,repo){
  const {createDeathBallArt}=await import(pathToFileURL(join(repo,'engine/death-ball-art.js')));
  const draw=createDeathBallArt(readFileSync(join(repo,'rom/secret-of-mana-us.sfc')));
  const raw=name=>readFileSync(join(dir,name+'.rgb'));
  const colour=(img,i)=>(img[i*3]>>3)|((img[i*3+1]>>3)<<5)|((img[i*3+2]>>3)<<10);
  const state=JSON.parse(readFileSync(join(dir,'results.json')));
  const reports=[],out=[];
  const cases=[];
  for(const size of [16,32])for(let frame=0;frame<12;frame++)cases.push({name:`red_${size}_${frame}`,size,frame,x:60,y:100,obj:true});
  for(const size of [24,54,80,128,224])cases.push({name:`red_${size}`,size,frame:4,x:size===24?60:128,y:size===24?100:110});
  cases.push({name:'red_clip',size:80,frame:4,x:4,y:2});
  cases.push({name:'violet_after_red',size:80,frame:4,x:128,y:110,violet:true});
  for(const c of cases){
    const expected=new Map();
    draw(c.frame,c.x,c.y,c.size,(x,y,v)=>{if(x>=0&&x<256&&y>=0&&y<224)expected.set(y*256+x,v-1);},{cinematic:!c.violet});
    const visible=i=>{
      if(c.obj||c.violet)return true;
      const x=i%256,y=Math.floor(i/256);
      return y<192&&!(state[c.name+'_native']??[]).some(b=>x>=b.x-1&&x<b.x+b.size+1&&y>=b.y-1&&y<b.y+b.size+1);
    };
    for(const i of expected.keys())if(!visible(i))expected.delete(i);
    let best;
    for(const suffix of ['', '_1','_2']){
      const img=raw(c.name+suffix);let exact=0,red=0,painted=0,intersection=0,union=0;
      for(const [i,v] of expected){const p=colour(img,i);if(p===v)exact++;if((p&31)>(p>>5&31)*1.5&&(p&31)>(p>>10&31)*2)red++;}
      const plain=raw('plain');
      const left=Math.max(0,c.x-c.size/2-2),right=Math.min(255,c.x+c.size/2+2);
      const top=Math.max(0,c.y-c.size/2-2),bottom=Math.min(223,c.y+c.size/2+2);
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        const i=y*256+x,p=colour(img,i);
        if(!visible(i))continue;
        // Red ramp separates the sphere from the green Potos background and
        // the unchanged actors. Browser corona is included in the reference.
        const got=p!==colour(plain,i)&&(p&31)>(p>>5&31)*1.5&&(p&31)>(p>>10&31)*2;
        if(got)painted++;
        if(got&&expected.has(i))intersection++;
        if(got||expected.has(i))union++;
      }
      const score=c.obj?exact/expected.size:intersection/Math.max(1,union);
      if(!best||score>best.score)best={score,exact,red,painted,intersection,union,img};
    }
    const ok=c.violet?best.red/expected.size<.1:best.score>=(c.obj?.99:.85);
    const text=`${c.name}: ${c.obj?'exact art':'silhouette IoU'} ${(100*best.score).toFixed(1)}%, red ${(100*best.red/expected.size).toFixed(1)}%`;
    out.push({ok,text});reports.push({name:c.name,ok,score:best.score,red:best.red/expected.size});
    // Browser | cartridge at native resolution; a review artifact, not committed.
    const pair=blank(512,224);
    for(let i=0;i<256*224;i++){
      const v=expected.get(i),x=i%256,y=Math.floor(i/256),a=(y*512+x)*4,b=a+256*4;
      if(v!==undefined){pair.data[a]=(v&31)*255/31;pair.data[a+1]=(v>>5&31)*255/31;pair.data[a+2]=(v>>10&31)*255/31;}
      pair.data[a+3]=255;
      pair.data[b]=best.img[i*3];pair.data[b+1]=best.img[i*3+1];pair.data[b+2]=best.img[i*3+2];pair.data[b+3]=255;
    }
    writeFileSync(join(dir,c.name+'-compare.png'),writePng(pair));
  }
  writeFileSync(join(dir,'comparison.json'),JSON.stringify(reports,null,2));
  return out;
}
