// Compares a Mesen screenshot of the telepathy window with the browser mod's
// own rendering (engine/native-radio.js radioPixels) of the same text.
//   compareRadio({png, text, rom, x, y}) -> {opaque, mismatches, samples}
// Only pixels radioPixels() draws are compared (the dither's holes show the
// game behind the window); RGB555 is expanded as Mesen does (c<<3 | c>>2).
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const require=createRequire(import.meta.url);
const {PNG}=require('pngjs');

export function loadPng(path){
  const png=PNG.sync.read(readFileSync(path));
  return {width:png.width,height:png.height,data:png.data};
}
export const rgb=c=>{const e=v=>(v<<3)|(v>>2);return [e(c&31),e(c>>5&31),e(c>>10&31)];};

export async function radioReference(text){
  const {radioPixels}=await import(pathToFileURL(resolve(repo,'engine/native-radio.js')).href);
  let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  if(rom.length%0x8000===512)rom=rom.slice(512);
  return radioPixels(rom,text);
}

// Screen x/y of the window's top-left corner (8,8 on the ground).
export async function compareRadio({png,text,x=8,y=8}){
  const ref=await radioReference(text);
  const img=typeof png==='string'?loadPng(png):png;
  // Mesen screenshots may be 256 wide (or 512 in hi-res); scale x.
  const sx=img.width/256,sy=Math.round(img.height/224)||1;
  let opaque=0,mismatches=0;const samples=[];
  for(let py=0;py<64;py++)for(let px=0;px<240;px++){
    const v=ref[py*240+px];if(!v)continue;opaque++;
    const want=rgb(v-1);
    const at=((y+py)*sy*img.width+Math.floor((x+px)*sx))*4;
    const got=[img.data[at],img.data[at+1],img.data[at+2]];
    if(got[0]!==want[0]||got[1]!==want[1]||got[2]!==want[2]){mismatches++;if(samples.length<8)samples.push({x:px,y:py,want,got});}
  }
  return {opaque,mismatches,samples};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [png,text,x,y]=process.argv.slice(2);
  const r=await compareRadio({png,text:JSON.parse(`"${text}"`),x:Number(x??8),y:Number(y??8)});
  console.log(JSON.stringify(r));
}
