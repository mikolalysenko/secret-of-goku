// Storage proof, conservative call-site audit and optional Mesen command trace.
// Absence from a finite trace is NOT proof that a retail effect is unused.
// node snes/test/audio/audit.mjs [--trace] [--before=baseline.sfc]
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {loadRom,driverChunks,romSong} from './apu.mjs';
import {parseEvent} from '../../../engine/event-codec.js';
import {SHARED_TRACKS,sharedPatches,residentLayout,EFFECT_ROM} from '../../gen/audio-resident-storage.mjs';
import {RESIDENT} from '../../gen/audio-resident.mjs';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';

const root=resolve(import.meta.dirname,'../../..'),out=join(root,'.local/snes-test/audio/audit');
export function songNoise(rom){
  const ram=new Uint8Array(65536);for(const c of driverChunks(rom))ram.set(c.bytes,c.addr);
  const songs=[];
  for(let id=0;id<64;id++){
    const {blob}=romSong(rom,id),word=a=>blob[a]|blob[a+1]<<8;
    const delta=20-word(0),none=word(18),todo=[],seen=new Set(),noise=[];
    for(let v=0;v<8;v++)if(word(2+v*2)!==none)todo.push(word(2+v*2)+delta);
    while(todo.length){
      let p=todo.pop();
      while(p>=20&&p<blob.length&&!seen.has(p)){
        seen.add(p);const op=blob[p],n=op<0xD2?1:1+ram[0x1484+op-0xD2];
        if(op===0xDD||op===0xDE)noise.push({offset:p,op,frequency:op===0xDD?blob[p+1]:null});
        if([0xF9,0xFA,0xFB].includes(op))todo.push(word(p+1+(op===0xF9?1:0))+delta);
        if(op===0xFA||op===0xF2)break;p+=n;
      }
    }
    songs.push({id,commands:seen.size,noise});
  }
  return songs;
}
export function staticAudit(rom=loadRom()){
  const events=[];
  for(let id=0;id<0x800;id++)for(const op of parseEvent(rom,id).ops)
    if(op.op===0x40&&op.bytes[1]===2)events.push({id,at:op.at,effect:op.bytes[2]});
  // Native callers can compute ids from combat/animation data. Record every
  // long dispatcher call and every plausible command literal, conservatively
  // including data. This deliberately cannot certify an unused retail id.
  const calls=[],literals=[];
  for(let p=0;p<rom.length-4;p++){
    if(rom[p]===0x22&&rom[p+1]===4&&rom[p+2]===0&&rom[p+3]===0xC3)calls.push(p);
    if(rom[p]===2&&rom[p+1]<0xDC&&[0,15].includes(rom[p+2])&&[0,0x80,0x88].includes(rom[p+3]))literals.push({at:p,effect:rom[p+1]});
  }
  return {events,calls,literals,songs:songNoise(rom),shared:SHARED_TRACKS,pointers:sharedPatches(rom),
    layout:residentLayout(rom,RESIDENT),retiredEffects:[],
    conclusion:'No retail id is retired. Only byte-identical tracks are shared; finite traces do not prove unreachability.'};
}
export function compareRuntime(beforePath,afterPath){
  const before=readFileSync(beforePath),after=readFileSync(afterPath);
  const symbols=readFileSync(afterPath.replace(/\.sfc$/,'.sym'),'utf8');
  const address=name=>{
    const m=symbols.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${name}$`,'mi'));
    if(!m)throw Error(`missing symbol ${name}`);
    return parseInt(m[1]+m[2],16)&0x3FFFFF;
  };
  if(before.length!==after.length)throw Error('runtime comparison needs matching ROM sizes');
  const map=address('audio_native_ids'),end=address('audio_native_priority');
  let changed=0;
  for(let i=0;i<after.length;i++)if(before[i]!==after[i]){
    const p=i&0x3FFFFF;changed++;
    if((p>=EFFECT_ROM&&p<EFFECT_ROM+0x1C00)||(p>=map&&p<end)||(p>=0xFFDC&&p<0xFFE0))continue;
    throw Error(`unexpected runtime change at ROM $${i.toString(16)}`);
  }
  return {changedBytes:changed,allowed:['resident effect block','cue-id lookup','checksums and ExHiROM mirrors'],changedInstructions:0};
}
async function trace(){
  const imports=join(root,'.local/snes-import');
  const scenes=readdirSync(imports).filter(n=>n.startsWith('preset__')&&existsSync(join(imports,n,'wram.bin')));
  if(!scenes.length)throw Error('no debug preset import bundles');
  const source=process.env.SNES_ROM??join(root,'dist/snes/secret-of-goku.sfc'),rom=privateRom(source,'audio-audit');
  const lua=`SCENES={${scenes.map(n=>`{${JSON.stringify(n)},${JSON.stringify(join(imports,n))}}`).join(',')}}
function test()
  local commands,coverage={},{}
  local scene='preset__title'
  emu.addMemoryCallback(function()
    if H.r8(0x7E1E00)==2 then
      commands[#commands+1]={scene=scene,frame=H.frame,id=H.r8(0x7E1E01),p2=H.r8(0x7E1E02),p3=H.r8(0x7E1E03)}
    end
  end,emu.callbackType.exec,0xC30160,0xC30160)
  H.wait(1200)
  coverage[#coverage+1]={scene=scene,frames=1200}
  scene='long-play';H.load(${JSON.stringify(join(checkpointDir(),'waterfall.mss'))});H.wait(5)
  assert(H.importSnesJs(${JSON.stringify(join(imports,'animation-audit__native__rabite-field-a'))}))
  H.w8(0x316001,1);H.wait(45)
  -- Two minutes of actual input: ground combat, charge, teleport and flight.
  local playStart=H.frame
  for cycle=1,24 do
    H.hold('b',60);H.hold('y',60);H.hold('l y',60);H.wait(30)
    H.hold('l b',2);H.wait(28);H.hold('a right',8);H.wait(22);H.hold('a left',8);H.wait(22)
  end
  coverage[#coverage+1]={scene=scene,frames=H.frame-playStart}
  for _,s in ipairs(SCENES) do
    scene=s[1];local first=H.frame
    H.load(${JSON.stringify(join(checkpointDir(),'waterfall.mss'))});H.wait(5)
    assert(H.importSnesJs(s[2]),scene);H.w8(0x316001,1)
    H.wait(180);H.hold('b',120);H.hold('y',120);H.hold('l y',90);H.wait(90)
    coverage[#coverage+1]={scene=scene,frames=H.frame-first}
  end
  H.result('commands',commands);H.result('coverage',coverage)
end`;
  try{
    const r=await runMesen({rom,test:lua,outDir:join(out,'trace'),timeoutMs:600000});
    if(r.code!==0||!r.results||r.results.error)throw Error(JSON.stringify(r.results??r.output));
    console.log(`Traced ${r.results.commands.length} effect commands across ${r.results.coverage.length} sessions`);
  }finally{cleanupRom(rom);}
}
if(process.argv[1]===import.meta.filename){
  mkdirSync(out,{recursive:true});const result=staticAudit();
  const built=readFileSync(process.env.SNES_ROM??join(root,'dist/snes/secret-of-goku.sfc'));
  result.shippingSongs=songNoise(built);
  const before=process.argv.find(a=>a.startsWith('--before='))?.slice(9);
  if(before)result.runtime=compareRuntime(before,process.env.SNES_ROM??join(root,'dist/snes/secret-of-goku.sfc'));
  writeFileSync(join(out,'static.json'),JSON.stringify(result,null,1));
  console.log(`${result.events.length} event commands, ${result.calls.length} native JSL callers, ${result.literals.length} conservative literals; no retail ids retired`);
  console.log(`Noise songs: retail ${result.songs.filter(s=>s.noise.length).length}/64; shipping ${result.shippingSongs.filter(s=>s.noise.length).length}/64`);
  console.log(`Storage ${result.layout.used}/${result.layout.capacity}; ${result.pointers.length} redirected retail track pointers`);
  if(process.argv.includes('--trace'))await trace();
}
