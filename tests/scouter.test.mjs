import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createScouter,powerLevel,formatPower,analyzerSpell,sylphidFlag} from '../engine/scouter.js';
import {restore,hash} from '../engine/state.js';

function rig({entities=[],owned=true}={}){
 const ram=new Uint8Array(0x20000),writes=[];
 if(owned)ram[0xcf00+sylphidFlag]=2;
 const snes={ram,cpu:{cyclesLeft:0,r:new Uint8Array(4),br:new Uint16Array(8),cycle(){}},ppu:{forcedBlank:false,getColor:()=>0x1234},write(address,value){writes.push([address,value]);ram[address&0x1ffff]=value;}};
 const sounds=[],radio=[];
 const mod={options:{enabled:true,superSaiyan:false},gokuActive:true,canAttack:true,worldFlight:false,charging:false,charge:0,frame:0,
  entities:()=>entities,read16:()=>131,playSound:s=>sounds.push(s),radio:{say:t=>radio.push(t)},challenge:{status:{fed:false}},frieza:{trial:false,status:{}}};
 return{snes,mod,sounds,radio,scouter:createScouter(snes,mod)};
}
const goku={index:0,base:0xe000,active:true,species:0x80,hp:999,maxHp:999,screenX:128,screenY:120};
const rabite={index:3,base:0xe600,active:true,species:0,hp:20,maxHp:20,screenX:60,screenY:90};

test('power levels: canon Goku and Frieza, HP-derived for everyone else',()=>{
 const {mod}=rig();
 assert.equal(powerLevel(mod,goku),90_000);
 mod.options.superSaiyan=true;assert.equal(powerLevel(mod,goku),150_000_000);
 mod.options.superSaiyan=false;mod.charging=true;mod.charge=45;assert.equal(powerLevel(mod,goku),135_000);
 assert.equal(powerLevel(mod,rabite),80);
 assert.equal(powerLevel(mod,{...rabite,maxHp:1234}),4900); // two significant figures
 assert.equal(powerLevel(mod,{index:12,custom:'frieza',maxHp:96000}),60_000_000);
 mod.frieza.status.boss={muscular:true};assert.equal(powerLevel(mod,{index:12,custom:'frieza',maxHp:96000}),120_000_000);
 assert.equal(formatPower(150000000),'150,000,000');
});

// The game's spell landing (C0:3F94): X = target, Y = caster.
function land({snes},target,caster=0x200,spell=analyzerSpell){
 const {ram:r,cpu:c}=snes;r[0xe170+caster]=spell;
 c.r[1]=0xc0;c.br[4]=0x3f94;c.br[1]=target;c.br[2]=caster;c.cycle();
}

function selectScouter({snes,scouter},actor=0){
 const {ram:r,cpu:c}=snes;r[0x1808]=actor;r[0x1809]=2;r[0x1876]=1;
 c.r[1]=0xc0;c.br[4]=0x73f4;c.cycle();scouter.tick();return c.br[4];
}

test('Sylphid unlocks a ring toggle but neither ownership nor Analyzer switches it on',()=>{
 for(const owned of[false,true]){
  const rigged=rig({entities:[goku,rabite],owned}),{snes,scouter}=rigged;
  assert.equal(scouter.enabled,false);land(rigged,0x600);scouter.tick();
  assert.equal(scouter.status.readouts.length,0);assert.equal(scouter.chord,undefined,'no shortcut intercepts focus + ring');
  assert.equal(selectScouter(rigged),owned?0x7275:0x73f4);
  assert.equal(scouter.enabled,owned);if(owned)assert.equal(snes.ram[0x1812],1,'the native title refreshes immediately');
 }
});

test('only Goku can toggle the scouter; it follows visible actors until disabled',()=>{
 const r=rig({entities:[goku,rabite]}),{scouter,sounds,radio}=r;
 assert.equal(selectScouter(r,1),0x73f4);assert.equal(scouter.enabled,false);
 selectScouter(r);assert.equal(scouter.enabled,true);assert.equal(scouter.status.scans,1);
 assert.deepEqual(scouter.status.readouts.map(r=>r.key),[0xe000,0xe600]);
 assert.deepEqual(sounds,['teleport']);assert.match(radio[0],/OVER 9000/);
 for(let i=0;i<300;i++)scouter.tick();assert.equal(scouter.status.readouts.length,2);
 selectScouter(r);assert.equal(scouter.enabled,false);assert.equal(scouter.status.readouts.length,0);
 selectScouter(r);assert.equal(radio.length,1,'the joke plays once');
});

test('Analyzer readouts require explicit activation and disabling immediately clears the cached overlay',()=>{
 const r=rig({entities:[goku,rabite]}),{snes,scouter,mod}=r;
 land(r,0x600);assert.equal(scouter.status.readouts.length,0);
 selectScouter(r);land(r,0x600);
 assert.equal(scouter.status.readouts.find(r=>r.key===0xe600).source,'analyzer');
 for(let i=0;i<30;i++)scouter.tick();
 const pixels=()=>{let lit=0;for(let y=60;y<130;y++)for(let x=40;x<160;x++)if(Array.isArray(snes.ppu.getColor(false,x,y)))lit++;return lit;};
 assert.ok(pixels()>40);scouter.setEnabled(false);assert.equal(pixels(),0);
 scouter.setEnabled(true);scouter.tick();mod.menuActive=true;mod.frame++;assert.equal(pixels(),0);
});

test('checkpoints remember opt-in; old saves and new games default off and never carry stale readouts',()=>{
 const r=rig({entities:[goku]}),{scouter}=r;selectScouter(r);
 const saved=scouter.snapshot();assert.deepEqual(saved,{version:2,enabled:true,jokes:['goku'],scans:1});
 scouter.restore();assert.equal(scouter.enabled,false);
 scouter.restore(saved);assert.equal(scouter.enabled,true);assert.equal(scouter.status.readouts.length,0);
 scouter.restore({version:1,jokes:[],scans:5});assert.equal(scouter.enabled,false);
 r.snes.ram[0xcf00+sylphidFlag]=0;scouter.restore(saved);assert.equal(scouter.enabled,false);
});

test('only an Analyzer landing marks its target; a level-23 actor\'s +181h does not',()=>{
 const r=rig({entities:[goku,rabite]}),{snes,scouter}=r;selectScouter(r);
 const source=()=>scouter.status.readouts.find(x=>x.key===0xe600).source;
 // +181h is the level: actor setup or a level-up can store 23 (17h) there.
 snes.write(0x7ee781,analyzerSpell);assert.equal(source(),'scouter');
 land(r,0x600,0x200,0x16);assert.equal(source(),'scouter','another spell landing');
 land(r,0x600);assert.equal(source(),'analyzer');
 for(let i=0;i<10;i++)scouter.tick();land(r,0x600);
 assert.equal(scouter.status.readouts.find(x=>x.key===0xe600).age,0,'a recast restarts the reading');
});

test('a real Analyzer cast from Primm\'s ring marks its target when the spell lands',t=>{
 const rom='.local/rom/secret-of-mana-us.sfc',fixture='.local/animation-audit/native/rabite-field-b.json';
 if(!existsSync(rom)||!existsSync(fixture)){t.skip('Private ROM and native Rabite field required');return;}
 const context={console,Uint8Array,Uint16Array,Int8Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math,clearArray:a=>a.fill(0),log:()=>{},getByteRep:x=>x.toString(16),getWordRep:x=>x.toString(16),getLongRep:x=>x.toString(16)};
 vm.createContext(context);
 for(const name of['cart','dsp','spc','apu','pipu','cpu','snes'])vm.runInContext(readFileSync(`vendor/snes/${name}.js`,'utf8'),context);
 const snes=new context.Snes();snes.loadRom(new Uint8Array(readFileSync(rom)),true);snes.reset(true);
 restore(snes,{...JSON.parse(readFileSync(fixture)),romHash:hash(snes.cart.data)});
 const r=snes.ram,word=a=>r[a]|r[a+1]<<8,signed=a=>(word(a)^0x8000)-0x8000;
 const mod={options:{enabled:true,superSaiyan:false},gokuActive:true,canAttack:true,worldFlight:false,charging:false,charge:0,frame:0,
  entities:()=>Array.from({length:12},(_,index)=>{const base=0xe000+index*0x200;return{index,base,active:!!(r[base]&1),species:r[base+0x180],hp:word(base+0x182),maxHp:word(base+0x184),screenX:signed(base+0x20),screenY:signed(base+0x22)};}),
  read16:word,playSound(){},radio:{say(){}},challenge:{status:{fed:false}},frieza:{trial:false,status:{}}};
 const scouter=createScouter(snes,mod);
 // Event 583's grant (39 02 CB 38, 30 AB 02): Primm knows Sylphid's spells.
 r[0xe3cb]|=0x38;r[0xcf00+sylphidFlag]=2;scouter.setEnabled(true);
 const cpu=snes.cpu,cycle=cpu.cycle,landings=[];let frame=0;
 cpu.cycle=function(){
  if(this.cyclesLeft===0&&(this.r[1]&63)===0&&this.br[4]===0x3f94)landings.push({frame,target:this.br[1],caster:this.br[2],spell:r[0xe170+(this.br[2]&0x1fff)]});
  return cycle.call(this);
 };
 cpu.registerBreakpoints?.(cpu.cycle,cycle,[[0,0x3f94]]);
 const run=(n,buttons=0)=>{for(let i=0;i<n;i++){snes.joypad1State=buttons;snes.runFrame(true);mod.frame++;frame++;scouter.tick();}snes.joypad1State=0;};
 const press=(bit,times=1)=>{for(let i=0;i<times;i++){run(4,1<<bit);run(50);}};
 const [B,UP,LEFT,X]=[0,4,6,9];
 run(30);
 assert.equal(scouter.status.readouts.find(x=>x.key===0xe600)?.source,'scouter','the scan reads the Rabite');
 // Native X opens member 1's ring (Primm), up twice reaches magic; Sylphid,
 // Analyzer (left twice) and the Rabite under the cursor.
 press(X);press(UP,2);
 assert.deepEqual([r[0x1808],r[0x1809]],[1,1]);
 press(B);press(LEFT,2);press(B);press(B);
 assert.equal(r[0xe370],analyzerSpell,'Primm casts Analyzer');
 let marked=null;
 for(let i=0;i<400&&!marked;i++){run(1);const x=scouter.status.readouts.find(x=>x.key===0xe600);if(x?.source==='analyzer')marked={...x,frame};}
 assert.deepEqual(landings.map(({target,caster,spell})=>({target,caster,spell})),[{target:0x600,caster:0x200,spell:analyzerSpell}]);
 assert.ok(marked,'the Analyzer landing marks the Rabite');
 assert.ok(marked.frame-landings[0].frame<=1&&marked.age<=1,JSON.stringify({marked,landing:landings[0]}));
});
