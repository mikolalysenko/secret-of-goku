import test from 'node:test';
import assert from 'node:assert/strict';
import {createJochTrial,vegetaHealth} from '../engine/joch-trial.js';
import {encodeText,wrapText} from '../engine/event-codec.js';
import {createCeilingEscape} from '../engine/ceiling-escape.js';

function fixture(mask=3){
 const ram=new Uint8Array(0x20000),snes={ram,ppu:{forcedBlank:false}},sounds=[],messages=[];
 const read=a=>ram[a]|ram[a+1]<<8,write=(a,v)=>{ram[a]=v;ram[a+1]=v>>8;};
 const mod={options:{enabled:true,superSaiyan:false},gokuActive:true,nativeField:true,canAttack:true,effects:[],
  status:{cameraX:0,cameraY:0},localFlightHook:{canFly:(x,y)=>x>=40&&x<=472&&y>=40&&y<=472},
  playSound:s=>sounds.push(s),radio:{say:t=>{encodeText(t);assert.ok(wrapText(t).split('\n').length<=3,t);messages.push(t);}},
  beamGeometry:b=>({length:b.length,halfWidth:b.halfWidth,taper:20}),feedback:{pulse(){},burst(){}}};
 write(0xdc,72);write(0xe002,128);write(0xe004,160);write(0xe182,999);ram[0xcf3f]=4;
 ram[0xe200]=mask&1;ram[0xe400]=(mask>>1)&1;ram[0xe600]=ram[0xe800]=ram[0xea00]=1;ram[0xe780]=46;
 write(0xe602,128);write(0xe604,48);
 const trial=createJochTrial(snes,mod,{loadArt:false}),tick=(n=1)=>{for(let i=0;i<n;i++)trial.tick();};
 mod.trial=trial;trial.onEvent(0x3db);tick();
 const intro={phase:trial.status.phase,music:trial.music};
 // Combat cases start after the native entrance/fade, which has a separate
 // ROM-backed regression. The small fixture has no native fade interpreter.
 trial.restore({...trial.snapshot(),phase:'battle',entrance:null,arrival:36});
 return{ram,snes,mod,trial,tick,read,write,sounds,messages,intro};
}

test('Vegeta\'s theme starts with his entrance cutscene, not after it',()=>{
 assert.deepEqual(fixture().intro,{phase:'intro',music:'vegeta'});
});

test('Vegeta replaces all Dopples, preserves the original lineup, and has two distinct phases',()=>{
 for(const mask of[0,1,2,3]){
  const f=fixture(mask),{trial,tick,ram,read}=f;
  assert.equal(trial.partyMask,mask);assert.equal(trial.entity().custom,'vegeta');
  assert.equal(trial.entity().hp,vegetaHealth[0]);
  assert.equal(trial.music,'vegeta');
  assert.ok([0xe600,0xe800,0xea00].every(a=>!(ram[a]&1)),'No native ghost AI remains');
  assert.equal(ram[0xe791]&128,0,'Native victory cannot trigger before Vegeta leaves');
  trial.hit(trial.entity(),100000);assert.equal(trial.status.phase,'transform');
  assert.equal(trial.music,'vegeta-full-power');
  assert.equal(trial.status.hp,vegetaHealth[1]);assert.equal(read(0xe782),vegetaHealth[1]);assert.equal(trial.entity().maxHp,vegetaHealth[1]);
  assert.equal(trial.hit(trial.entity(),100000).after,vegetaHealth[1],'Transformation cannot be skipped by a lingering beam');
  tick(91);assert.equal(trial.status.tier,0);tick();assert.equal(trial.status.tier,1);
  assert.equal(read(0xe784),vegetaHealth[1]);tick(128);
  assert.equal(trial.status.phase,'battle');assert.equal(trial.status.action.kind,'beam');
  trial.hit(trial.entity(),200000);assert.equal(trial.status.phase,'draw');
  assert.equal(trial.entity().hp,1,'Vegeta stays alive during the draw');
  assert.equal(ram[0xe791]&128,0);tick(489);assert.equal(ram[0xe791]&128,0);
  tick();assert.equal(trial.status.won,true);assert.equal(ram[0xe791]&128,128);assert.equal(read(0xe782),0);
  assert.equal(trial.entity(),null);assert.ok(f.messages.some(t=>t.includes('draw, Kakarot')));
  assert.equal(trial.status.tier,0,'Both fighters power down rather than explode');
 }
});

test('an arena checkpoint cannot skip the solo-party and nonfatal-loss introduction',()=>{
 const {trial,tick,mod,ram}=fixture();trial.restore();ram[0xe600]=1;
 const requested=[];mod.story={request:id=>{requested.push(id);return true;}};
 tick();assert.equal(trial.status.phase,'intro');assert.equal(trial.status.introduced,false);
 assert.deepEqual(requested,[0x3db]);assert.equal(trial.dangerous,false);
 trial.onEvent(0x3db);trial.restore({...trial.snapshot(),entrance:null});tick();assert.equal(trial.status.phase,'battle');assert.equal(trial.partyMask,3);
});

test('repeated melee triggers a teleport counter, and menu pauses preserve the exact battle state',()=>{
 const {trial,tick,mod,ram}=fixture();mod.action={kind:'punch'};
 const ceiling=createCeilingEscape({...mod,trial});assert.equal(ceiling.bossActive,true);assert.equal(ceiling.request(),false,'Cannot strand the waiting companions by leaving the duel through the ceiling');
 trial.hit(trial.entity(),1000);trial.hit(trial.entity(),1000);
 assert.equal(trial.status.action.kind,'counter');assert.equal(trial.status.counters,1);
 const before=trial.snapshot();ram[0xec]=4;tick(240);assert.deepEqual(trial.snapshot(),before);
 ram[0xec]=0;tick(54);const after=trial.snapshot();assert.notEqual(after.x+','+after.y,before.x+','+before.y);
 assert.ok(Number.isInteger(after.x)&&Number.isInteger(after.y));
 trial.restore(before);tick(54);assert.deepEqual(trial.snapshot(),after,'Restored combat replays identically');
 assert.notDeepEqual(before,after,'Snapshots are independent of the live state');
});

test('the Galick Gun commits to a visible lane, is dodgeable, and deals less damage to SSJ',()=>{
 for(const gold of[false,true])for(const dodge of[false,true]){
  const f=fixture(),{trial,tick,write,read,mod}=f;mod.options.superSaiyan=gold;
  trial.restore({...trial.snapshot(),x:128,y:80,grace:0,action:{kind:'beam',age:0,dx:0,dy:1,x:128,y:80},clock:0});
  tick(109);assert.equal(read(0xe1f1),0,'The full windup gives time to move or charge');
  if(dodge)write(0xe002,200);tick(10);
  assert.equal(read(0xe1f1),dodge?0:gold?144:240);
  assert.equal(trial.status.action.beam.x,128,'The warning does not track Goku after firing');
 }
});

test('a Kamehameha eats Vegeta projectiles; walls stop rushes and create telegraphed debris',()=>{
 const {trial,tick,mod}=fixture();
 mod.effects=[{kind:'beam',life:20,x:128,y:148,dx:1,dy:0,length:200,halfWidth:20}];
 trial.restore({...trial.snapshot(),shots:[{x:200,y:148,dx:-1,dy:0,speed:4,age:0}],clock:100});tick();
 assert.equal(trial.status.shots.length,0);assert.equal(trial.status.damageTaken,0);
 trial.restore({...trial.snapshot(),x:470,y:160,action:{kind:'rush',age:23,dx:1,dy:0}});tick();
 assert.equal(trial.status.x,472);assert.equal(trial.status.action,null);
 assert.ok(trial.status.rocks.length>0);assert.ok(trial.status.rocks.every(r=>r.age===0));
});

test('the final beam finishes before the draw, and sparring damage cannot kill Goku',()=>{
 const {trial,tick,mod,write,read}=fixture();
 trial.restore({...trial.snapshot(),tier:1,hp:1});mod.effects=[{kind:'beam',life:40}];
 trial.hit(trial.entity(),1000);tick(80);assert.equal(trial.status.phaseAge,0);assert.equal(trial.status.hp,1);
 mod.effects=[];tick(35);assert.equal(trial.status.tier,0);assert.equal(trial.inputLocked,true);
 trial.restore({...trial.snapshot(),phase:'battle',tier:1,grace:0,x:128,y:80,action:{kind:'beam',age:81,dx:0,dy:1,x:128,y:80}});
 write(0xe182,100);tick(10);assert.equal(read(0xe1f1),99);assert.equal(trial.status.phase,'draw');assert.equal(trial.status.draw,false);
});
