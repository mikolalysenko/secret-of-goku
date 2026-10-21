// One-frame transients in recorded Frieza scenes (run.mjs, case
// `transients`). The recording holds a screenshot of every frame (exact
// frames) and, per frame, the PPU state the picture was drawn with: OAM,
// the OBJ half of CGRAM and the screen registers. Mesen's screenshot at
// frame N shows the picture drawn with the state recorded at frame N - 1.
//
// A transient pixel differs from both neighbouring pictures by more than 48
// (summed 8-bit RGB) while the neighbours differ from each other by 24 or
// less. Each one is explained or not:
//   screen   the scroll, brightness, colour math, layers or windows changed
//            around it (quake, flash, whiteout, window animation)
//   bg       no sprite covers it in the three frames
//   other    only native or effect sprites cover it (their own suites)
//   motion   Frieza's sprites cover it and moved or changed pose
//   frieza   unexplained on Frieza's sprites: one that stayed in OAM
//            changed colour (a palette or tile change, the lag-palette
//            bug), or one blinked (shown, hidden, shown again: the old
//            afterimage strobe)
// and, independently of the pictures, every Frieza sprite on screen must
// show one of Frieza's palette rows (palette faults).
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';

export const DIFF=48,SAME=24;

// Frieza's OBJ tiles (both buffers, name table 0).
export const isFrieza=s=>s.tile>=0x0C0&&s.tile<0x100;

// Frieza's palette rows in the cartridge under test (frieza_palettes' six
// rows and the two Ball palettes, through its symbols): colours 1-15 each.
export function friezaRows(rom){
  const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8'),bytes=readFileSync(rom);
  const addr=n=>{const m=sym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${n}$`,'mi'));if(!m)throw Error('transients: no symbol '+n);return parseInt(m[1]+m[2],16);};
  const word=a=>{const o=((a>>16)&0x3f)<<16|(a&0xffff);return bytes[o]|bytes[o+1]<<8;};
  const rows=[];
  const take=(label,count)=>{for(let r=0;r<count;r++){const row=[];for(let i=1;i<16;i++)row.push(word(addr(label)+r*32+i*2));rows.push(row);}};
  take('frieza_palettes',6);
  take('frieza_balls_palette',1);
  take('frieza_ball8_palette',1);
  return rows;
}

// OAM entries as recorded ("xxx yy ttt aa s", hex): screen box in picture
// coordinates (a sprite with OAM Y covers picture rows Y..Y+h-1).
export function parseOam(s){
  if(!s)return [];
  return s.split(',').map(h=>{
    let x=parseInt(h.slice(0,3),16);if(x>=256)x-=512;
    let y=parseInt(h.slice(3,5),16);
    const tile=parseInt(h.slice(5,8),16),attr=parseInt(h.slice(8,10),16),size=+h[10]?32:16;
    if(y+size>256)y-=256;else if(y>=224)y=1000;
    return {x,y,tile,attr,size,key:h,pal:(attr>>1)&7};
  });
}
const covers=(s,x,y)=>x>=s.x&&x<s.x+s.size&&y>=s.y&&y<s.y+s.size;

function loadRgb(PNG,path){
  const im=PNG.sync.read(readFileSync(path));
  if(im.width!==256||im.height!==224)throw Error('transients: unexpected picture size '+path);
  return im.data;
}

// dir: recording (tNNNNN.png), meta: per-frame records (meta[i] is frame
// i + 1), rows: friezaRows(). Returns the summary, per-frame entries and
// failures.
export function analyseTransients({repo,dir,meta,rows,first=4,limit=8,sheets=true}){
  const {PNG}=createRequire(join(repo,'package.json'))('pngjs');
  const N=meta.length;
  const pic=t=>join(dir,`t${String(t).padStart(5,'0')}.png`);
  const state=t=>meta[t-2];                           // picture t <- frame t - 1
  const oam=new Map(),oamOf=t=>{if(!oam.has(t))oam.set(t,state(t)?parseOam(state(t).oam):[]);return oam.get(t);};
  const totals={frames:0,pixels:0,screen:0,bg:0,other:0,motion:0,frieza:0,friezaFrames:0};
  const frames=[],failures=[];
  // Death Orbs are continuous, including the warning-to-projectile handoff.
  // The NMI recording latches the client's requests with the uploaded OAM.
  // Allow the first two cold-cache frames (allocation and delayed upload),
  // then require every request, including animation/size changes.
  const orbMisses=[];
  let orbRun=0;
  for(const m of meta){
    orbRun=m.orbs?.length?orbRun+1:0;
    for(const o of m.orbs??[]){
      if(orbRun<=2||o.x<0||o.x>=256||o.y<0||o.y>=224)continue;
      const fx=s=>s.tile>=0x122&&s.tile<=0x13f||s.tile>=0x184&&s.tile<=0x19b||s.tile>=0x1a8&&s.tile<=0x1bf;
      if(!parseOam(m.oam).some(s=>fx(s)&&covers(s,o.x,o.y)))orbMisses.push({picture:m.f+1,...o});
    }
  }
  if(orbMisses.length)failures.push(`${orbMisses.length} missing Death Orb frame(s) (first: picture ${orbMisses[0].picture})`);
  // palette faults: every Frieza sprite of every recorded frame
  const rowKeys=new Set(rows.map(r=>r.join(',')));
  const faults=[];
  for(const m of meta){
    const used=new Set(parseOam(m.oam).filter(isFrieza).map(s=>s.pal));
    for(const p of used){
      const c=[];for(let i=1;i<16;i++){const o=((p*16+i)*2)*2;c.push(parseInt(m.cg.slice(o+2,o+4)+m.cg.slice(o,o+2),16));}
      if(!rowKeys.has(c.join(',')))faults.push({frame:m.f,picture:m.f+1,palette:p,colours:c.map(v=>v.toString(16).padStart(4,'0')).join(' ')});
    }
  }
  if(faults.length)failures.push(`${faults.length} frame(s) show Frieza's sprites in colours that are not his (first: picture ${faults[0].picture}, OBJ palette ${faults[0].palette}: ${faults[0].colours})`);
  const cache=new Map();                              // the last three pictures
  const rgb=t=>{if(!cache.has(t)){cache.set(t,loadRgb(PNG,pic(t)));for(const k of cache.keys())if(k<t-2)cache.delete(k);}return cache.get(t);};
  for(let t=first;t<N;t++){
    if(!existsSync(pic(t-1))||!existsSync(pic(t))||!existsSync(pic(t+1)))continue;
    const a=rgb(t-1),b=rgb(t),c=rgb(t+1);
    const sP=state(t-1),sC=state(t),sN=state(t+1);
    const screen=!sP||!sN||sP.sig!==sC.sig||sC.sig!==sN.sig;
    const oP=oamOf(t-1),oC=oamOf(t),oN=oamOf(t+1),oPP=oamOf(t-2),oNN=oamOf(t+2);
    const keysP=new Set(oP.map(s=>s.key)),keysN=new Set(oN.map(s=>s.key)),keysC=new Set(oC.map(s=>s.key));
    const keysPP=new Set(oPP.map(s=>s.key)),keysNN=new Set(oNN.map(s=>s.key));
    const fzC=oC.filter(isFrieza),fzP=oP.filter(isFrieza),fzN=oN.filter(isFrieza);
    const count={pixels:0,screen:0,bg:0,other:0,motion:0,frieza:0};
    let mask=null,x0=999,y0=999,x1=-1,y1=-1;
    for(let i=0,p=0;i<256*224;i++,p+=4){
      const d1=Math.abs(b[p]-a[p])+Math.abs(b[p+1]-a[p+1])+Math.abs(b[p+2]-a[p+2]);if(d1<=DIFF)continue;
      const d2=Math.abs(b[p]-c[p])+Math.abs(b[p+1]-c[p+1])+Math.abs(b[p+2]-c[p+2]);if(d2<=DIFF)continue;
      const d0=Math.abs(a[p]-c[p])+Math.abs(a[p+1]-c[p+1])+Math.abs(a[p+2]-c[p+2]);if(d0>SAME)continue;
      count.pixels++;
      const x=i&255,y=i>>8;
      if(screen){count.screen++;continue;}
      // another sprite over it appeared, vanished, moved or changed: its own
      // (effects or natives drawn over Frieza's boxes)
      const otherChanged=[oP,oC,oN].some(o=>o.some(s=>!isFrieza(s)&&covers(s,x,y)&&!(keysP.has(s.key)&&keysC.has(s.key)&&keysN.has(s.key))));
      if(otherChanged){count.other++;continue;}
      const onC=fzC.filter(s=>covers(s,x,y)),onP=fzP.filter(s=>covers(s,x,y)),onN=fzN.filter(s=>covers(s,x,y));
      if(onC.length||onP.length||onN.length){
        // every sprite over it unchanged in OAM, yet a different picture:
        // colours or tiles changed
        const over=o=>o.filter(s=>covers(s,x,y)).map(s=>s.key).sort().join(' ');
        const setC=over(oC);
        const content=onC.length>0&&over(oP)===setC&&over(oN)===setC;
        // shown alone (not at t-1 or t+1, again at t-2 or t+2), or missing
        // alone (at t-1 and t+1, not at t)
        const blink=onC.some(s=>!keysP.has(s.key)&&!keysN.has(s.key)&&(keysPP.has(s.key)||keysNN.has(s.key)))
          ||onP.some(s=>keysN.has(s.key)&&!keysC.has(s.key));
        if(content||blink){
          count.frieza++;
          if(!mask)mask=new Uint8Array(256*224);
          mask[i]=1;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
        }else count.motion++;
        continue;
      }
      const any=o=>o.some(s=>covers(s,x,y));
      if(any(oC)||any(oP)||any(oN))count.other++;else count.bg++;
    }
    if(!count.pixels)continue;
    totals.pixels+=count.pixels;for(const k of['screen','bg','other','motion','frieza'])totals[k]+=count[k];
    if(count.pixels>=8)totals.frames++;
    const entry={picture:t,frame:t-1,...count,lag:!!(sP&&sC&&sP.f4===sC.f4),window:!!(sC&&(sC.w&0x20))};
    if(count.frieza)entry.box=[x0,y0,x1,y1];
    frames.push(entry);
    if(count.frieza>limit){
      totals.friezaFrames++;
      if(sheets){
        // previous | this | next | the unexplained pixels in red
        const sheet=new PNG({width:256*4,height:224});
        for(let y=0;y<224;y++)for(let x=0;x<256;x++){
          const i=y*256+x,p=i*4;
          [a,b,c].forEach((src,k)=>{const o=(y*1024+k*256+x)*4;sheet.data[o]=src[p];sheet.data[o+1]=src[p+1];sheet.data[o+2]=src[p+2];sheet.data[o+3]=255;});
          const o=(y*1024+768+x)*4;const hit=mask&&mask[i];
          sheet.data[o]=hit?255:b[p]>>2;sheet.data[o+1]=hit?0:b[p+1]>>2;sheet.data[o+2]=hit?0:b[p+2]>>2;sheet.data[o+3]=255;
        }
        writeFileSync(join(dir,`transient-${String(t).padStart(5,'0')}.png`),PNG.sync.write(sheet));
      }
    }
  }
  const bad=frames.filter(f=>f.frieza>limit);
  if(bad.length)failures.push(`${bad.length} picture(s) with unexplained one-frame transients on Frieza's sprites (first: picture ${bad[0].picture}, ${bad[0].frieza} px at ${bad[0].box.join(',')}${bad[0].lag?', a lag frame':''}${bad[0].window?', window open':''})`);
  return {totals,frames,faults,orbMisses,failures};
}
