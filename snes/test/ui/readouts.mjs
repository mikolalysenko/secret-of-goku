// Browser-scouter projection vs the PPU's actual OBJ tiles and palettes.
// The same imported frame supplies actors and all powerLevel() inputs.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {powerLevel,formatPower} from '../../../engine/scouter.js';
import {PNG} from 'pngjs';
const src=readFileSync(new URL('../../../engine/scouter.js',import.meta.url),'utf8');
const font=Function(`return ({${src.match(/const font=\{([\s\S]*?)\n\};/)[1]}})`)();
const constants=src.match(/const lifetime=(\d+),green=([^,]+),shadow=([^;]+);/);
const green=Function(`return (${constants[2]})`)(),shadow=Function(`return (${constants[3]})`)();
const signed=n=>n&32768?n-65536:n;
export function reference(q,{shown=false}={}) {
  const pixels=new Uint16Array(256*224),layers=[];
  if(!(q.sc&4))return {pixels,layers};
  const mod={options:{superSaiyan:q.superSaiyan},charging:q.charging,charge:q.charge,equipment:{powerScale:q.weighted?.9:1},read16:()=>q.map??0,challenge:{status:{fed:q.fed}},frieza:{trial:q.trial}};
  const put=(x,y,c)=>{if(x>=0&&x<256&&y>=0&&y<224&&(!q.radio||y>=72))pixels[y*256+x]=c+1;};
  for(const e of q.actors){const x=signed(e.screenX),y=signed(e.screenY),age=e.age&32767;
    if(!e.active||!e.hp||e.species===85||(e.index>=3&&e.species>=128)||x<=-16||x>=272||y<=-16||y>=240||e.age===65535||age<24&&age%8<4)continue;
    const number=shown&&e.index===0&&q.shownValue!==undefined?q.shownValue:powerLevel(mod,e),text=formatPower(number),pts=[];
    for(const [cx,cy,dx,dy] of [[x-12,y-28,1,1],[x+12,y-28,-1,1],[x-12,y+2,1,-1],[x+12,y+2,-1,-1]])for(let j=0;j<4;j++){put(cx+dx*j,cy,green);put(cx,cy+dy*j,green);}
    [...text].forEach((c,i)=>font[c].forEach((row,yy)=>[...row].forEach((b,xx)=>{if(b==='1')pts.push([x-((text.length*4-1)>>1)+i*4+xx,y-40+yy]);})));
    for(const [xx,yy] of pts)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!pixels[(yy+dy)*256+xx+dx])put(xx+dx,yy+dy,shadow);
    for(const [xx,yy] of pts)put(xx,yy,green);
    layers.push({index:e.index,text});
  }
  return {pixels,layers};
}
export function compareReadouts(dir,name,q,{shown=false}={}){
  const o=readFileSync(join(dir,name+'-oam.bin')),v=readFileSync(join(dir,name+'-vram.bin')),c=readFileSync(join(dir,name+'-cgram.bin'));
  const got=new Uint16Array(256*224),sprites=[],leased=new Set((q.cells??[]).filter(e=>e.key>=0x8000&&e.key<0xfffe).map(e=>e.tile));
  const counts=new Uint8Array(224),slivers=new Uint8Array(224);
  for(let order=127;order>=0;order--){const i=(order+(q.first??0))&127,at=i*4,hi=o[512+(i>>2)]>>((i&3)*2)&3,x=o[at]-(hi&1?256:0),y=o[at+1]>=224?o[at+1]-256:o[at+1],attr=o[at+3],tile=o[at+2]|(attr&1)<<8,pal=attr>>1&7,size=hi&2?32:16;
    if(x+size<=0||x>=256||y+size<=0||y>=224)continue;
    for(let yy=Math.max(0,y);yy<Math.min(224,y+size);yy++){counts[yy]++;slivers[yy]+=size/8;}
    if(!leased.has(tile)||pal!==((q.pal>>9)&7))continue;
    // FX cells never use 14/15 in a palette shared with the scouter.
    const image=new Uint16Array(size*size);let opaque=0;
    for(let yy=0;yy<size;yy++)for(let xx=0;xx<size;xx++){
      const px=attr&64?size-1-xx:xx,py=attr&128?size-1-yy:yy,t=(tile&256)|((tile+(px>>3)+(py>>3)*16)&255),off=0xc000+t*32+(py&7)*2,bit=7-(px&7);
      const idx=(v[off]>>bit&1)|(v[off+1]>>bit&1)<<1|(v[off+16]>>bit&1)<<2|(v[off+17]>>bit&1)<<3;
      if(idx<14)continue;
      const color=c.readUInt16LE((128+pal*16+idx)*2)+1;
      image[yy*size+xx]=color;opaque++;
      if(x+xx>=0&&x+xx<256&&y+yy>=0&&y+yy<224)got[(y+yy)*256+x+xx]=color;
    }
    if(opaque)sprites.push({i,x,y,tile,pal,image:[...image]});
  }
  const ref=reference(q,{shown}),bad=[],missing=[],extra=[];
  for(let p=0;p<got.length;p++)if(got[p]!==ref.pixels[p]){bad.push(p);if(!got[p])missing.push(p);else if(!ref.pixels[p])extra.push(p);}
  let overlaps=0;const singles=q.actors.map(e=>reference({...q,actors:[e]},{shown}).pixels);
  for(const p of bad)if(ref.pixels[p]===green+1&&got[p]===shadow+1&&singles.some(a=>a[p]===green+1)&&singles.some(a=>a[p]===shadow+1))overlaps++;
  const png=new PNG({width:512,height:224});for(let y=0;y<224;y++)for(let x=0;x<512;x++){
    const val=(x<256?ref.pixels:got)[y*256+(x&255)],rgb=val?val-1:0,at=(y*512+x)*4;
    png.data[at]=(rgb&31)*255/31;png.data[at+1]=(rgb>>5&31)*255/31;png.data[at+2]=(rgb>>10&31)*255/31;png.data[at+3]=255;
  }writeFileSync(join(dir,name+'-compare.png'),PNG.sync.write(png));
  return {mismatches:bad.length,overlaps,missing:missing.length,extra:extra.length,samples:bad.slice(0,8).map(p=>[p%256,Math.floor(p/256),ref.pixels[p],got[p]]),sprites:sprites.length,layers:ref.layers,maxSprites:Math.max(...counts),maxSlivers:Math.max(...slivers)};
}
