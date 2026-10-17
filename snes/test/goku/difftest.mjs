#!/usr/bin/env node
// Differential test of the cartridge's pose port: replays a native-state
// trace recorded in Mesen (actions.lua, trace.csv) through the browser mod's
// own engine/goku-animation.js and compares the chosen cell every frame.
//   node snes/test/goku/difftest.mjs <trace.csv> [--verbose]
// Exit status 1 when any frame differs.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

export function engine(){
  const context={window:{},Math,JSON,Error,Number,Array,Object,Set,Map};
  for(const f of['goku-animation-data.js','goku-native-actions.js','goku-animation.js'])
    vm.runInNewContext(readFileSync(resolve(repo,'engine',f),'utf8'),context);
  return context.window;
}
const SHEETS={goku:0,ssj:1,ssjJab:2};
// GOKU_K_* request codes -> engine/goku-animation.js action / mode kinds
const ACTS={0x10:'punch',0x11:'charge',0x12:'beam',0x13:'blast',0x14:'teleport',0x15:'transform',0x16:'revert',0x17:'ready',0x18:'focus'};
const MODES={0x20:'deflect',0x21:'resist',0x23:'gapFlight',0x25:'ceiling',0x26:'takeoff',0x27:'landing',0x28:'altar'};
// $4218 layout -> SnesJs joypad bits (B,Y,Select,Start,Up,Down,Left,Right,A,X,L,R)
const PAD_ORDER=[0x8000,0x4000,0x2000,0x1000,0x0800,0x0400,0x0200,0x0100,0x0080,0x0040,0x0020,0x0010];
const toSnesJs=p=>PAD_ORDER.reduce((m,bit,i)=>m|((p&bit)?1<<i:0),0);

export function diff(csvText,{verbose=false}={}){
  const w=engine();
  const lines=csvText.trim().split('\n'),head=lines[0].split(',');
  const rows=lines.slice(1).map(l=>{const v=l.split(',');const o={};head.forEach((h,i)=>o[h]=i<1?v[i]:Number(v[i]));return o;});
  const results=[];let motion=null,mod=null,lastTag=null,lastForm=null;
  for(const r of rows){
    // actions.lua restores one savestate per segment (roam, aNN): fresh state,
    // whose first recorded frames are idle settling; api.lua runs one
    // continuous session per form after 'settle'
    const restart=r.form!==lastForm||(r.tag!==lastTag&&(r.tag==='roam'||r.tag==='settle'||/^a\d\d$/.test(r.tag)));
    if(restart){
      mod={frame:0,facing:0,options:{superSaiyan:r.form===1},read8:()=>0,read16:()=>0,input:0,canAttack:false};
      motion=new w.GokuAnimation(mod);lastForm=r.form;lastTag=r.tag;
    }
    mod.frame++;
    mod.input=toSnesJs(r.pad);
    mod.canAttack=r.e4===1&&r.e5===1&&(r.e000&1)!==0&&(r.e02c&1)!==0&&(r.ec&0xfe)===0&&!(r.ed&0x40)&&r.d0===0&&!(r.st1&0x70)&&!(r.st2&0xd5);
    const d=r.facing;
    // request fields (api.lua): the browser mod's equivalent state
    const act=ACTS[r.act??0],sup=!!((r.act_arg??0)&0x80);
    mod.action=act?{kind:act,age:r.act_age,facing:r.act_facing,super:sup,combo:r.act_arg&3,hand:r.act_arg&1,duration:r.act_dur}:null;
    mod.facing=mod.action?r.act_facing:(d&0x7f)===0?3:(d&0x7f)===1?0:(d&0x80)?2:1;
    const mode=MODES[r.mode??0];
    mod.hitRecovery=mode==='deflect'||mode==='resist'?{reaction:{kind:mode,facing:r.mode_facing}}:null;
    mod.gapFlight=mode==='gapFlight'?{active:true}:null;
    mod.ceiling=mode==='ceiling'?{pose:{age:r.mode_age}}:null;
    mod.flightTransition=mode==='takeoff'||mode==='landing'?{kind:mode,age:r.mode_age}:null;
    mod.frieza=mode==='altar'?{approachingAltar:true}:null;
    mod.localFlight=!!((r.ctl??0)&0x08);mod.localLift=r.glift??0;
    const displayed={map:r.map,x:r.x,y:r.y,animation:r.anim,latchedAnimation:r.latched,graphicFrame:r.gframe,sequence:r.seq,facing:r.facing,lift:r.lift,status1:r.st1,status2:r.st2};
    let pose,err=null;
    try{pose=motion.pose({displayed});}catch(e){err=e.message;}
    if(r.count===0){continue;}           // the native body is absent: nothing drawn
    let expect;
    if(err)expect={err};
    else{
      let v=0;
      if(pose.nudge!==null&&pose.nudge!==undefined)v=0x80|((pose.legs!==null&&pose.legs!==undefined?pose.legs-2:pose.nudge)&3);
      else if(pose.legs!==null&&pose.legs!==undefined)v=2;
      else if(pose.shuffle)v=1;
      expect={sheet:SHEETS[pose.sheet],col:pose.column,row:pose.row,var:v,hidden:!!pose.hidden,kind:pose.kind,lift:pose.extraLift??0};
    }
    const got={sheet:r.sheet,col:r.col,row:r.row,var:r.var,hidden:!!(r.flags&1),lift:(r.lift_out<<16)>>16};
    const same=!err&&got.sheet===expect.sheet&&got.col===expect.col&&got.row===expect.row&&(expect.var&0x83)===(got.var&0x83)&&got.hidden===expect.hidden&&got.lift===expect.lift;
    results.push({tag:r.tag,form:r.form,frame:mod.frame,anim:r.anim,gframe:r.gframe,expect,got,same});
  }
  const bad=results.filter(x=>!x.same);
  const byTag={};
  for(const x of results){const k=`${x.tag}/${x.form}`;byTag[k]??={n:0,bad:0,first:null};byTag[k].n++;if(!x.same){byTag[k].bad++;byTag[k].first??=x;}}
  return {results,bad,byTag};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const file=process.argv[2];
  const {results,bad,byTag}=diff(readFileSync(file,'utf8'));
  for(const[k,v]of Object.entries(byTag)){
    const f=v.first;
    console.log(`${k.padEnd(14)} ${String(v.n-v.bad).padStart(4)}/${String(v.n).padEnd(4)}${f?`  first diff frame ${f.frame} anim ${f.anim.toString(16)} gf ${f.gframe}: js ${f.expect.err??`${f.expect.kind} ${f.expect.sheet}:${f.expect.col}:${f.expect.row} v${f.expect.var} lift ${f.expect.lift}${f.expect.hidden?' hidden':''}`} cart ${f.got.sheet}:${f.got.col}:${f.got.row} v${f.got.var} lift ${f.got.lift}${f.got.hidden?' hidden':''}`:''}`);
  }
  console.log(`${results.length-bad.length}/${results.length} frames agree`);
  if(process.argv.includes('--verbose'))for(const b of bad.slice(0,40))console.log(JSON.stringify(b));
  process.exit(bad.length?1:0);
}
