// Broad shipping-cartridge trace, also run by audio/run.mjs. --diagnose
// keeps the failing trace of an older ROM without asserting suppression.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {friezaWrites,luaWrites} from '../frieza/state.mjs';

const root=resolve(import.meta.dirname,'../../..');
export async function traceWeaponCharge(rom,outDir,{diagnose=false}={}){
  const g=JSON.parse(readFileSync(join(root,'.local/snes-ref/battle/state.json'),'utf8')).goku;
  const pre=`IMPORT=${JSON.stringify(join(root,'.local/snes-import/'))}
CHECKPOINT=${JSON.stringify(join(checkpointDir(),'waterfall.mss'))}
FRIEZA_WRITES=${luaWrites(friezaWrites(g.frieza,g.challenge))}
`;
  const copy=privateRom(rom,'weapon-charge');
  let r;
  try{
    r=await runMesen({rom:copy,state:join(checkpointDir(),'waterfall.mss'),outDir,args:['--snes.port2.type=SnesController'],
      test:pre+readFileSync(join(import.meta.dirname,'weapon-charge.lua'),'utf8')});
  }finally{cleanupRom(copy);}
  if(r.code!==0||r.results?.error||!r.results?.commands)throw Error(r.results?.error??r.output.slice(-2000));
  const {commands,requests,checks}=r.results;
  const summary={romSha256:createHash('sha256').update(readFileSync(rom)).digest('hex'),phases:{},checks,
    leaks:commands.filter(c=>c.cmd===2&&c.id>=0x26&&c.id<=0x28&&c.origin?.goku)};
  for(const p of r.results.phases)summary.phases[p.name]={...p,effects:{},requested:{}};
  for(const c of commands){
    const p=summary.phases[c.phase];if(!p)continue;
    const key=c.cmd.toString(16)+':'+c.id.toString(16).padStart(2,'0');
    p.effects[key]=(p.effects[key]??0)+1;
  }
  for(const q of requests){
    const p=summary.phases[q.phase];if(!p)continue;
    const key=q.id.toString(16)+':'+q.actor.toString(16);
    p.requested[key]=(p.requested[key]??0)+1;
  }
  for(const [name,actor] of [['companion-primm',0x200],['companion-popoi',0x400],['native-boy',0],['ending-randi',0]]){
    checks[name+'_retains_charge']=commands.some(c=>c.phase===name&&c.id===0x27&&c.origin?.actor===actor)&&
      commands.some(c=>c.phase===name&&c.id===0x28&&c.origin?.actor===actor);
  }
  checks.meter_tick_exercised=requests.some(q=>q.goku&&q.id===0x27);
  checks.level_exercised=requests.some(q=>q.goku&&q.id===0x28&&q.meter>>>8<7);
  checks.full_exercised=requests.some(q=>q.goku&&q.id===0x28&&q.meter>>>8===7);
  checks.ready_exercised=requests.some(q=>q.goku&&q.id===0x26);
  checks.second_controller_charges=requests.some(q=>q.phase==='goku-second-controller'&&q.goku&&q.id===0x28);
  checks.weapon_commands_attributed=commands.filter(c=>c.cmd===2&&c.id>=0x26&&c.id<=0x28)
    .every(c=>[0xB3ED,0xB3CB,0xEC02].includes(c.origin?.source&0xFFFF));
  checks.actor_queue_bounded=Object.values(r.results.queueCosts).every(c=>c.max<1.35);
  for(const phase of ['loaded-first-attack','after-map-change'])
    checks[phase+'_acts']=commands.some(c=>c.phase===phase&&c.cmd===2&&c.id===0xE5);
  checks.no_goku_weapon_commands=summary.leaks.length===0;
  writeFileSync(join(outDir,'summary.json'),JSON.stringify(summary,null,2));
  const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
  if(failed.length&&!diagnose)throw Error('weapon-charge: '+failed.join(', '));
  return {pass:!failed.length,phases:Object.keys(summary.phases).length,commands:commands.length,leaks:summary.leaks.length,failed};
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const rom=resolve(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
  console.log(await traceWeaponCharge(rom,resolve(process.env.AUDIO_CHARGE_OUT??'.local/snes-test/audio/weapon-charge'),
    {diagnose:process.argv.includes('--diagnose')}));
}
