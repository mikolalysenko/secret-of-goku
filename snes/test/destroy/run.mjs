#!/usr/bin/env node
// Destroy module regression: imports browser-mod states into Mesen, fires
// attacks through the module's debug trigger and compares the native map
// edits, redraw requests and cut sounds with the JavaScript reference
// (reference.mjs) for the same state. Also checks collision by walking.
//   SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/destroy/run.mjs [scenario ...]
// Outputs (screenshots, grids, results) go to .local/snes-test/destroy/<scenario>/.
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {destroyAbi} from './abi.mjs';
import {createReference,attackProfile,facing,loadRom,beamTimeline,simulateTimeline} from './reference.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
// Import bundles: SNES_IMPORT, this checkout's .local, or the main checkout's
// (git worktrees share it).
function importDir(){
  if(process.env.SNES_IMPORT)return resolve(process.env.SNES_IMPORT);
  const local=resolve(repo,'.local/snes-import');
  if(existsSync(local))return local;
  const r=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'});
  return r.status===0?resolve(r.stdout.trim(),'..','.local/snes-import'):local;
}
const imports=importDir();
const outRoot=resolve(repo,'.local/snes-test/destroy');
const only=process.argv.slice(2);
const abi=destroyAbi();
const cartridge=loadRom();
const KIND={punch:0,ki:1,beam:2,mega:3};

// Scenarios. The attack origin defaults to Goku's position in the bundle.
export const scenarios=[
  {name:'bush-control',bundle:'emulator-probe__main-before-grass',control:true,walk:'right',walkFrames:48,
    note:'Rusty-sword clearing (map 128): walking right is blocked by the bushes'},
  {name:'bush-punch',bundle:'emulator-probe__main-before-grass',attack:{dir:1,kind:'punch'},walk:'right',walkFrames:48,
    expect:{passX:41*16},note:'one punch clears the bush stack (C8 -> 5F) and Goku walks through'},
  {name:'bush-mega',bundle:'emulator-probe__main-before-grass',attack:{dir:1,kind:'mega'},frames:60,
    note:'full Super Saiyan beam across the clearing: every bush in the tapered band'},
  {name:'bush-mega-timeline',timeline:true,bundle:'emulator-probe__main-before-grass',attack:{dir:1,kind:'mega',str:200},frames:60,
    note:'the full beam frame by frame over the clearing: the widening band (side strips) breaks the same bushes'},
  {name:'bush-beam-steps',bundle:'emulator-probe__main-before-grass',attack:{dir:1,kind:'beam',id:7},steps:[32,64,96,128,160,192,224,256,288,320],frames:40,
    note:'a growing beam rescans only new cells and matches the one-shot result'},
  {name:'grass-punch',bundle:'animation-audit__native__rabite-field-b',attack:{dir:0,kind:'punch'},
    note:'tall grass (C1 -> 0) in the Rabite field'},
  {name:'grass-beam',bundle:'animation-audit__native__rabite-field-b',attack:{dir:0,kind:'beam'},frames:40,
    note:'a beam mows a band of tall grass'},
  {name:'vine-control',bundle:'ending-fix__vine',control:true,walk:'right',walkFrames:40,
    note:'Haunted Forest vines block the path'},
  {name:'vine-punch',bundle:'ending-fix__vine',attack:{dir:1,kind:'punch'},walk:'right',walkFrames:40,expect:{passX:12*16},
    note:'Haunted Forest vines (no cut code) become grass 7A; Goku walks through'},
  {name:'bg2-objects',bundle:'juice-research__plants__layer2-before',attack:{dir:3,kind:'punch'},
    note:'multi-stage C2 objects on BG2 (Lost Continent axe room) clear to their final stage'},
  // Dungeon demolition by the full Super Saiyan beam (dungeon-geometry.js).
  // The beams fire at 78% charge (str 200 < 218) so that barrier events,
  // which the browser fires for these beams as well (beam-earth-tile), do not
  // change the map under the comparison; the reference simulates plants only.
  {name:'demo-earth',timeline:true,bundle:'kamehameha-voice__gap-before',attack:{dir:1,kind:'mega',str:200},frames:200,
    note:'Earth Palace (map 313): partitions between floors melt on both layers'},
  {name:'demo-witch',timeline:true,bundle:'power-flight-fixes__native-302',attack:{dir:3,kind:'mega',str:200},frames:200,
    note:"Elinee's castle (map 302)"},
  {name:'demo-wind',timeline:true,bundle:'barrier-audit__bosses__60-0-state',attack:{dir:2,kind:'mega',str:200},frames:200,
    note:'Wind Palace (map 60)'},
  {name:'demo-undine',timeline:true,bundle:'ending-fix__undine-door',attack:{dir:1,kind:'mega',str:200},frames:240,
    note:'Undine cave exterior (map 109, Water Palace family)'},
  {name:'demo-bg2',timeline:true,bundle:'juice-research__plants__layer2-before',attack:{dir:0,kind:'mega',str:200},frames:240,
    note:'Lost Continent axe room (map 432) with Goku on BG2'},
  {name:'demo-ship',timeline:true,bundle:'sandship-wreck__qs-captured',attack:{dir:0,kind:'mega',str:200},frames:240,
    note:'Sandship hold (map 271)'},
  {name:'demo-fortress',timeline:true,bundle:'preset__fortress',attack:{dir:1,kind:'mega',str:200},frames:240,
    note:'Mana Fortress deck (map 255, conditional BG2 pieces)'},
  {name:'demo-pure',timeline:true,bundle:'barrier-audit__tree-continuation-state',attack:{dir:2,kind:'mega',str:200},frames:240,
    note:'Pure Land (map 198, conditional pieces)'},
  {name:'brazier-water',timeline:true,bundle:'barrier-audit__bosses__143-1-state',attack:{dir:1,kind:'mega',str:200},frames:200,fx:2,
    note:'Water Palace (map 139): the full beam shatters three palace braziers (2x3 each) into the pedestal tile'},
  // Gates, switches, orbs: the module dispatches the original (or authored)
  // event; the JavaScript reference must select the same target.
  {name:'gate-forest',type:'event',bundle:'ending-fix__vine',door:0xac,map:29,teleport:[240,338],attack:{dir:3,kind:'punch'},walk:'up',expect:{passYlt:288},
    flag:0x5e,opened:1,note:'Haunted Forest rose gate (map 29): punch -> retail event 1EF'},
  {name:'gate-bridge',type:'event',bundle:'ending-fix__vine',door:0xa9,map:30,teleport:[200,408],attack:{dir:1,kind:'punch'},walk:'right',walkFrames:90,expect:{passX:288},
    flag:0x5f,opened:3,note:'Haunted Forest bridge gate (map 30): punch -> retail event 6DA'},
  {name:'gate-gaia',type:'event',bundle:'tree-presentation__gaia-open',door:0x17,map:73,teleport:[712,975],attack:{dir:0,kind:'beam',str:256,id:12},
    doorBit:0,reload:true,piece:[42,62,4,3],
    note:"Watts's shortcut (map 73): a charged beam breaks the door for good; its entrance piece shows and stays after re-entering (CF14 untouched)"},
  {name:'gate-witch',type:'event',bundle:'readme-variety-probe__castle',door:0xb0,map:300,teleport:[152,360],attack:{dir:3,kind:'beam',str:256,id:9},
    flag:0x17,opened:2,confirm:true,note:"Elinee's castle three-person gate (map 300): charged beam -> authored event 8C"},
  {name:'switch-gaia',type:'event',bundle:'power-flight-fixes__native-285',teleport:[232,120,3],attack:{dir:3,kind:'beam',str:256,id:11},flagsChange:true,
    note:"Gaia's Navel cave switch (map 285, F-tile 1AF -> event 1AC) from a ranged beam"},
  {name:'beam-earth-tile',type:'event',bundle:'kamehameha-voice__gap-before',attack:{dir:1,kind:'mega',id:13},flagsChange:true,
    note:'Earth Palace: the full Super Saiyan beam reaches the hit tile at (28,37) (event 6F2), as in the browser'},
  {name:'beam-earth-timeline',type:'event',timeline:true,bundle:'kamehameha-voice__gap-before',attack:{dir:1,kind:'mega'},flagsChange:true,
    note:'the same target from the frame-by-frame full beam (incremental, widening search)'},
  {name:'orb-earth',type:'event',bundle:'kamehameha-voice__orb-before',orb:0x600,flagsChange:true,
    note:'Earth Palace crystal orb: its own event 239 with spell byte 06 in $E181'},
];

function lua(s){
  const v=x=>typeof x==='string'?JSON.stringify(x):typeof x==='boolean'?String(x):x===undefined||x===null?'nil':Array.isArray(x)?`{${x.map(v).join(',')}}`:typeof x==='object'?`{${Object.entries(x).map(([k,y])=>`${k}=${v(y)}`).join(',')}}`:String(x);
  return v(s);
}
const body=`
function test()
  D.watch()
  D.garbage()
  H.w8(ABI.P_DOORS, SCN.doors or 0); H.w8(ABI.P_TREE, 0)
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(SCN.settle or 12)
  H.result('start', D.pos())
  D.grid('before.bin')
  H.shot('before')
  if SCN.control then
    H.hold(SCN.walk, SCN.walkFrames or 40)
    H.result('walked', D.pos())
    H.shot('walked')
    return
  end
  if SCN.timeline then
    for _, st in ipairs(SCN.timeline) do D.hit(st) end
    H.result('hit', #SCN.timeline)
  elseif SCN.steps then
    local results = {}
    for _, len in ipairs(SCN.steps) do
      SCN.attack.length = len
      results[#results + 1] = D.hit(SCN.attack)
    end
    H.result('hit', results)
  elseif SCN.attack then H.result('hit', D.hit(SCN.attack)) end
  H.wait(SCN.frames or 16)
  D.grid('after.bin')
  H.shot('after')
  H.result('queue', {qn = H.r16(ABI.d_qn), live = H.r16(ABI.d_qlive), cleared = H.r16(ABI.d_cn), rows = H.r16(ABI.out_rows)})
  H.result('fx', {seq = H.r16(ABI.FX_SEQ), kind = H.r16(ABI.FX_KIND), x = H.r16(ABI.FX_X), y = H.r16(ABI.FX_Y)})
  H.result('writes', D.writes)
  if SCN.walk then
    H.hold(SCN.walk, SCN.walkFrames or 40)
    H.result('walked', D.pos())
    H.shot('walked')
  end
end
`;


const bodyEvent=`
function test()
  D.watch()
  D.garbage()
  H.w8(ABI.P_DOORS, SCN.doors or 0); H.w8(ABI.P_TREE, 0)
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(2)
  if SCN.door then H.result('door', D.door(SCN.door, SCN.map, SCN.flags)) end
  if SCN.teleport then D.teleport(SCN.teleport[1], SCN.teleport[2], SCN.teleport[3]) end
  H.result('arrived', D.pos())
  H.dumpfile('wram.bin', emu.memType.snesWorkRam, 0, 0x20000)
  D.grid('before.bin')
  H.shot('before')
  if SCN.flag then H.result('flagBefore', H.r8(0x7ECF00 + SCN.flag)) end
  if SCN.orb then H.result('hit', D.orb(SCN.orb))
  elseif SCN.steps then
    for _, st in ipairs(SCN.steps) do D.hit(st) end
    H.result('hit', #SCN.steps)
  else
    if SCN.attack.x == nil then local p = D.pos(); SCN.attack.x = p.x; SCN.attack.y = p.y end
    H.result('hit', D.hit(SCN.attack))
  end
  H.wait(6)
  H.shot('struck')
  H.result('busy', D.settle(SCN.waitFrames or 360, SCN.confirm))
  if SCN.flag then H.result('flagAfter', H.r8(0x7ECF00 + SCN.flag)) end
  H.result('doors', H.r8(ABI.P_DOORS))
  H.result('event', H.r16(ABI.dbg_ev))
  H.result('events', H.r16(ABI.dbg_evn))
  H.result('react', H.r16(ABI.out_react))
  if SCN.orb then H.result('e181', H.r8(0x7EE181 + SCN.orb)) end
  H.dumpfile('flags.bin', emu.memType.snesWorkRam, 0xCF00, 0x100)
  D.grid('after.bin')
  H.shot('after')
  if SCN.reload then
    -- enter the map again: the broken door's state must survive a reload
    H.result('reload', D.door(SCN.door, SCN.map))
    D.grid('reloaded.bin')
    H.shot('reloaded')
  end
  if SCN.walk then
    H.hold(SCN.walk, SCN.walkFrames or 60)
    H.result('walked', D.pos())
    H.shot('walked')
  end
end
`;

// Walking checks: passX/passY (beyond, increasing), passXlt/passYlt (beyond,
// decreasing), blockedX (did not pass).
function checkWalk(s,res,problems){
  const e=s.expect??{},w=res.walked;
  if(e.passX!==undefined&&!(w?.x>e.passX))problems.push(`did not walk through: x ${w?.x} <= ${e.passX}`);
  if(e.passXlt!==undefined&&!(w?.x<e.passXlt))problems.push(`did not walk through: x ${w?.x} >= ${e.passXlt}`);
  if(e.passY!==undefined&&!(w?.y>e.passY))problems.push(`did not walk through: y ${w?.y} <= ${e.passY}`);
  if(e.passYlt!==undefined&&!(w?.y<e.passYlt))problems.push(`did not walk through: y ${w?.y} >= ${e.passYlt}`);
  if(e.blockedX!==undefined&&!(w?.x<=e.blockedX))problems.push(`not blocked: x ${w?.x} > ${e.blockedX}`);
}

// Map cells that changed, within the map's size (boss arenas stream their
// graphics into the unused tail of the grid buffers).
function diffGrids(a,b,size=[128,128]){
  const out=[];
  for(let i=0;i<0x8000;i++){
    const tx=i&127,ty=(i>>7)&127;
    if(a[i]!==b[i]&&tx<size[0]&&ty<size[1])out.push({off:i,layer:i>>14,tx,ty,from:a[i],to:b[i]});
  }
  return out;
}

async function runEvent(s){
  const bundlePath=join(imports,s.bundle);
  if(!existsSync(bundlePath))return{name:s.name,ok:false,skipped:true,reason:'missing bundle '+s.bundle};
  let attack=null;
  if(s.attack){attack=attackProfile({...s.attack});attack.code=KIND[attack.kind];}
  const outDir=join(outRoot,s.name);
  // A full beam frame by frame from the bundle's position (no teleport).
  let steps=null;
  if(s.timeline){
    const w=new Uint8Array(readFileSync(join(bundlePath,'wram.bin'))),x=w[0xe002]|w[0xe003]<<8,y=w[0xe004]|w[0xe005]<<8;
    steps=beamTimeline({x,y,dir:attack.dir,kind:attack.kind}).map(t=>({x:t.x,y:t.y,dir:t.dir,length:t.length,halfWidth:Math.floor(t.halfWidth),taper:t.taper,id:t.id,code:attack.code,str:attack.str}));
  }
  const test=`ABI=${lua(abi)}\nSCN=${lua({...s,bundlePath,attack,steps,timeline:undefined,opened:undefined})}\n`+readFileSync(join(here,'destroy.lua'),'utf8')+bodyEvent;
  const m=await runMesen({rom,test,outDir});
  const res=m.results??{};
  const problems=[];
  if(m.code!==0||res.error)problems.push('mesen: '+(res.error??m.code));
  if(s.door&&res.door!==true)problems.push('door load failed');
  // The browser mod's choice for the same memory.
  let expectEvent=null,target=null;
  if(existsSync(join(outDir,'wram.bin'))){
    const wram=new Uint8Array(readFileSync(join(outDir,'wram.bin')));
    if(s.orb){
      const base=0xe000+s.orb,ev=(wram[base+0x3e]|wram[base+0x3f]<<8)&0x7ff;
      expectEvent=ev;target={kind:'orb',event:ev};
    }else{
      const a={...attack};if(a.x===undefined){a.x=wram[0xe002]|wram[0xe003]<<8;a.y=wram[0xe004]|wram[0xe005]<<8;}
      const ref=createReference(wram.slice(),cartridge);
      if(steps){
        // the browser's hit() each frame until one finds a target
        for(const st of steps){target=ref.barrierTarget({...a,x:st.x,y:st.y,length:st.length,halfWidth:st.halfWidth});if(target)break;}
      }else target=ref.barrierTarget(a);
      expectEvent=target?.event??null;
    }
  }
  if(!target)problems.push('reference found no target');
  else if(expectEvent!==null&&res.event!==expectEvent)problems.push(`event ${res.event?.toString(16)} want ${expectEvent.toString(16)}`);
  if(s.flag!==undefined&&!(res.flagAfter>=s.opened))problems.push(`flag ${s.flag.toString(16)} ${res.flagBefore} -> ${res.flagAfter}, want >= ${s.opened}`);
  checkWalk(s,res,problems);
  let grid=[];
  if(existsSync(join(outDir,'after.bin')))grid=diffGrids(new Uint8Array(readFileSync(join(outDir,'before.bin'))),new Uint8Array(readFileSync(join(outDir,'after.bin'))));
  // Story flags changed by the native event.
  let flags=[];
  if(existsSync(join(outDir,'flags.bin'))&&existsSync(join(outDir,'wram.bin'))){
    const before=new Uint8Array(readFileSync(join(outDir,'wram.bin'))).subarray(0xcf00,0xd000),after=new Uint8Array(readFileSync(join(outDir,'flags.bin')));
    for(let i=0;i<256;i++)if(before[i]!==after[i])flags.push(`CF${i.toString(16).toUpperCase().padStart(2,'0')}:${before[i]}->${after[i]}`);
  }
  if(s.flagsChange&&!flags.length)problems.push('no story flag changed');
  if(s.doorBit!==undefined&&!((res.doors>>s.doorBit)&1))problems.push(`door bit ${s.doorBit} not set (P_DOORS ${res.doors})`);
  if(s.piece){
    // the piece area: closed before, open after the event, still open after a reload
    const [px,py,pw,ph]=s.piece,area=f=>{if(!existsSync(join(outDir,f)))return null;const g=readFileSync(join(outDir,f)),a=[];for(let y=py;y<py+ph;y++)for(let x=px;x<px+pw;x++)a.push(g[y*128+x]);return a.join(',');};
    const b=area('before.bin'),a=area('after.bin'),r=area('reloaded.bin');
    if(!b||!a||b===a)problems.push(`piece area unchanged by the event (${a})`);
    if(s.reload&&(res.reload!==true||r!==a))problems.push(`piece area after re-entering ${r} want ${a}`);
  }
  const summary={name:s.name,ok:!problems.length,problems,edits:grid.length,flags,target,event:res.event,flag:[res.flagBefore,res.flagAfter],react:res.react,busy:res.busy,e181:res.e181,ms:m.ms,note:s.note};
  writeFileSync(join(outDir,'summary.json'),JSON.stringify({...summary,results:res},null,1));
  return summary;
}

async function run(s){
  if(s.type==='event')return runEvent(s);
  const bundlePath=join(imports,s.bundle);
  if(!existsSync(bundlePath))return{name:s.name,ok:false,skipped:true,reason:'missing bundle '+s.bundle};
  const wram=new Uint8Array(readFileSync(join(bundlePath,'wram.bin')));
  const w16=a=>wram[a]|wram[a+1]<<8;
  let attack=null,ref=null,timeline=null;
  if(s.attack){
    attack=attackProfile({x:w16(0xe002),y:w16(0xe004),...s.attack});
    attack.code=KIND[attack.kind];
    if(s.steps)attack.length=s.steps.at(-1);
    // JavaScript reference on the same memory.
    const copy=wram.slice(),r=createReference(copy,cartridge),[dx,dy]=facing[attack.dir];
    let rows;
    if(s.timeline){
      // The real beam: per-frame calls; the cartridge gets the same calls
      // (half widths floored: the API takes whole pixels).
      timeline=beamTimeline({x:attack.x,y:attack.y,dir:attack.dir,kind:attack.kind});
      rows=simulateTimeline(r,timeline.map(t=>({...t,halfWidth:Math.floor(t.halfWidth)})),attack.policy);
    }else{
      r.plants.beam({x:attack.x,y:attack.y,dx,dy,length:attack.length,halfWidth:attack.halfWidth,taper:attack.taper,policy:attack.policy,collisionLayer:attack.layer});
      rows=r.drain();
    }
    ref={rows,grid:diffGrids(wram.subarray(0x10000,0x18000),copy.subarray(0x10000,0x18000),[w16(0xc0)>>4,w16(0xc2)>>4]),barrier:r.barrierTarget(attack)};
  }
  const outDir=join(outRoot,s.name);
  const luaSteps=timeline?timeline.map(t=>({x:t.x,y:t.y,dir:t.dir,length:t.length,halfWidth:Math.floor(t.halfWidth),taper:t.taper,id:t.id,code:attack.code,str:attack.str})):undefined;
  const test=`ABI=${lua(abi)}\nSCN=${lua({...s,bundlePath,attack,timeline:luaSteps})}\n`+readFileSync(join(here,'destroy.lua'),'utf8')+body;
  const m=await runMesen({rom,test,outDir});
  const res=m.results??{};
  const problems=[];
  if(m.code!==0||res.error)problems.push('mesen: '+(res.error??m.code));
  let grid=[];
  if(!s.control&&existsSync(join(outDir,'after.bin'))){
    const before=new Uint8Array(readFileSync(join(outDir,'before.bin'))),after=new Uint8Array(readFileSync(join(outDir,'after.bin')));
    grid=diffGrids(before,after,[w16(0xc0)>>4,w16(0xc2)>>4]);
    if(ref){
      const key=c=>`${c.off}:${c.to}`,want=new Set(ref.grid.map(key)),got=new Set(grid.map(key));
      const missing=ref.grid.filter(c=>!got.has(key(c))),extra=grid.filter(c=>!want.has(key(c)));
      if(missing.length)problems.push(`missing edits ${JSON.stringify(missing.slice(0,8))}`);
      if(extra.length)problems.push(`unexpected edits ${JSON.stringify(extra.slice(0,8))}`);
      // Redraw requests and sounds, row by row.
      // $95 requests carry bit 7 until the native sound dispatcher takes
      // them (it rewrites the byte without bit 7); a row that finds the
      // previous request still pending stays silent, as in the browser.
      const w=res.writes??[],r82=w.filter(x=>x.k==='r82').map(x=>x.v),r83=w.filter(x=>x.k==='r83').map(x=>x.v),r95=w.filter(x=>x.k==='r95'&&x.v>=0xd8&&x.v<0xe8).map(x=>x.v);
      const want82=ref.rows.filter(r=>r.redraw[0]).map(r=>r.redraw[0]),want83=ref.rows.filter(r=>r.redraw[0]).map(r=>r.redraw[1]);
      const want95=ref.rows.filter(r=>r.sound).map(r=>r.sound);
      // The native consumer also writes $82/$83 while drawing: compare our
      // requests as an ordered subsequence.
      // A beam's timeline: the cartridge spreads its breach plans over
      // frames (the browser plans the whole band every frame), so its rows
      // may come in another order; compare them as multisets instead.
      const sub=s.timeline?(a,b)=>{const n=new Map();for(const x of a)n.set(x,(n.get(x)??0)+1);for(const x of b){if(!n.get(x))return false;n.set(x,n.get(x)-1);}return true;}
        :(a,b)=>{let i=0;for(const x of a)if(x===b[i])i++;return i===b.length;};
      if(!sub(r82,want82))problems.push(`redraw $82 ${JSON.stringify(r82)} want ${JSON.stringify(want82)}`);
      if(!sub(r83,want83))problems.push(`redraw $83 ${JSON.stringify(r83)} want ${JSON.stringify(want83)}`);
      // (a timeline may split a browser row into two applications: compare
      // the sound kinds)
      const sounds=s.timeline?r95.every(x=>want95.includes(x)):sub(want95,r95);
      if(!sounds||want95.length&&!r95.length)problems.push(`sound $95 ${JSON.stringify(r95)} want ${s.timeline?'kinds of':'a subsequence of'} ${JSON.stringify(want95)}`);
    }
  }
  // Demolition rows publish a rubble record at a demolished row; brazier
  // rows one burst per brazier (at its centre column).
  if(s.timeline&&grid.length&&(s.fx||s.name.startsWith('demo-'))){
    const fx=res.fx??{},kind=s.fx??1,hit=grid.some(c=>Math.abs(c.tx*16+8-fx.x)<=96&&Math.abs(c.ty*16+8-fx.y)<=32);
    if(!(fx.seq>0&&fx.kind===kind&&hit))problems.push(`effect record ${JSON.stringify(fx)}`);
    if(kind===2&&ref){const braz=new Set(ref.rows.flatMap(r=>r.tiles.filter(t=>t.brazier).map(t=>t.ty*128+t.tx)));
      // three braziers, three rows each: one record per brazier
      const want=Math.round(braz.size/6);if(fx.seq!==want)problems.push(`brazier bursts ${fx.seq} want ${want}`);}
  }
  checkWalk(s,res,problems);
  if(s.expect?.blockedX!==undefined&&!(res.walked?.x<=s.expect.blockedX))problems.push(`not blocked: x ${res.walked?.x} > ${s.expect.blockedX}`);
  const summary={name:s.name,ok:!problems.length,problems,edits:grid.length,refEdits:ref?.grid.length,start:res.start,walked:res.walked,queue:res.queue,ms:m.ms,note:s.note};
  writeFileSync(join(outDir,'summary.json'),JSON.stringify({...summary,ref,results:res},null,1));
  return summary;
}

mkdirSync(outRoot,{recursive:true});
const selected=scenarios.filter(s=>!only.length||only.includes(s.name));
const results=[];
for(const s of selected){
  const r=await run(s);results.push(r);
  const detail=s.type==='event'?`event ${r.event?.toString(16)} target ${r.target?.id??r.target?.kind??'-'} flags ${r.flags?.join(' ')||'-'} map edits ${r.edits}`:`edits ${r.edits??'-'} (ref ${r.refEdits??'-'})  ${r.walked?`walked to ${r.walked.x},${r.walked.y}`:''}`;
  console.log(`${r.ok?'pass':r.skipped?'skip':'FAIL'}  ${s.name.padEnd(16)} ${detail}  ${r.problems?.join('; ')??r.reason??''}`);
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok||r.skipped)?0:1);
