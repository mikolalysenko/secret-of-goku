#!/usr/bin/env node
// Title module tests (snes/test/run-all.mjs runner; ROM path in SNES_ROM).
//  1. Title, credit and name editor from power-on, compared pixel for pixel
//     (5-bit channels) with the browser mod's frames rendered by ref.mjs.
//  2. Leaving the title during the extended credit: the file select matches.
//  3. (arrival.lua) the opening through Goku's arrival; see arrival.mjs.
// Outputs: .local/snes-test/title/.
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {referenceFrames,fromSnesJs,fromMesen,diff5,readShot,PAD} from './ref.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const out=resolve(repo,'.local/snes-test/title');mkdirSync(out,{recursive:true});
const only=process.argv.slice(2);
const failures=[];
const check=(ok,msg)=>{console.log(`${ok?'ok  ':'FAIL'} ${msg}`);if(!ok)failures.push(msg);};
const lua=name=>readFileSync(resolve(here,name),'utf8');

// Emulators run the boot a few frames apart; match each Mesen shot against
// reference frames within a window and require an exact picture.
async function compare(shotPath,ref,frame,window=40){
  const m=fromMesen(await readShot(shotPath));
  let best=null;
  for(let d=-window;d<=window;d++){
    const r=ref.frames.get(frame+d);if(!r)continue;
    const dd=diff5(fromSnesJs(r),m);
    if(!best||dd.pixels<best.pixels)best={offset:d,...dd,info:ref.info.get(frame+d)};
  }
  return best;
}

if(!only.length||only.includes('title')){
  const r=await runMesen({rom,test:lua('title.lua'),outDir:resolve(out,'title')});
  check(r.code===0,`title run finished (${r.results?.error??'ok'})`);
  const shots=[700,760,800,940],nameFrame=960+2+180+2+180;
  const capture=new Set();for(const f of [...shots,nameFrame])for(let d=-40;d<=40;d++)capture.add(f+d);
  const ref=await referenceFrames({script:[[960],[2,PAD.start],[180],[2,PAD.b],[180]],capture});
  for(const f of shots){
    const b=await compare(resolve(out,'title',`title-${String(f).padStart(4,'0')}.png`),ref,f);
    check(b&&b.pixels===0,`title frame ${f} matches the browser (offset ${b?.offset}, ${b?.pixels} px differ${b?.first?' first '+JSON.stringify(b.first):''}, credit ${b?.info?.credit})`);
  }
  const n=await compare(resolve(out,'title','name.png'),ref,nameFrame);
  check(n&&n.pixels===0,`name editor shows editable BOY like the browser (offset ${n?.offset}, ${n?.pixels} px differ)`);
  const res=r.results??{};
  check(res.program_patched===true,'title program patches applied');
  check(res.prefilled===true&&res.name_len===3&&res.name_cursor===0x18,`prefill state: length ${res.name_len}, cursor ${res.name_cursor}`);
  check(JSON.stringify(res.hero_name)===JSON.stringify([0x9c,0xa9,0xb3,0,0,0]),`Start commits BOY to the hero slot (${JSON.stringify(res.hero_name)})`);
  check(res.inventory_cc48===0x27,`new game grants the Drum/Fly item (${res.inventory_cc48})`);
}

if(!only.length||only.includes('attract')){
  const r=await runMesen({rom,test:lua('attract.lua'),outDir:resolve(out,'attract')});
  check(r.code===0,'attract run finished');
  const shots=[1040,1060,1100,1700,2200],capture=new Set();for(const f of shots)for(let d=-40;d<=40;d++)capture.add(f+d);
  const ref=await referenceFrames({script:[[2300]],capture});
  for(const f of shots){
    const b=await compare(resolve(out,'attract',`title-${String(f).padStart(4,'0')}.png`),ref,f);
    check(b&&b.pixels===0,`title frame ${f} matches the browser (offset ${b?.offset}, ${b?.pixels} px differ${b?.first?' first '+JSON.stringify(b.first):''}, credit ${b?.info?.credit})`);
  }
}

if(!only.length||only.includes('credit-exit')){
  const r=await runMesen({rom,test:lua('credit-exit.lua'),outDir:resolve(out,'credit-exit')});
  check(r.code===0&&r.results?.credit_row_new===true,'extended credit row in the tilemap buffer at frame 820');
  const f=820+2+240,capture=new Set();for(let d=-40;d<=40;d++)capture.add(f+d);
  const ref=await referenceFrames({script:[[820],[2,PAD.start],[240]],capture});
  const b=await compare(resolve(out,'credit-exit','file-select.png'),ref,f);
  check(b&&b.pixels===0,`file select after leaving the credit matches (offset ${b?.offset}, ${b?.pixels} px differ)`);
}

if((!only.length||only.includes('arrival'))&&existsSync(resolve(here,'arrival.mjs'))){
  const {runArrival}=await import('./arrival.mjs');
  for(const [ok,msg] of await runArrival({rom,out}))check(ok,msg);
}

console.log(failures.length?`title: ${failures.length} failure(s)`:'title: pass');
process.exit(failures.length?1:0);
