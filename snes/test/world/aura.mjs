// Run the real browser sprite layer's world-flight gate, power, ignition,
// colour and drawKiAura path. Compare its raster with decoded PPU OBJ/VRAM,
// on every sampled frame, including intentionally invisible strobe frames.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {decodeEffectFrame} from '../../../engine/native-effects.js';
import {drawKiAura} from '../../../engine/ki-aura.js';
import {blank,writePng} from '../../tools/gfx.mjs';

export function compareAura({repo,outDir,results}) {
  const context={window:{GokuAnimationData:{forms:{
    goku:{sockets:{22:[[0,0],[0,0],[0,0],[23,23]]}},
    ssj:{sockets:{18:[[0,0],[0,0],[0,0],[23,23]]}},
  }}}};
  vm.runInNewContext(readFileSync(join(repo,'engine/sprite-layer.js'),'utf8'),context);
  const rom=readFileSync(join(repo,'rom/secret-of-mana-us.sfc'));
  const manifest=JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8'));
  const effects=Object.fromEntries(['charge-orb','gold-arc'].map(group=>[group,
    manifest.frames.filter(f=>f.group===group).map(f=>{
      const {rgba}=decodeEffectFrame(rom,f);
      return Uint16Array.from({length:256},(_,i)=>rgba[i*4+3]?1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10):0);
    })]));
  const ppu={oam:new Uint16Array(256),highOam:new Uint16Array(16),spriteSizes:Array(16).fill(1),objSize:0,mode:7,
    evaluateSprites(){},getColor(){}};
  for(let i=0;i<256;i+=2)ppu.oam[i]=0xE000;
  ppu.oam[0]=112|(68<<8);ppu.oam[1]=0x3A00; // native flight body anchor
  const mod={nativeFlight:true,gokuActive:true,canAttack:false,read8:()=>0,read16:()=>0,options:{}};
  const layer=new context.window.ManaSpriteLayer({ppu},mod);
  layer.effects=effects;layer.drawKiAura=drawKiAura;
  // Isolate the aura; other art is covered by world sprite/ki/flyby tests.
  layer.blit=()=>{};layer.stamp=()=>{};layer.chargeLightning=()=>{};
  const kinds={21:'transform',22:'revert',24:'focus'};
  const failures=[],counts={};
  const hash=p=>{let h=2166136261;for(const c of p)h=Math.imul(h^c,16777619)>>>0;return h;};
  const png=(name,pixels)=>{
    const img=blank(48,64);
    pixels.forEach((v,i)=>{const c=v-1;if(!v)return;img.data.set([(c&31)*255/31,(c>>5&31)*255/31,(c>>10&31)*255/31,255],i*4);});
    writeFileSync(join(outDir,name+'.png'),writePng(img));
  };
  for(const r of results.rows??[]) {
    Object.assign(mod,{frame:r.clock,charging:r.charging,charge:r.charge,powerCharge:r.power,
      action:kinds[r.act]?{kind:kinds[r.act],age:r.age,duration:r.duration}:null,
      motion:{pose:()=>({bank:r.bank,bob:r.bob,row:3,column:r.form?18:22,sheet:r.form?'ssj':'goku'})}});
    mod.options.superSaiyan=!!r.form;
    layer.prepare();
    const expected=new Uint16Array(48*64),ox=104+r.bank*2,oy=36+r.bob;
    for(let y=0;y<64;y++)for(let x=0;x<48;x++)expected[y*48+x]=layer.surface[(oy+y)*256+ox+x];
    const visible=expected.some(c=>c!==0),c=counts[r.case]??={frames:0,expected:0,drawn:0,mismatches:0};
    c.frames++;if(visible)c.expected++;if(r.count)c.drawn++;
    if(hash(expected)!==r.hash||r.badSize||r.bodyAfter) {
      c.mismatches++;
      failures.push(`${r.case} clock ${r.clock}: pixels ${r.hash}/${hash(expected)}, sprites ${r.count}, size ${r.badSize}, depth ${r.bodyAfter}`);
    }
    if(r.picture) {
      const bytes=readFileSync(join(outDir,r.picture+'.aura'));
      const actual=Uint16Array.from({length:3072},(_,i)=>bytes.readUInt16LE(i*2));
      png(r.picture+'-browser',expected);png(r.picture+'-obj',actual);
    }
  }
  if(!results.rows?.length)failures.push('no aura frames sampled');
  for(const [name,c] of Object.entries(counts)) {
    if(name!=='idle'&&c.expected<(name==='revert-api'?8:20))failures.push(`${name}: insufficient browser-eligible frames`);
    console.log(`   ${name}: ${c.drawn}/${c.expected} aura frames, ${c.mismatches} pixel mismatches`);
  }
  writeFileSync(join(outDir,'comparison.json'),JSON.stringify({counts,failures},null,2)+'\n');
  return failures;
}
