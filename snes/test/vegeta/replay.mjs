// Differential check of the trial logic: a Mesen recording (fight.lua) is
// replayed through the browser's own engine/joch-trial.js on the same game
// RAM, frame by frame, and the trial state after every tick is compared
// with the cartridge's state after the same tick.
//
// The browser module needs a host: mod.localFlightHook.canFly is the
// chamber footprint test (native-local-flight.js footprint() on the 64x64
// room: every layer-0 tile but 70 is protected), mod.status the camera from
// Goku's screen position, mod.canAttack/nativeField from RAM as mana-mod.js,
// radio/sounds/story requests are recorded. No randomness is involved.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

export function parseRecording(text){
  return text.trim().split('\n').map(line=>{
    const [frame,dp,goku,slot3,e200,e400,cf3f,gokuApi,vectors,vg,vs,pad,log]=line.split(' ');
    const bytes=h=>Uint8Array.from(h?.match(/../g)??[],x=>parseInt(x,16));
    return {frame:+frame,dp:bytes(dp),goku:bytes(goku),slot3:bytes(slot3),e200:bytes(e200)[0],e400:bytes(e400)[0],cf3f:bytes(cf3f)[0],
      gokuApi:bytes(gokuApi),vectors:bytes(vectors),vg:bytes(vg),vs:bytes(vs),pad:parseInt(pad,16),log:bytes(log)};
  });
}

const w16=(b,a)=>b[a]|b[a+1]<<8,s16=(b,a)=>(w16(b,a)<<16)>>16,s8=(b,a)=>(b[a]<<24)>>24;
const PHASES=['intro','battle','transform','draw'],KINDS=[null,'rush','volley','beam','counter'];

// The test log (module.asm !vs_hl / !vs_tk, recorded from $32:6210): a ring
// of 4 hits x 32 bytes, then the beam record the tick saw.
const HIT_RING=0x00,TICK_BEAM=0x80,POSE=0xA0;
// Goku's Kamehameha as a mana-mod.js effect, rebuilt from combat's beam
// record (combat/module.asm !er_*) with releaseCharge()'s beamProfile: the
// browser's own geometry then decides, not the cartridge's.
export function combatBeam(log,o){
  if(!log?.length||!(w16(log,o+2)&2))return null;
  const r=log.subarray(o+4,o+20),f=r[1],sup=!!(f&1),mega=!!(f&2),charge=log[o+20];
  const strength=Math.min(1,charge/(sup?45:90)),[dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][r[6]&3];
  const profile=mega?{width:80,range:640,speed:48}:{width:5+strength*14,range:320,speed:32};
  return {kind:'beam',x:s16(r,2),y:s16(r,4),dx,dy,life:r[8],max:r[9],super:sup,mega,...profile,
    cartridge:{range:w16(log,o+22),speed:w16(log,o+24)}};
}
// mana-mod.js beamGeometry()
function beamGeometry(effect){
  const age=effect.max-effect.life,speed=effect.speed||32;
  return{length:Math.min(effect.range,(age+1)*speed),speed,taper:effect.mega?44:0,
    halfWidth:effect.width*(effect.mega?Math.min(1,(age+1)/6,effect.life/10):1)};
}

// The cartridge's state (vegeta WRAM + SRAM record) in the browser's shape.
export function cartridgeState(rec){
  const g=rec.vg,v=rec.vs;
  if(g[0]!==0x5a)return null;
  const flags=g[2],act=g[0x20];
  const s={phase:PHASES[g[1]],mask:g[3],tier:g[4],facing:g[5],hp:w16(g,6),x:w16(g,8),y:w16(g,0x0a),terrain:g[0x0c],hurt:g[0x0d],
    age:w16(g,0x0e),clock:s16(g,0x10),grace:w16(g,0x12),phaseAge:w16(g,0x14),cycle:g[0x16],melee:g[0x17],lastMelee:s16(g,0x18),
    travel:w16(g,0x1a),movingUntil:w16(g,0x1c),backstep:!!g[0x1e],quips:g[0x1f],arrival:g[0x23],
    spawned:!!(flags&1),introduced:!!(flags&2),revealed:!!(flags&4),complete:!!(flags&8),draw:!!(flags&0x10),won:!!(flags&0x20),returning:!!(flags&0x40),earlySuperRemark:!!(flags&0x80),
    clash:null,action:null,shots:[],bursts:[],rocks:[],echoes:[]};
  if(g[0x2f]){
    const c=0x100,d32=a=>(w16(v,a)|(w16(v,a+2)<<16))>>>0;
    s.clash={phase:['lock','focus','struggle','release'][v[c]],result:[null,'win','lose'][v[c+1]],age:w16(v,c+2),total:w16(v,c+4),
      pressure:d32(c+6),shown:d32(c+0x0a),taps:w16(v,c+0x12),lastTap:s16(v,c+0x10),
      hero:{x:w16(v,c+0x16),y:w16(v,c+0x18)},boss:{x:w16(v,c+0x1a),y:w16(v,c+0x1c)},dx:s16(v,c+0x1e),dy:s16(v,c+0x20),super:!!v[c+0x15],
      from:{x:s16(v,c+0x22),y:s16(v,c+0x24)},to:{x:s16(v,c+0x26),y:s16(v,c+0x28)}};
  }
  if(act){
    const a={kind:KINDS[act],age:w16(g,0x24),dx:s8(g,0x21),dy:s8(g,0x22),x:w16(g,0x26),y:w16(g,0x28),tx:w16(v,0x0a),ty:w16(v,0x0c)};
    const contact=w16(g,0x2a);if(contact!==0xffff)a.contact=contact;
    if(v[0x09])a.beam={x:w16(v,0x0e),y:w16(v,0x10),length:w16(v,0x12),halfWidth:w16(v,0x14)/256};
    s.action=a;
  }
  for(let i=0;i<8;i++){const o=0x20+i*8;if(v[o+7]!==0xff)s.shots.push({x:s16(v,o),y:s16(v,o+2),dx:s8(v,o+4),dy:s8(v,o+5),speed:v[o+6],age:v[o+7]});}
  for(let i=0;i<10;i++){const o=0x60+i*6;if(w16(v,o+4)!==0xffff)s.bursts.push({x:s16(v,o),y:s16(v,o+2),age:w16(v,o+4)});}
  for(let i=0;i<6;i++){const o=0xa0+i*6;if(w16(v,o+4)!==0xffff)s.rocks.push({x:s16(v,o),y:s16(v,o+2),age:w16(v,o+4)});}
  for(let i=0;i<4;i++){const o=0xc4+i*8;if(w16(v,o+4)!==0xffff)s.echoes.push({x:s16(v,o),y:s16(v,o+2),age:w16(v,o+4),frame:v[o+6],flip:!!v[o+7]});}
  s.dbg={n:v[0x1fd],a:w16(v,0x200),b:w16(v,0x202)};
  s.sfx={id:w16(v,0x1f2),tick:w16(v,0x1f4)};s.say={id:w16(v,0x1f6),tick:w16(v,0x1f8)};
  return s;
}

// The browser trial's state in the same shape.
function browserState(t){
  const s=t.status;if(!s)return null;
  const out={phase:s.phase,mask:s.mask,tier:s.tier,facing:s.facing,hp:s.hp,x:s.x,y:s.y,terrain:s.terrain,hurt:s.hurt,age:s.age,clock:s.clock,
    grace:s.grace,phaseAge:s.phaseAge,cycle:s.cycle%256,melee:s.melee,lastMelee:s.lastMelee,travel:s.travel??0,movingUntil:s.movingUntil??0,backstep:!!s.backstep,
    quips:s.quips,arrival:s.arrival,spawned:!!s.spawned,introduced:!!s.introduced,revealed:!!s.entrance?.revealed||s.phase!=='intro',
    complete:!!s.entrance?.complete||s.phase!=='intro',draw:!!s.draw,won:!!s.won,returning:!!s.returning,earlySuperRemark:!!s.earlySuperRemark,
    clash:s.clash?{phase:s.clash.phase,result:s.clash.result,age:s.clash.age,total:s.clash.total,
      pressure:Math.round(s.clash.pressure*500000),shown:Math.round(s.clash.shown*500000),taps:s.clash.taps,lastTap:s.clash.lastTap,
      hero:{...s.clash.hero},boss:{...s.clash.boss},dx:s.clash.dx,dy:s.clash.dy,super:s.clash.super,from:{...s.clash.from},to:{...s.clash.to}}:null,action:null,
    shots:s.shots.map(p=>({x:p.x,y:p.y,dx:p.dx,dy:p.dy,speed:p.speed,age:p.age})),
    bursts:s.bursts.map(b=>({x:b.x,y:b.y,age:b.age})),rocks:s.rocks.map(r=>({x:r.x,y:r.y,age:r.age})),
    echoes:s.echoes.map(e=>({x:e.x,y:e.y,age:e.age,frame:e.frame,flip:!!e.flip}))};
  if(s.action){
    const a=s.action,o={kind:a.kind,age:a.age,dx:a.dx,dy:a.dy,x:a.x,y:a.y,tx:a.tx,ty:a.ty};
    if(a.contact!=null)o.contact=a.contact;
    if(a.beam)o.beam={x:a.beam.x,y:a.beam.y,length:a.beam.length,halfWidth:a.beam.halfWidth};
    out.action=o;
  }
  return out;
}

const sortKey=o=>JSON.stringify(o);
function diff(a,b,path='',out=[]){
  if(a===b)return out;
  if(typeof a==='number'&&typeof b==='number'){
    if(path.endsWith('halfWidth')&&Math.abs(a-b)<=1/128)return out;    // 8.8 on the cartridge
    out.push(`${path}: cartridge ${a} browser ${b}`);return out;
  }
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){out.push(`${path}: cartridge ${JSON.stringify(a)} browser ${JSON.stringify(b)}`);return out;}
  if(Array.isArray(a)||Array.isArray(b)){
    const A=[...(a??[])].map(sortKey).sort(),B=[...(b??[])].map(sortKey).sort();
    if(A.join('|')!==B.join('|'))out.push(`${path}: cartridge ${A.join(' ')} browser ${B.join(' ')}`);
    return out;
  }
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){if(k==='dbg'||k==='sfx'||k==='say')continue;diff(a[k],b[k],path?`${path}.${k}`:k,out);}
  return out;
}

export async function replay(recs,{hookAt=[],onFrame=null}={}){
  const {createJochTrial,vegetaPose}=await import(pathToFileURL(resolve(repo,'engine/joch-trial.js')).href);
  const ram=new Uint8Array(0x20000);
  const r=ram,w=a=>r[a]|r[a+1]<<8,sw=a=>(w(a)<<16)>>16;
  const ppu={mode:1,forcedBlank:false,getColor(){return[0,0,0];}};
  const snes={ram,ppu,cart:{data:new Uint8Array(0x400000)}};
  const events=[];
  let frame=0;
  // Chamber collision: the BG1 grid as recorded is not dumped; the room is
  // static (engine/time-chamber.js chamberLayout), protected outside 70.
  const tc=await import(pathToFileURL(resolve(repo,'engine/time-chamber.js')).href);
  const layout=tc.chamberLayout();
  const tile=(x,y)=>layout[(y>>4)*64+(x>>4)];
  const canFly=(x,y)=>{
    if(x<8||x>1024-8||y<8||y>1024-8)return false;
    for(const dy of[-4,0,4])for(const dx of[-6,0,6])if(tile(x+dx,y+dy)!==70)return false;
    return true;
  };
  const mod={
    options:{enabled:true,superSaiyan:false},gokuActive:true,
    localFlightHook:{canFly},
    get status(){const x=w(0xe002),y=w(0xe004),sx=sw(0xe020),sy=sw(0xe022);return{cameraX:x-sx,cameraY:y-sy,map:w(0xdc)};},
    get nativeField(){return[0x5c,0xa8,0xc0,0x00,0x5c,0xcf,0xc1,0x00].every((v,i)=>r[0x100+i]===v);},
    get canAttack(){
      return mod.nativeField&&r[0xe4]===1&&r[0xe5]===1&&(r[0xe000]&1)&&(r[0xe02c]&1)&&!(r[0xec]&0xfe)&&!(r[0xed]&0x40)&&!r[0xd0]&&!(r[0xe190]&0x70)&&!(r[0xe191]&0xd5)&&r[0xe011]!==0x8d&&r[0xe011]!==0x8e;
    },
    effects:[],beamGeometry:e=>e?._tb?{length:e._tb.len,halfWidth:e._tb.half,taper:e._tb.mega?44:0,speed:32}:e?beamGeometry(e):null,knockbacks:[],action:null,frieza:null,
    radio:{say(text){events.push({frame,kind:'say',text});},interrupt(lines){events.push({frame,kind:'say',text:lines[0]});}},
    playSound(name){events.push({frame,kind:'sfx',name});},
    feedback:{pulse(){},burst(){}},
    story:{request(id){events.push({frame,kind:'request',id});return true;}},
    // combat's effects end; a test's stand-in beam stays until the test drops it
    cancelCombat(){mod.effects=mod.effects.filter(e=>e._tb);},motion:{reset(){}},
  };
  const trial=createJochTrial(snes,mod,{loadArt:false});
  const results=[];
  let lastDbg=recs[0]?cartridgeState(recs[0])?.dbg?.n??0:0;
  for(let i=0;i+1<recs.length;i++){
    const rec=recs[i];frame=rec.frame;
    r.set(rec.dp,0);r.set(rec.goku,0xe000);r.set(rec.slot3,0xe600);r[0xe200]=rec.e200;r[0xe400]=rec.e400;r[0xcf3f]=rec.cf3f;
    r.set(rec.vectors,0x100);
    mod.options.superSaiyan=!!(rec.gokuApi[0]&1);
    ppu.forcedBlank=!!(r[0xe6]&0x80);
    // Goku's beam: combat's live record as the tick saw it, else the test
    // stand-in record ($32:61E0)
    const standIn=()=>{
      const v=rec.vs;
      if(!v[0x1f0])return [];
      const tb={x:s16(v,0x1e0),y:s16(v,0x1e2),dx:s16(v,0x1e4),dy:s16(v,0x1e6),len:w16(v,0x1e8),half:w16(v,0x1ea)/256,super:!!v[0x1ec],mega:!!v[0x1ed]};
      return [{kind:'beam',life:1,x:tb.x,y:tb.y,dx:tb.dx,dy:tb.dy,super:tb.super,mega:tb.mega,_tb:tb}];
    };
    {
      const beam=combatBeam(rec.log,TICK_BEAM);
      mod.effects=standIn().length?standIn():beam?[beam]:[];
    }
    trial.tick();
    // hits after this tick (combat's step, then the mailbox in the next
    // frame's callback), each with the beam it saw, in order
    const next=cartridgeState(recs[i+1]);
    // the pose the next frame drew: state after this tick and combat's hits,
    // before the mailbox's
    let posed=null;
    const pose=()=>{posed??=vegetaPose(trial.status??{});};
    if(next){
      const log=recs[i+1].log;
      if(((next.dbg.n-lastDbg)&0xff)>4)events.push({frame,kind:'error',text:`${(next.dbg.n-lastDbg)&0xff} hits in one frame overran the log`});
      for(let n=(lastDbg+1)&0xff;lastDbg!==next.dbg.n;n=(n+1)&0xff){
        lastDbg=n;
        const o=HIT_RING+(n&3)*32,amount=w16(log,o),flags=w16(log,o+2);
        if(flags&4)pose();
        const beam=combatBeam(log,o);
        mod.effects=standIn().length?standIn():beam?[beam]:[];
        mod.action=flags&1?{kind:'punch'}:null;
        const hit=trial.hit(trial.entity()??{index:3},amount===0xffff?1000000:amount);
        events.push({frame,kind:'hit',amount,melee:!!(flags&1),beam:!!beam,before:hit?.before,after:hit?.after});
        mod.action=null;
      }
    }
    // the story hook ran in the next frame's event logic, before its tick
    if(hookAt.includes(i+1))trial.onEvent(0x3db);
    if(trial.status?.clash){
      // browser input bits: 0 = B, 17 = Y (ki)
      const pad=rec.pad,input=(pad&0x8000?1:0)|(pad&0x4000?1<<17:0);
      trial.clashInput(input);
    }
    const want=browserState(trial),got=cartridgeState(recs[i+1]);
    // Vegeta's drawn pose (frame and recoil) as vegetaPose()
    {
      const log=recs[i+1].log,frame=log?.[POSE];
      if(frame!==undefined&&frame!==0xff&&want&&got){
        pose();
        const status=trial.status;
        if(status?.spawned){
          want.pose={frame:posed.frame,dx:posed.dx||0,dy:posed.dy||0};
          got.pose={frame,dx:s8(log,POSE+1),dy:s8(log,POSE+2)};
        }
      }
    }
    // what the trial keeps in actor slot 3 (combat's window must leave it
    // as the tick did): inactive, his position, HP and maximum, nothing
    // pending, alive, the Doppel's species
    if(want?.spawned&&got?.spawned&&(recs[i+1].dp[0xdc]|recs[i+1].dp[0xdd]<<8)===72){
      const n=recs[i+1].slot3,slot=b=>({active:b(0)&1,x:b(2)|b(3)<<8,y:b(4)|b(5)<<8,terrain:b(0x0b),species:b(0x180),
        hp:b(0x182)|b(0x183)<<8,max:b(0x184)|b(0x185)<<8,dead:b(0x191)>>7,pending:b(0x1f1)|b(0x1f2)<<8});
      want.slot3=slot(o=>r[0xe600+o]);got.slot3=slot(o=>n[o]);
    }
    const d=want||got?diff(got,want):[];
    results.push({i,frame:recs[i+1].frame,diff:d});
    onFrame?.(i,want,got,d);
  }
  return {results,events,trial};
}

// CLI: node snes/test/vegeta/replay.mjs .local/snes-test/vegeta/<case>/fight.txt [hook,...]
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const recs=parseRecording(readFileSync(process.argv[2],'utf8'));
  const hookAt=(process.argv[3]??'').split(',').filter(Boolean).map(Number);
  const {results,events}=await replay(recs,{hookAt});
  const bad=results.filter(r=>r.diff.length);
  console.log(`${results.length} ticks, ${bad.length} differ`);
  for(const r of bad.slice(0,12))console.log(r.i,r.frame,r.diff.slice(0,6).join('; '));
  console.log(events.slice(0,40).map(e=>`${e.frame}:${e.kind}:${e.name??e.id??e.text?.split('\n')[0]}`).join('\n'));
}
