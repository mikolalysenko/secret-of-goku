#!/usr/bin/env node
// Development tool: compares the cartridge's breach planner (debug command 5,
// dry run) with dungeon-geometry.js breach() cell by cell for one beam.
//   node snes/test/destroy/breach-debug.mjs <bundle> <dir> [x y]
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {destroyAbi} from './abi.mjs';
import {createReference,loadRom,facing} from './reference.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const common=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).stdout.trim();
const imports=process.env.SNES_IMPORT??(existsSync(resolve(repo,'.local/snes-import'))?resolve(repo,'.local/snes-import'):resolve(common,'..','.local/snes-import'));
const [bundle,dirArg,xArg,yArg]=process.argv.slice(2);
const dir=Number(dirArg);
const wram=new Uint8Array(readFileSync(join(imports,bundle,'wram.bin')));
const x=xArg?Number(xArg):wram[0xe002]|wram[0xe003]<<8,y=yArg?Number(yArg):wram[0xe004]|wram[0xe005]<<8;
const layer=wram[0xe00b]&0x80?1:0;
const ref=createReference(wram.slice(),loadRom()),g=ref.flight.dungeon,[dx,dy]=facing[dir];
// Band cells of the full beam (native-plants.js beam geometry).
const cells=[];
for(let ty=0;ty<128;ty++)for(let tx=0;tx<128;tx++){
  const ox=tx*16+8-x,oy=ty*16+8-y,along=ox*dx+oy*dy,across=Math.abs(ox*dy-oy*dx);
  const width=80*Math.min(1,(Math.max(0,along)+8)/44);
  if(along>=-8&&along<=648&&across<=width+8)cells.push({tx,ty});
}
const js=new Map();
for(const c of cells){
  const t=g.tile(c.tx,c.ty,layer);if(!t)continue;
  const plan=g.breach(t,{dx,dy});
  const off=layer*0x4000+c.ty*128+c.tx;
  const ordinarySolid=!(t.flags&8)&&!(t.behavior&0xd0)&&t.code===0&&(t.flags&7)===3;
  if(ordinarySolid)js.set(off,plan?{a:plan.ends[0].address-0x10000,b:plan.ends[1].address-0x10000,src:plan.source.address-0x10000,
    cells:plan.cells.map(k=>dx?k.tx:k.ty),edits:plan.edits.map(e=>[e.address-0x10000,e.replacement])}:null);
}
const offs=[...js.keys()];
const abi=destroyAbi();
const W=(name)=>`0x${abi[name].toString(16)}`;
const S=abi.RAM_DESTROY+0x40;     // !d_s
const test=`
function test()
  assert(H.importSnesJs(${JSON.stringify(join(imports,bundle))}), 'import failed')
  H.wait(2)
  H.w16(${W('arg_dir')}, ${dir})
  local out = {}
  for _, off in ipairs({${offs.join(',')}}) do
    local n = H.r16(${W('dbg_n')})
    H.w16(${W('dbg_arg')}, off)
    H.w16(${W('dbg_cmd')}, 5)
    H.waitFor(function() return H.r16(${W('dbg_n')}) ~= n end, 30)
    local r = {off = off, ok = H.r16(${W('dbg_res')}),
      a = H.r16(${S+0x30}), b = H.r16(${S+0x32}), src = H.r16(${S+0x34}), back = H.r16(${S+0x36}),
      n = H.r16(${S+0x38}), fix = H.r16(${S+0x3A}), pos = H.r16(${S+0x3C})}
    local list = {}
    for i = 0, r.n - 1 do list[#list + 1] = H.r8(${abi.DQ+0x740+0xA2} + i) end
    r.list = list
    out[#out + 1] = r
  end
  H.result('plans', out)
end
`;
const m=await runMesen({rom,test:`ABI={}\nSCN={}\n`+test,outDir:resolve(repo,'.local/snes-test/destroy-breach')});
const plans=m.results?.plans??[];
let same=0,diff=0;
for(const p of plans){
  const j=js.get(p.off);
  const mine=p.ok?{a:p.a,b:p.b,src:p.src,cells:p.list}:null;
  const agree=!!j===!!mine&&(!j||j.a===mine.a&&j.b===mine.b&&j.src===mine.src&&JSON.stringify(j.cells)===JSON.stringify(mine.cells));
  if(agree)same++;else{diff++;if(diff<=12)console.log('cell',p.off,'tx',p.off&127,'ty',(p.off>>7)&127,'\n  js  ',JSON.stringify(j),'\n  snes',JSON.stringify(mine),'raw',JSON.stringify(p));}
}
console.log(`cells ${plans.length}: agree ${same}, differ ${diff}`,m.results?.error??'');
