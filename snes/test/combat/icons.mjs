import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
import {renderJsRef,BUTTONS as B} from '../goku/jsref.mjs';
import {readPng,writePng,blank} from '../../tools/gfx.mjs';
import {createNativeSenzu,senzuPixel} from '../../../engine/native-senzu.js';
import {createNativeEquipment,dustPixel} from '../../../engine/native-equipment.js';

function nativeRaster(rom,table,item){
  const word=a=>rom.readUInt16LE(a),record=word(0x18FD60+word(0x18FD60+table*2)+item*2);
  const tile=0x128400+(record&255)*96,palette=0x12C900+(record>>8)*10;
  return Array.from({length:256},(_,i)=>{
    const x=i%16,y=i>>4,t=(y>>3)*2+(x>>3),row=tile+t*24+(y&7)*3,bit=7-(x&7);
    const c=(rom[row]>>bit&1)|(rom[row+1]>>bit&1)<<1|(rom[row+2]>>bit&1)<<2;
    return c===7?0:1+word(palette+(c-1)*2);
  });
}

// Compare native ring screenshots against sprite-layer.js on the same
// imported party state. The five-colour native icon palette preserves the
// Senzu exactly; DUST BAG merges two close highlights (six source colours).
export async function runIcons({romSrc,outRoot,importRoot,cps,state,lib}){
  const out=join(outRoot,'icons'),rom=privateRom(romSrc,'combat-icons');
  const test=`IMPORT_ROOT=${JSON.stringify(importRoot)}\n${lib}\n`+readFileSync(new URL('./icons.lua',import.meta.url),'utf8');
  const r=await runMesen({rom,test,outDir:out,state:join(cps,'waterfall.mss'),exactFrames:true});
  cleanupRom(rom);
  const failures=[...(r.results?.failures??[]),...(r.results?.error?[r.results.error]:[])];
  const original=readFileSync(new URL('../../../rom/secret-of-mana-us.sfc',import.meta.url)),built=readFileSync(romSrc);
  let untouched=0;
  for(const [table,count] of [12,8,8,72,21,21,21].entries())for(let item=0;item<count;item++){
    const pixel=table===0&&item===5?senzuPixel:table===3&&item>=9&&item<18?dustPixel:null;
    const got=nativeRaster(built,table,item),want=pixel?Array.from({length:256},(_,i)=>pixel(i%16,i>>4)):nativeRaster(original,table,item);
    let bad=0;
    for(let i=0;i<256;i++){
      if(!!got[i]!==!!want[i])bad++;
      else if(got[i]&&[0,5,10].some(s=>Math.abs(((got[i]-1)>>s&31)-((want[i]-1)>>s&31))>(pixel===dustPixel?4:0)))bad++;
    }
    if(bad)failures.push(`table ${table} item ${item}: ${bad} native raster pixels differ`);
    if(!pixel)untouched++;
  }
  const shots=r.results?.shots??[];
  if(shots.length!==25)failures.push(`captured ${shots.length}/25 rings`);
  let compared=0,worst=0;
  for(let offset=0;offset<=12;offset++){
    let snes;
    const weapons=offset===12;
    function* steps(){
      yield {frames:12};
      if(weapons){yield {buttons:B.select,frames:4};yield {frames:60};}
      yield {buttons:B.y,frames:4};yield {frames:60};
      for(let i=0;i<4&&snes.ram[0x1809] !== (weapons?3:0);i++){
        yield {buttons:B.up,frames:4};yield {frames:60};
      }
      yield {frames:0,shot:weapons?'weapons':`items-${offset}`};
      if(!weapons){yield {buttons:B.right,frames:4};yield {frames:60,shot:`rotated-${offset}`};}
    }
    const dir=join(out,'browser',String(offset));
    const refs=await renderJsRef({state,outDir:dir,steps:steps(),setup:(s,m)=>{
      snes=s;
      if(!weapons)for(let i=0;i<12;i++)s.ram[0xCC48+i]=0x60|((i+offset)%12);
      else s.ram[0xCC55]&=0x3F;
      m.senzu=createNativeSenzu(s,m);m.senzu.load();
      m.equipment=createNativeEquipment(s,m);m.equipment.load();
      m.itemIconKind=(p,a)=>m.senzu.iconMatches(p,a)?'senzu':null;
      return ()=>({ring:s.ram[0x1809],icons:[...m.spriteLayer.plan.portraits].filter(([,p])=>p.kind==='senzu'||p.kind==='dust').map(([index,p])=>({slot:index/2-18,...p}))});
    }});
    for(const ref of refs){
      const name=ref.name.replace(/^js-\d+_/,''),cart=shots.find(s=>s.name===name);
      if(!cart)continue;
      const js=readPng(join(dir,ref.name+'.png')),ca=readPng(join(out,name+'.png'));
      const pair=blank(512,224);
      for(let y=0;y<224;y++)for(let x=0;x<256;x++)for(let c=0;c<4;c++){
        pair.data[(y*512+x)*4+c]=js.data[(y*256+x)*4+c];
        pair.data[(y*512+x+256)*4+c]=ca.data[(y*256+x)*4+c];
      }
      writeFileSync(join(out,`compare-${name}.png`),writePng(pair));
      if(ref.extra.ring!==cart.ring)failures.push(`${name}: ring differs`);
      if(ref.extra.icons.length!==1)failures.push(`${name}: browser found ${ref.extra.icons.length} target icons`);
      for(const icon of ref.extra.icons){
        const target=cart.icons[icon.slot],pixel=icon.kind==='senzu'?senzuPixel:dustPixel;
        if(!target){failures.push(`${name}: no native slot ${icon.slot}`);continue;}
        if(target.x!==icon.x||target.y!==icon.y)failures.push(`${name}: icon position differs from browser`);
        let bad=0,max=0;
        for(let y=0;y<16;y++)for(let x=0;x<16;x++){
          if(!pixel(x,y))continue; // compare the icon, not the field beneath it
          const a=((target.y+y)*ca.width+target.x+x)*4,b=((icon.y+y)*js.width+icon.x+x)*4;
          const d=Math.max(...[0,1,2].map(c=>Math.abs((ca.data[a+c]>>3)-Math.round(js.data[b+c]/8.2))));
          max=Math.max(max,d);if(d>0)bad++;
        }
        compared++;worst=Math.max(worst,max);
        if(max>(weapons?4:0)||bad>(weapons?20:0))failures.push(`${name}: ${icon.kind} ${bad} pixels differ, max ${max} RGB555 levels`);
      }
    }
  }
  return {ok:r.code===0&&!failures.length,failures,ms:r.ms,note:`${compared} ring icons vs browser; largest colour difference ${worst}/31; ${untouched} other item rasters unchanged`};
}
