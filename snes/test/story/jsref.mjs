// Browser reference for story checks: runs the browser mod's real
// engine/native-story.js on the vendored SnesJs core, from the same private
// state an import bundle was made from, with the same writes, request and
// button mashing as the Mesen scenario. Returns the story flags and the
// relocated events the browser entered.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadCore,WAIT_LOOPS} from '../../tools/snesjs-export.mjs';
import {browserCartData} from '../../gen/story-env.mjs';

const atWait=s=>s.cpuCyclesLeft===0&&!s.dmaBusy&&!(s.hdmaTimer>0)&&!s.cpu.waiting&&(s.cpu.r[1]&0x3f)===0&&WAIT_LOOPS.includes(s.cpu.br[4]);

export async function runBrowserStory({repo,rom,statePath,writes=[],ledger=[0,0],request,frames,mash=0,settle=4}){
  const engine=name=>import(pathToFileURL(join(repo,'engine',name)).href);
  const {restore,hash}=await engine('state.js');
  const {createNativeStory}=await engine('native-story.js');
  const {createDragonQuest}=await engine('dragon-quest.js');
  const s=loadCore(browserCartData(repo,rom));
  const st=JSON.parse(readFileSync(statePath,'utf8'));
  restore(s,{...st,romHash:hash(s.cart.data)});
  for(let i=0;i<4e6&&!atWait(s);i++)s.cycle(false);
  const r=s.ram,w=a=>r[a]|r[a+1]<<8;
  // A minimal browser mod: Goku active, every other module absent (as the
  // cartridge's stub queries), canAttack from RAM as mana-mod.js computes it.
  const mod={
    options:{enabled:true},gokuActive:true,
    get canAttack(){
      const vec=[0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0].every((v,i)=>r[0x100+i]===v),pose=r[0xe011];
      return vec&&r[0xe4]===1&&r[0xe5]===1&&!!(r[0xe000]&1)&&!!(r[0xe02c]&1)&&!(r[0xec]&0xfe)&&!(r[0xed]&0x40)&&r[0xd0]===0&&!(r[0xe190]&0x70)&&!(r[0xe191]&0xd5)&&!(pose>=0x8c&&pose<=0x8f);
    },
    entities(){return Array.from({length:12},(_,index)=>{const base=0xe000+index*0x200;return{index,base,active:!!(r[base]&1),species:r[base+0x180],x:w(base+2),y:w(base+4)};});},
    read8:a=>r[a],read16:a=>w(a),write8:(a,v)=>{r[a]=v;},write16:(a,v)=>{r[a]=v&255;r[a+1]=v>>8;},
    frieza:{crisisActive:false,unresolved:false,pendingEntrance:false,palace:false,needsTree:false,eligible:false,trial:false,popoiMember:false,stolenMask:0,
      status:{emperorKilled:false,tree:null,trialWon:false,primmMember:false,stage:'dormant',stolen:false},onEvent(){},repairCore(){}},
  };
  mod.quest=createDragonQuest(mod);
  mod.quest.restore({mask:ledger[0],seedMask:ledger[1],delivered:0,wished:false});
  const story=createNativeStory(s,mod);
  story.load();
  for(const [a,v] of writes)r[a&0x1ffff]=v;
  const step=buttons=>{s.joypad1State=buttons;s.runFrame(true);};
  for(let i=0;i<settle;i++)step(0);
  const ok=request>=0x800?story.travel(request&0x3ff):story.request(request);
  for(let i=1;i<=frames;i++)step(mash&&i%mash<2?1:0);
  const status=story.status;
  return{requested:ok,flags:Array.from(r.slice(0xcf00,0xd000)),entered:status.recentEvents,ledger:mod.quest.status,status,map:w(0xdc)};
}
