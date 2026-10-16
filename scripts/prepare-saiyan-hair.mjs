// Apply generated hair clusters to the existing animation cells. Only the
// original gold-hair pixels change; faces, alpha, bodies and pivots survive.
import {readFileSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {sampleSaiyanHair,superSaiyanHairColors} from '../engine/saiyan-palette.js';
const read=name=>PNG.sync.read(readFileSync(name));
const original=read('assets/source/ssj.png'),art=read('assets/sprites/goku-ssj-hair.png');
const key=(r,g,b)=>(r>>3)|((g>>3)<<5)|((b>>3)<<10);
const hairColors=new Set([[173,123,57],[222,173,99],[255,255,74],[255,255,255],[132,82,24]].map(c=>key(...c)));
const eyes=new Set([[33,99,66],[33,140,90]].map(c=>key(...c)));
const yellow=key(255,255,74),columns=[0,6,18,20];
function mask(image,column,row){
 const color=new Uint16Array(1024),mask=new Uint8Array(1024),eye=[],seeds=[];
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const at=((32+row*32+y)*image.width+column*32+x)*4,c=key(...image.data.subarray(at,at+3));color[y*32+x]=c;
  if(eyes.has(c))eye.push([x,y]);if(c===yellow)seeds.push(y*32+x);
 }
 if(seeds.length<6)return null;
 const face=eye.length?{x0:Math.min(...eye.map(p=>p[0]))-2,x1:Math.max(...eye.map(p=>p[0]))+2,y:Math.min(...eye.map(p=>p[1]))-1}:null;
 const floor=Math.min(28,Math.max(...seeds.map(i=>i>>5))+3),queue=[...seeds];
 for(let n=0;n<queue.length;n++){
  const at=queue[n],x=at%32,y=at>>5;
  if(mask[at]||y>floor||!hairColors.has(color[at])||face&&y>=face.y&&x>=face.x0&&x<=face.x1)continue;
  mask[at]=1;
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(x+dx>=0&&x+dx<32&&y+dy>=0&&y+dy<32)queue.push(at+dx+dy*32);
 }
 const points=[...mask.keys()].filter(i=>mask[i]);if(points.length<20)return null;
 const x0=Math.min(...points.map(i=>i%32)),x1=Math.max(...points.map(i=>i%32)),y0=Math.min(...points.map(i=>i>>5)),y1=Math.max(...points.map(i=>i>>5));
 if(y1-y0>20)return null;
 return{mask,x0,x1,y0,y1,count:points.length};
}
const templates=Array.from({length:4},(_,row)=>columns.map(column=>mask(original,column,row)));
function patch(image,column,row){
 const head=mask(image,column,row);if(!head)return 0;
 const variant=column>=6&&column<=9?1:column===18?2:column===19||column===20?3:0,t=templates[row][variant];
 if(!t)return 0;
 for(let y=head.y0;y<=head.y1;y++)for(let x=head.x0;x<=head.x1;x++){
  if(!head.mask[y*32+x])continue;
  const tx=t.x0+(x-head.x0)*(t.x1-t.x0)/Math.max(1,head.x1-head.x0),ty=t.y0+(y-head.y0)*(t.y1-t.y0)/Math.max(1,head.y1-head.y0);
  const edge=x===0||x===31||y===0||!head.mask[y*32+x-1]||!head.mask[y*32+x+1]||!head.mask[(y-1)*32+x];
  const sampled=sampleSaiyanHair(art,(variant*32+tx+.5)*art.width/128,(row*32+ty+.5)*art.height/128,art.width/128);
  const c=(edge?superSaiyanHairColors[0]:sampled||superSaiyanHairColors[1])-1,at=((32+row*32+y)*image.width+column*32+x)*4;
  image.data[at]=(c&31)*255/31;image.data[at+1]=((c>>5)&31)*255/31;image.data[at+2]=((c>>10)&31)*255/31;
 }
 return head.count;
}
for(const name of['ssj','goku']){
 const image=read(`assets/source/${name}.png`);let count=0,frames=0;
 const transparent=new Set(['42,150,108','52,188,136','35,127,90','71,255,187']);
 for(let i=0;i<image.data.length;i+=4)if(transparent.has([...image.data.subarray(i,i+3)].join(',')))image.data[i+3]=0;
 const selected=name==='ssj'?[...Array.from({length:44*4},(_,i)=>[i>>2,i%4]),[47,0],[48,0],[49,0]]:[[56,0],[57,0],[58,0]];
 for(const[c,r]of selected){const n=patch(image,c,r);count+=n;if(n)frames++;}
 writeFileSync(`assets/sprites/${name}.png`,PNG.sync.write(image));console.log(`${name}: ${frames} hair frames, ${count} gold pixels; original bodies and alpha preserved`);
}
