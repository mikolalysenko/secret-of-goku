#!/usr/bin/env node
// Vegeta module tests (Joch's trial in the Time Chamber), in Mesen.
//   SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/vegeta/run.mjs [case ...]
// Imports browser-mod states (.local/snes-import, shared by worktrees) and
// compares against the generator's outputs (dist/snes/gen/vegeta/), which are
// computed from the browser modules themselves. Outputs go to
// .local/snes-test/vegeta/<case>/.
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {readPng,writePng,blank} from '../../tools/gfx.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..','..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const gen=resolve(repo,'dist/snes/gen/vegeta');
function sharedLocal(sub){
  const local=resolve(repo,'.local',sub);
  if(existsSync(local))return local;
  const r=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'});
  return r.status===0?resolve(r.stdout.trim(),'..','.local',sub):local;
}
const imports=process.env.SNES_IMPORT?resolve(process.env.SNES_IMPORT):sharedLocal('snes-import');
const checkpoints=process.env.SNES_CHECKPOINTS?resolve(process.env.SNES_CHECKPOINTS):sharedLocal('snes-checkpoints');
const outRoot=resolve(repo,'.local/snes-test/vegeta');
const only=process.argv.slice(2);
const lib=readFileSync(join(here,'lib.lua'),'utf8');

async function mesen(name,lua,{state=join(checkpoints,'waterfall.mss')}={}){
  const test=`V_IMPORT_DIR=${JSON.stringify(imports)}\n${lib}\n${readFileSync(join(here,lua),'utf8')}`;
  const r=await runMesen({rom,test,outDir:join(outRoot,name),state});
  if(r.code!==0||!r.results||r.results.error)throw Error(`${name}: Mesen failed (${r.code}) ${r.results?.error??r.output.slice(-2000)}`);
  return r;
}
const word=(b,a)=>b[a]|b[a+1]<<8;
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

// Expected screen of BG2 at a camera from the generator's preview (the
// cartridge's own quantised picture) and from the browser picture (shifted
// one row, see snes/gen/vegeta.mjs).
let previews=null;
function loadPreviews(){
  previews??={native:readPng(join(gen,'preview-chamber.png')),browser:readPng(join(gen,'preview-chamber-browser.png'))};
  return previews;
}
function compareView(shotPath,cam,hero,diffPath){
  const shot=readPng(shotPath),{native,browser}=loadPreviews();
  const sx=shot.width/256,sy=shot.height/224;
  let n=0,exact=0,bn=0,bexact=0,floor=0,floorExact=0;
  const out=blank(256,224);
  const floorColors=new Set();
  for(const c of[[30,30,31],[28,29,30],[23,25,28]])floorColors.add(c.join());
  const hx=hero[0]-cam[0],hy=hero[1]-cam[1];
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){
    if(y>=186)continue;                                   // HUD
    if(x>=hx-24&&x<hx+24&&y>=hy-48&&y<hy+12)continue;     // Goku and his shadow
    const s=((Math.floor(y*sy))*shot.width+Math.floor(x*sx))*4;
    const p=[shot.data[s]>>3,shot.data[s+1]>>3,shot.data[s+2]>>3];
    const wx=cam[0]+x,wy=cam[1]+y+1;                     // native BG row (VOFS + 1)
    const r=(wy*native.width+wx)*4,q=[native.data[r]>>3,native.data[r+1]>>3,native.data[r+2]>>3];
    const br=((wy-1)*browser.width+wx)*4,bq=[browser.data[br]>>3,browser.data[br+1]>>3,browser.data[br+2]>>3];
    n++;const ok=eq(p,q);if(ok)exact++;
    bn++;if(eq(p,bq))bexact++;
    if(floorColors.has(bq.join())){floor++;if(eq(p,bq))floorExact++;}
    const o=(y*256+x)*4;out.data[o]=ok?0:255;out.data[o+1]=ok?shot.data[s+1]>>1:0;out.data[o+3]=255;
  }
  if(diffPath)writeFileSync(diffPath,writePng(out));
  return {pixels:n,native:+(exact/n).toFixed(4),browser:+(bexact/bn).toFixed(4),floor:+(floorExact/Math.max(1,floor)).toFixed(4)};
}

const cases={
  async chamber(){
    const r=await mesen('chamber','chamber.lua');
    const res=r.results,dir=r.outDir,fails=[];
    if(!res.loaded)fails.push('map 72 did not load at 64x64');
    const vram=readFileSync(join(dir,'vram.bin')),cgram=readFileSync(join(dir,'cgram.bin')),wram=readFileSync(join(dir,'wram.bin'));
    const tiles=readFileSync(join(gen,'chamber_tiles.bin')),pal=readFileSync(join(gen,'chamber_pal.bin'));
    const meta=readFileSync(join(gen,'chamber_meta.bin')),grid=readFileSync(join(gen,'chamber_grid.bin'));
    if(!vram.subarray(0,tiles.length).equals(tiles))fails.push('BG tiles in VRAM differ from chamber_tiles.bin');
    if(!cgram.subarray(64,64+pal.length).equals(pal))fails.push('CGRAM 32-127 differ from chamber_pal.bin');
    for(const id of[70,11])if(!wram.subarray(0x1c000+id*8,0x1c000+id*8+8).every(b=>b===0))fails.push(`BG1 metatile ${id} is not transparent`);
    if(!wram.subarray(0x1c808,0x1c808+meta.length).equals(meta))fails.push('BG2 metatiles differ from chamber_meta.bin');
    let gridOk=true;for(let y=0;y<64;y++)if(!wram.subarray(0x14000+y*128,0x14000+y*128+64).equals(grid.subarray(y*64,y*64+64)))gridOk=false;
    if(!gridOk)fails.push('BG2 grid differs from chamber_grid.bin');
    // The browser layout on BG1 (collision): 70 floor, 11 walls.
    const layout=(await import(join(repo,'engine/time-chamber.js'))).chamberLayout();
    let bg1=true;for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(wram[0x10000+y*128+x]!==layout[y*64+x])bg1=false;
    if(!bg1)fails.push('BG1 grid differs from chamberLayout()');
    const views={};
    for(const v of['view0','view1','view2','view3']){
      const info=res[v];if(!info){fails.push(`${v} missing`);continue;}
      views[v]={...info,...compareView(join(dir,v+'.png'),info.camera,info.hero,join(dir,v+'-diff.png'))};
      if(views[v].native<0.995)fails.push(`${v}: BG matches the cartridge picture on only ${views[v].native}`);
      if(views[v].floor<0.999)fails.push(`${v}: floor/seam/border match the browser on only ${views[v].floor}`);
    }
    // Collision: the steps end at the pavilion's front wall (row 20 is solid
    // for columns 28-35); the border stops Goku before x = 992.
    const [,,nx,ny]=res.north??[];
    if(!(ny>=21*16))fails.push(`walked into the pavilion: y ${ny}`);
    const [ex]=res.east??[];
    if(!(ex<62*16&&ex>800))fails.push(`east border: x ${ex}`);
    return {fails,info:{views,north:res.north,east:res.east}};
  },
};

let failed=0;
for(const [name,fn] of Object.entries(cases)){
  if(only.length&&!only.includes(name))continue;
  const t0=Date.now();
  try{
    const {fails,info}=await fn();
    mkdirSync(join(outRoot,name),{recursive:true});
    writeFileSync(join(outRoot,name,'summary.json'),JSON.stringify({fails,info},null,1));
    console.log(`${fails.length?'FAIL':'pass'} ${name} (${((Date.now()-t0)/1000).toFixed(1)} s) ${JSON.stringify(info)}`);
    for(const f of fails)console.log('   - '+f);
    if(fails.length)failed++;
  }catch(e){failed++;console.log(`FAIL ${name}: ${e.message}`);}
}
process.exit(failed?1:0);
