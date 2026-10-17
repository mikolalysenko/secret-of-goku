#!/usr/bin/env node
// Side-by-side sheets: Mesen screenshots of the cartridge next to the
// browser mod's frames for the same state and input, cropped around Goku.
//   node snes/test/goku/compare.mjs <mesenDir> <jsDir> <out.png> [--scale=3]
// Each row: cartridge crop | browser crop | difference mask, plus a count of
// differing pixels in the 48x56 window (palette quantisation shows as small
// colour shifts; pose or position errors show as large ones).
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {readPng,writePng,blank} from '../../tools/gfx.mjs';
const [mesenDir,jsDir,out]=process.argv.slice(2);
const scale=Number(process.argv.find(a=>a.startsWith('--scale='))?.slice(8)??3);
const mres=JSON.parse(readFileSync(join(mesenDir,'results.json'),'utf8'));
const jlog=JSON.parse(readFileSync(join(jsDir,'js.json'),'utf8'));
const shots=mres.shots??[];
const W=48,H=56,n=Math.min(shots.length,jlog.length);
const sheet=blank((W*3+8)*scale,(H+2)*scale*n);
const put=(img,x,y,r,g,b)=>{const i=(y*img.width+x)*4;img.data[i]=r;img.data[i+1]=g;img.data[i+2]=b;img.data[i+3]=255;};
const rows=[];
for(let k=0;k<n;k++){
  const m=readPng(join(mesenDir,shots[k].name+'.png'));
  const j=readPng(join(jsDir,jlog[k].name+'.png'));
  // one window for both pictures, centred on the cartridge's hero (the two
  // cores can be a frame apart in movement: compare poses, not pixels)
  const mx=shots[k].sx-24,my=shots[k].sy-44,jx=mx,jy=my;
  let diff=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const ax=mx+x,ay=my+y,bx=jx+x,by=jy+y;
    if(ax<0||ay<0||ax>=256||ay>=224||bx<0||by<0||bx>=256||by>=224)continue;
    const a=(ay*256+ax)*4,b=(by*256+bx)*4;
    const dm=Math.abs(m.data[a]-j.data[b])+Math.abs(m.data[a+1]-j.data[b+1])+Math.abs(m.data[a+2]-j.data[b+2]);
    if(dm>48)diff++;
    for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++){
      const oy=(k*(H+2)+y)*scale+yy;
      put(sheet,x*scale+xx,oy,m.data[a],m.data[a+1],m.data[a+2]);
      put(sheet,(W+4+x)*scale+xx,oy,j.data[b],j.data[b+1],j.data[b+2]);
      const v=dm>48?255:0;put(sheet,(2*W+8+x)*scale+xx,oy,v,v>>1,0);
    }
  }
  const sheets=['goku','ssj','ssjJab'],s=shots[k],jp=jlog[k].sprite;
  const pose=s.sheet!==undefined?`${sheets[s.sheet]}:${s.col}:${s.row}`:'?';
  const jsPose=jp?`${jp.sheet}:${jp.column}:${jp.row}`:'-';
  rows.push({k,mesen:s.name,js:jlog[k].name,diff,cell:s.cell,pose,jsPose,jsKind:jp?.kind,same:pose===jsPose});
}
writeFileSync(out,writePng(sheet));
writeFileSync(out.replace(/\.png$/,'.json'),JSON.stringify(rows,null,1));
console.log(rows.map(r=>`${r.mesen.padEnd(16)} ${r.pose.padEnd(12)} ${r.jsPose.padEnd(12)} ${r.same?'same':'DIFF'} ${String(r.diff).padStart(4)} px ${r.jsKind??''}`).join('\n'));
const same=rows.filter(r=>r.same).length;
console.log(`poses equal in ${same}/${rows.length} samples`);
