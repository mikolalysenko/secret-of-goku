// Screenshot and state comparison helpers for snes/test/debug/run.mjs.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const {PNG}=createRequire(resolve(repo,'package.json'))('pngjs');

// The browser reference PNGs show the 256x224 picture scaled into the
// player's canvas (724x633 at 26,23 in the 776x679 element capture).
const REF_BOX={x:26,y:23,w:724,h:633};

// An RGB image (3 bytes per pixel) of the SNES picture at w x h: browser
// references are sampled at each pixel's centre, Mesen captures scaled.
export function snesPixels(path,w=256,h=224){
  const im=PNG.sync.read(readFileSync(path)),out=new Uint8Array(w*h*3);
  const ref=im.width===776&&im.height===679;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sx,sy;
    if(ref){sx=Math.floor(REF_BOX.x+(x+0.5)*REF_BOX.w/w);sy=Math.floor(REF_BOX.y+(y+0.5)*REF_BOX.h/h);}
    else{sx=Math.floor(x*im.width/w);sy=Math.floor(y*im.height/h);}
    const i=(sy*im.width+sx)*4,o=(y*w+x)*3;
    out[o]=im.data[i];out[o+1]=im.data[i+1];out[o+2]=im.data[i+2];
  }
  return out;
}

// Share of pixels whose colours agree within `tolerance` (sum of channel
// differences, 8-bit), and a side-by-side image: reference | cartridge |
// diff. Hi-res captures (Mode 5 menus, 512 wide) compare at 512x448.
export function comparePictures(refPath,ourPath,outPath,tolerance=48){
  if(!existsSync(refPath)||!existsSync(ourPath))return null;
  const hires=PNG.sync.read(readFileSync(ourPath)).width>=512;
  const w=hires?512:256,h=hires?448:224;
  const a=snesPixels(refPath,w,h),b=snesPixels(ourPath,w,h);
  let same=0;
  const sheet=new PNG({width:w*3,height:h});
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const o=(y*w+x)*3,d=Math.abs(a[o]-b[o])+Math.abs(a[o+1]-b[o+1])+Math.abs(a[o+2]-b[o+2]);
    if(d<=tolerance)same++;
    for(let k=0;k<3;k++){
      const put=(px,v)=>{sheet.data[(y*sheet.width+px)*4+k]=v;};
      put(x,a[o+k]);put(w+x,b[o+k]);put(2*w+x,d<=tolerance?(a[o+k]>>2):(k===0?255:0));
    }
    for(const px of[x,w+x,2*w+x])sheet.data[(y*sheet.width+px)*4+3]=255;
  }
  if(outPath)writeFileSync(outPath,PNG.sync.write(sheet));
  return same/(w*h);
}

// Native WRAM of a browser reference snapshot (engine/state.js format).
export function referenceState(dir){
  const path=resolve(dir,'state.json');
  if(!existsSync(path))return null;
  const st=JSON.parse(readFileSync(path,'utf8'));
  const root=st.nodes[st.root.$ref],ram=new Uint8Array(st.nodes[root.props.ram.$ref].values);
  return{ram,goku:st.goku,arrival:st.arrival};
}

const hex=(bytes)=>Array.from(bytes,b=>b.toString(16).toUpperCase().padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g)??[],h=>parseInt(h,16));

// Compare the cartridge's state (preset.lua's `state`) with a reference.
export function compareState(ours,ref){
  const r8=a=>ref.ram[a&0x1ffff],r16=a=>r8(a)|r8(a+1)<<8;
  const diffs=[],note=(k,want,got)=>diffs.push({k,want,got});
  if(ours.map!==r16(0xdc))note('map',r16(0xdc),ours.map);
  // CFF8-CFFF are event scratch counters (inc/dec around cutscenes, shop
  // and inn markers): reported apart, they depend on the capture frame.
  const flags=unhex(ours.flags),flagDiffs=[],scratch=[];
  for(let i=0;i<256;i++)if(flags[i]!==r8(0xcf00+i))(i>=0xf8?scratch:flagDiffs).push(`${i.toString(16).padStart(2,'0')}:${r8(0xcf00+i)}->${flags[i]}`);
  if(flagDiffs.length)note('flags',null,flagDiffs.join(' '));
  if(scratch.length)diffs.push({k:'scratch-flags',want:null,got:scratch.join(' '),transient:true});
  ours.party.forEach((p,i)=>{
    const b=0xe000+i*0x200;
    if(p.active!==(r8(b)&1))note(`party${i}.active`,r8(b)&1,p.active);
    if(p.active&&p.level!==r8(b+0x181))note(`party${i}.level`,r8(b+0x181),p.level);
    if(p.active){
      if(p.hp!==r16(b+0x182)||p.maxhp!==r16(b+0x184))note(`party${i}.hp`,`${r16(b+0x182)}/${r16(b+0x184)}`,`${p.hp}/${p.maxhp}`);
      if(Math.abs(p.x-r16(b+2))>16||Math.abs(p.y-r16(b+4))>16)note(`party${i}.pos`,`${r16(b+2)},${r16(b+4)}`,`${p.x},${p.y}`);
    }
  });
  const items=hex(ref.ram.slice(0xcc48,0xcc48+24));
  if(items!==ours.items)note('items',items,ours.items);
  const names=hex(ref.ram.slice(0xcc00,0xcc30));
  if(names!==ours.names)note('names',names,ours.names);
  // Goku and the Dragon Ball ledger (browser JS state -> cartridge SRAM).
  const persist=unhex(ours.persist);
  const ssj=!!ref.goku?.options?.superSaiyan;
  if(ssj!==!!ours.goku_form)note('form',ssj?'super':'base',ours.goku_form?'super':'base');
  const arrived=ref.arrival?.phase==='complete';
  if(arrived!==!!persist[1])note('goku_active',arrived,!!persist[1]);
  const q=ref.goku?.quest;
  if(q&&(persist[0x40]&&(q.mask!==persist[0x41]||q.seedMask!==persist[0x42]||!!q.wished!==!!persist[0x44])))
    note('ledger',`${q.mask}/${q.seedMask}/${q.wished}`,`${persist[0x41]}/${persist[0x42]}/${!!persist[0x44]}`);
  return diffs;
}
