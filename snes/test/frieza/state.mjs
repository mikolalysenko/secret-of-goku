// Translate the browser mod's Frieza state (snapshot goku.frieza /
// goku.challenge, engine/frieza.js `s`) into the cartridge's WRAM and SRAM
// fields. Addresses come from the module's own defines, so the tests follow
// layout changes.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const dir=join(repo,'snes/src/modules/frieza');
const src=['module.asm',...readdirSync(dir).filter(f=>f.endsWith('.asm')&&f!=='module.asm').sort()].map(f=>readFileSync(join(dir,f),'utf8')).join('\n');

// Evaluate the module's `!name = expr` defines (numbers, !FZ+$xx, !FZPB+$xx).
export const defs={FZ:0xDB00,FZPB:0x316180,SRAM_WORK_SCENE:0x326000};
for(let pass=0;pass<3;pass++)for(const line of src.split('\n')){
  const m=line.match(/^!(\w+)\s*#?=\s*([^;]+)/);if(!m)continue;
  let expr=m[2].trim();
  if(/^[a-z_]\w*$/.test(expr))continue;               // labels
  expr=expr.replace(/!(\w+)/g,(_,n)=>n in defs?String(defs[n]):'NaN').replace(/\$([0-9A-Fa-f]+)/g,'0x$1');
  try{const v=Function(`return (${expr})`)();if(Number.isFinite(v))defs[m[1]]=v;}catch{}
}
const ram=n=>{if(!(n in defs))throw Error(`frieza test: define ${n} missing`);const v=defs[n];return v<0x10000?0x7E0000|v:v;};
const enumOf=(prefix,name)=>{const k=prefix+name.toUpperCase().replace(/-/g,'_');if(!(k in defs))throw Error(`frieza test: no ${k}`);return defs[k];};
const sceneId=kind=>enumOf('FZS_',{'fanha-finish':'fanha',confrontation:'confront'}[kind]??kind);
const stageId=stage=>enumOf('FZST_',stage);
const treeId=tree=>tree?enumOf('FZTR_',{confrontation:'confront'}[tree]??tree):0;

// Writes: [address (CPU bus), value, bytes].
export function friezaWrites(f,challenge,{map}={}){
  const w=[];
  const put=(name,v,n)=>w.push([ram(name),v&(n===2?0xFFFF:0xFF),n]);
  let flags=0;
  const bit=(on,name)=>{if(on)flags|=defs[name];};
  bit(f.emperorKilled,'FZFL_EMPEROR');bit(f.trialWon,'FZFL_TRIAL_WON');bit(f.stolen,'FZFL_STOLEN');bit(f.eighth,'FZFL_EIGHTH');
  bit(f.permanent,'FZFL_PERMANENT');bit(f.fallen,'FZFL_FALLEN');bit(f.popoiMember,'FZFL_POPOI');bit(f.primmMember,'FZFL_PRIMM');
  bit(f.deckBall,'FZFL_DECKBALL');bit(f.outdoorIntro,'FZFL_OUTDOOR');bit(f.hinted,'FZFL_HINTED');bit(f.offered,'FZFL_OFFERED');
  bit(!!f.flyby,'FZFL_FLYBY');bit(f.flyby?.started,'FZFL_FLYBY_GO');
  let crisis=0;
  if(f.crisis){crisis|=defs.FZC_ON;if(f.crisis.active)crisis|=defs.FZC_ACTIVE;if(f.crisis.resolved)crisis|=defs.FZC_RESOLVED;
    if(f.crisis.flightNotified)crisis|=defs.FZC_NOTIFIED;if(f.crisis.deathBall)crisis|=defs.FZC_DEATHBALL;if(f.crisis.rearCamera)crisis|=defs.FZC_REAR;}
  let beast=0;
  if(challenge?.fed)beast|=defs.FZX_FED;if(challenge?.started)beast|=defs.FZX_STARTED;if(challenge?.won)beast|=defs.FZX_WON;
  // the module checks its block and resets its WRAM once per session unless
  // a load hook did (fz_guard): these writes stand for that load
  put('fz_init',0xA5,1);
  put('fz_wasidle',defs.FZI_SRAM,1);              // the scene SRAM the writes below fill is Frieza's
  put('fzp_version',1,1);put('fzp_stage',stageId(f.stage),1);put('fzp_tree',treeId(f.tree),1);
  put('fzp_flags',flags,2);put('fzp_mask',f.stolenMask??0,1);put('fzp_crisis',crisis,1);put('fzp_beast',beast,1);
  put('fzp_flyby',f.flyby?f.flyby.age:0xFFFF,2);
  // the challenge's per-visit state (beast-challenge.js restore(): hits,
  // clock, grace, the Beast's body, the eruption and its pending damage)
  if(challenge){
    put('fzx_clock',challenge.clock??0,2);put('fzx_grace',challenge.grace??0,1);put('fzx_hits',challenge.hits??0,1);
    put('fzx_pending',challenge.pendingBeam??0,2);put('fzx_body',challenge.beastBody?challenge.beastBody.base-0xE000:0xFFFF,2);
    const b=challenge.burst?.kind==='beam'?challenge.burst:null;
    put('fzx_bon',b?1:0,1);
    if(b){put('fzx_bx',b.x,2);put('fzx_btop',b.top,2);put('fzx_bbot',b.bottom,2);put('fzx_bwidth',b.width,2);
      put('fzx_bwarn',b.warning,2);put('fzx_bdmg',b.damage,2);put('fzx_bage',b.age,2);put('fzx_bhit',b.hit?1:0,1);}
  }
  const c=f.scene;
  if(c){
    let sf=0;if(c.court)sf|=defs.FZSF_COURT;if(c.altar)sf|=defs.FZSF_ALTAR;if(c.target)sf|=defs.FZSF_TARGET;
    put('fz_scene',sceneId(c.kind),1);put('fz_sflags',sf,1);put('fz_sage',c.age,2);put('fz_sclock',c.clock??0,2);
    put('fz_smap',c.map,2);put('fz_sx',c.x,2);put('fz_sy',c.y,2);
    if(c.target){put('fz_stx',c.target.x,2);put('fz_sty',c.target.y,2);}
    if(c.base)put('fz_sbase',c.base-0xE000,2);
    if(c.altar){put('fz_acx',c.altar.cameraX,2);put('fz_acy',c.altar.cameraY,2);}
    if(c.lift){put('fz_lfx',c.lift.x,2);put('fz_lfy',c.lift.y,2);}
  }else put('fz_scene',0,1);
  const b=f.boss;
  if(b&&!b.space){
    put('fzf_x',b.x,2);put('fzf_y',b.y,2);put('fzf_hp_lo',b.hp&0xFFFF,2);put('fzf_hp_hi',b.hp>>>16,2);
    put('fzf_age',b.age,2);put('fzf_clock',b.clock,2);put('fzf_cycle',b.cycle,1);put('fzf_node',b.node,1);
    put('fzf_nodes',b.nodes.length,1);put('fzf_tier',b.tier??0,1);put('fzf_stun',b.stun,1);put('fzf_grace',b.grace,1);
    put('fzf_hurt',b.hurt,1);put('fzf_recoil',b.recoil??0,1);put('fzf_guard',b.guard??0,1);put('fzf_dash',b.dash??0,1);
    put('fzf_windup',b.windup??0,1);put('fzf_terrain',b.terrain,2);
    put('fzf_flags',defs.FZFF_ACTIVE|(b.muscular?defs.FZFF_MUSCULAR:0)|(b.counter?defs.FZFF_COUNTER:0),1);
    b.nodes.forEach((n,i)=>{w.push([ram('fzf_node_x')+2*i,n.x&0xFFFF,2]);w.push([ram('fzf_node_y')+2*i,n.y&0xFFFF,2]);});
  }
  return w;
}

// Lua table literal of writes.
export const luaWrites=w=>'{'+w.map(([a,v,n])=>`{0x${a.toString(16)},${v},${n}}`).join(',')+'}';
