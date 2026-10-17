// Ending module data generator: King Kai's planet, globes, explosion
// fragments, Shenron's vista, wish flight, departure and cards.
// Pictures are produced with the browser engine's own code or the same
// formulas (engine/kai-planet.js, planet-view.js, planet-fragments.js,
// mana-tree-vista.js, wish-flight.js, native-radio.js), then converted to
// SNES tiles. Output: dist/snes/gen/ending/ending_data.asm (+ .bin files).
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gfx,rgb,surfaceToImage,imageToSurface,quantizeSurfaces,objCell,quadCells,reduceBlocks,bgPicture,u16bytes} from './ending-art.mjs';

// A radio-window card (engine/native-radio.js radioPixels) at (x, y) of a
// transparent 256x224 picture, as a single-palette BG with priority set.
function radioCard(rom,radioPixels,text,x0,y0,paletteBase,tileBase){
  const px=radioPixels(rom,text),img=gfx.blank(256,224);
  for(let y=0;y<64;y++)for(let x=0;x<240;x++){
    const c=px[y*240+x];if(!c||y+y0>=224)continue;const v=c-1,d=((y+y0)*256+x+x0)*4;
    img.data[d]=(v&31)*255/31|0;img.data[d+1]=(v>>5&31)*255/31|0;img.data[d+2]=(v>>10&31)*255/31|0;img.data[d+3]=255;
  }
  return bgPicture(img,{maxPalettes:1,paletteBase,tileBase,priority:1});
}

const here=dirname(fileURLToPath(import.meta.url));
const VERSION=3;
// Data banks for the ending (lower halves): its own data bank and the spare
// code banks' lower halves assigned by the integrator.
export const DATA_BANKS=[0xE9,0xEC,0xED,0xEE,0xEF];

const hex=(n,w=2)=>n.toString(16).toUpperCase().padStart(w,'0');

class Out{
  constructor(){this.blobs=[];this.lines=[];}
  blob(name,data){this.blobs.push({name,data:data instanceof Uint8Array?data:new Uint8Array(data)});return name;}
  def(name,value){this.lines.push(`!${name} = ${typeof value==='number'?'$'+hex(value,value>0xffff?6:4):value}`);}
  table(label,kind,values,per=16){
    this.lines.push(`${label}:`);
    for(let i=0;i<values.length;i+=per)this.lines.push(`\t${kind} ${values.slice(i,i+per).map(v=>'$'+hex(v&(kind==='dw'?0xffff:0xff),kind==='dw'?4:2)).join(',')}`);
  }
  raw(text){this.lines.push(text);}
}

async function engine(repo,file){return import(pathToFileURL(join(repo,'engine',file)).href);}

// ---------------------------------------------------------------------------
// King Kai's planet (engine/kai-planet.js createKaiArt + planet-view kaiPlanet)
// Fade curves (shenron-ending dim/brighten, planet-view light): 33 levels of
// 8/256, 32 entries each, applied per colour channel by palette_build.
function fadeTables(o){
  const dark=[],white=[];
  for(let l=0;l<=32;l++)for(let c=0;c<32;c++){const a=l/32;dark.push(Math.round(c*(1-a)));white.push(Math.round(c+(31-c)*a));}
  o.table('ending_fade_dark','db',dark);o.table('ending_fade_white','db',white);
}

async function kaiAssets(o,{rom,repo}){
  const {radioPixels}=await engine(repo,'native-radio.js');
  const {kaiActors}=await engine(repo,'kai-planet.js');
  // Backdrop: canvas drawImage(256x224) without smoothing, fully opaque.
  const backdrop=gfx.resize(gfx.readPng(join(repo,'assets/sprites/kai-planet.png')),256,224);
  for(let i=3;i<backdrop.data.length;i+=4)backdrop.data[i]=255;
  const reduced=reduceBlocks(backdrop,o.kaiTileBudget??740);
  const bg=bgPicture(reduced.img,{maxPalettes:6,paletteBase:1,fit:true});
  o.blob('kai_bg_tiles',bg.tiles);o.blob('kai_bg_map',u16bytes(bg.map));
  o.def('ENDING_KAI_TILES',bg.tileCount);
  o.table('ending_kai_bg_palettes','dw',bg.palettes.flat().map(c=>c&0x7fff));
  o.stats.kai={tiles:bg.tileCount,blocks:reduced.blocks};
  // End cards: radio window at (8,14), BG2 above the map (palette 7). Only
  // one card is resident, right after the map's tiles.
  const cardBase=bg.tileCount;
  for(const [name,text] of [['good','        SECRET OF GOKU\n          THE END'],['bad','         BAD ENDING\n      THE WORLD IS GONE.']]){
    const card=radioCard(rom,radioPixels,text,8,14,7,cardBase);
    o.blob(`kai_card_${name}_tiles`,card.tiles);o.blob(`kai_card_${name}_map`,u16bytes(card.map));
    o.table(`ending_card_${name}_palette`,'dw',card.palettes[0].map(c=>c&0x7fff));
    o.def(`ENDING_CARD_${name.toUpperCase()}_TILES`,card.tileCount);
  }
  o.def('ENDING_CARD_BASE',cardBase);
  // NPC sheet: frames cropped exactly like createKaiArt().
  const sheet=gfx.readPng(join(repo,'assets/sprites/kai-npcs.png'));
  const W=sheet.width,H=sheet.height,pix=imageToSurface(sheet,128);
  const frames=[];
  for(let i=0;i<16;i++){
    const x0=Math.round(i%4*W/4),x1=Math.round((i%4+1)*W/4),y0=Math.round((i>>2)*H/4)+(i>=4&&i<8?32:0),y1=Math.round(((i>>2)+1)*H/4)+(i<4?16:0);
    let x=x1,y=y1,right=x0,bottom=y0;
    for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(pix[yy*W+xx]){x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);}
    frames.push({x,y,w:right-x+1,h:bottom-y+1});
  }
  const scale=[32/Math.max(...frames.slice(0,4).map(f=>f.h)),22/Math.max(...frames.slice(4).map(f=>f.h))];
  const cells=frames.map((f,i)=>{
    const s=scale[i<4?0:1],w=Math.round(f.w*s),h=Math.round(f.h*s),surf=new Uint16Array(32*32);
    // Bottom-centre anchor: put(x-floor(w/2)+xx, y-h+yy). Cell origin = anchor-(16,32).
    const ox=16-Math.floor(w/2),oy=32-h;
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
      const c=pix[(f.y+Math.floor(yy*f.h/h))*W+f.x+Math.floor(xx*f.w/w)];
      if(c&&ox+xx>=0&&ox+xx<32&&oy+yy>=0)surf[(oy+yy)*32+ox+xx]=c;
    }
    return surf;
  });
  const kai=quantizeSurfaces(cells.slice(0,4)),bub=quantizeSurfaces(cells.slice(4));
  // 16 frames x 512 bytes, each as four 16x16 cells (core's field OBJ regions).
  o.blob('kai_npc_cells',concat([...kai.index,...bub.index].map(ix=>quadCells(ix))));
  o.table('ending_kai_npc_palette','dw',kai.palette);
  o.table('ending_bubbles_palette','dw',bub.palette);
  o.def('ENDING_KAI_X',kaiActors.kai.x);o.def('ENDING_KAI_Y',kaiActors.kai.y);
  o.def('ENDING_KAI_GOKU_X',kaiActors.goku.x);o.def('ENDING_KAI_GOKU_Y',kaiActors.goku.y);
  // Teleport-in lines (planet-view kaiPlanet arriving): 9 one-pixel lines in
  // blue[1..3]. Three 16x16 cells, a full-height line at x=0 in colour 1..3.
  const blue=[rgb(4,7,20),rgb(6,17,30),rgb(16,26,31),rgb(31,31,31)];
  const lineCells=[1,2,3].map(c=>{const ix=new Uint8Array(32*32);for(let y=0;y<32;y++)ix[y*32]=c;return quadCells(ix).slice(0,128);});
  o.blob('kai_lines_cells',concat(lineCells));
  o.table('ending_lines_palette','dw',[0,blue[1]-1,blue[2]-1,blue[3]-1,0,0,0,0,0,0,0,0,0,0,0,0]);
  // Line geometry: x, y0, length per line (planet-view kaiPlanet).
  const geo=[];for(let i=0;i<9;i++){const y0=129+i%3*2,y1=163-i%2*4;geo.push(138+i*3,y0,y1-y0+1,i%3);}
  o.table('ending_lines_geometry','db',geo);
  // Bubbles' target sampling (tickKaiScene): angle tables for the lawn
  // radii, sqrt for the uniform-area radius, and the lawn ellipse
  // ((x-128)/56)^2+((y-145)/35)^2<1 as the largest dx^2 per |dy|.
  o.table('ending_cos52','db',Array.from({length:256},(_,a)=>Math.round(Math.cos(a*Math.PI/128)*52)&255));
  o.table('ending_sin31','db',Array.from({length:256},(_,a)=>Math.round(Math.sin(a*Math.PI/128)*31)&255));
  o.table('ending_sqrt8','db',Array.from({length:256},(_,v)=>Math.min(255,Math.round(Math.sqrt((v+.5)/256)*256))));
  o.table('ending_kai_lawn','dw',Array.from({length:35},(_,dy)=>{const limit=3136*(1-dy*dy/1225);let k=0;while((k+1)<limit)k++;return k;}));
}

function concat(list){const n=list.reduce((a,b)=>a+b.length,0),out=new Uint8Array(n);let p=0;for(const b of list){out.set(b,p);p+=b.length;}return out;}

// ---------------------------------------------------------------------------
function pack(o){
  // First fit, largest first, within the lower 32 KiB of each data bank.
  const bins=DATA_BANKS.map(bank=>({bank,used:0,items:[]}));
  const sorted=[...o.blobs].sort((a,b)=>b.data.length-a.data.length);
  for(const b of sorted){
    const bin=bins.find(x=>x.used+b.data.length<=0x8000);
    if(!bin)throw Error(`ending data does not fit: ${b.name} (${b.data.length} bytes)`);
    b.bank=bin.bank;b.offset=bin.used;bin.used+=b.data.length;bin.items.push(b);
  }
  return bins;
}

function inputsHash(repo,rom){
  const h=createHash('sha256');
  h.update(String(VERSION));
  for(const f of ['snes/gen/ending.mjs','snes/gen/ending-art.mjs','snes/tools/gfx.mjs','assets/sprites/kai-planet.png','assets/sprites/kai-npcs.png','engine/kai-planet.js','engine/native-radio.js'])
    h.update(readFileSync(join(repo,f)));
  h.update(rom);
  return h.digest('hex');
}

export async function generate({rom,repo,outDir}){
  const hash=inputsHash(repo,rom),stamp=join(outDir,'stamp.txt');
  if(existsSync(stamp)&&readFileSync(stamp,'utf8')===hash&&existsSync(join(outDir,'ending_data.asm')))return;
  const o=new Out();o.stats={};
  fadeTables(o);
  await kaiAssets(o,{rom,repo});
  const bins=pack(o);
  mkdirSync(outDir,{recursive:true});
  const asm=['; Generated by snes/gen/ending.mjs. Do not edit.'];
  asm.push(...o.lines.filter(l=>l.startsWith('!')));
  for(const b of o.blobs)asm.push(`!ENDING_${b.name.toUpperCase()}_SIZE = $${hex(b.data.length,4)}`);
  asm.push('pushpc');
  for(const bin of bins){
    if(!bin.items.length)continue;
    asm.push(`org $${hex(bin.bank)}0000`);
    for(const b of bin.items){
      writeFileSync(join(outDir,`${b.name}.bin`),b.data);
      asm.push(`ending_${b.name}: incbin "ending/${b.name}.bin"`);
    }
    asm.push(`assert pc() <= $${hex(bin.bank)}8000, "ending data bank ${hex(bin.bank)} overflow"`);
  }
  asm.push('pullpc');
  writeFileSync(join(outDir,'ending_data.asm'),asm.join('\n')+'\n');
  // Tables (palettes, small descriptors) are included in the code bank.
  writeFileSync(join(outDir,'ending_tables.asm'),['; Generated by snes/gen/ending.mjs. Do not edit.',...o.lines.filter(l=>!l.startsWith('!'))].join('\n')+'\n');
  writeFileSync(join(outDir,'stats.json'),JSON.stringify({stats:o.stats,banks:bins.map(b=>({bank:hex(b.bank),used:b.used,items:b.items.map(i=>`${i.name}:${i.data.length}`)}))},null,1));
  writeFileSync(stamp,hash);
}
