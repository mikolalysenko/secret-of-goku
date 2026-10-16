import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
test.setTimeout(180000);
async function start(page,kind){
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/?start=${kind}`);await page.waitForFunction(()=>window.mana?.ready&&mana.mod.frieza.fighting,{},{timeout:45000});
 await page.evaluate(()=>{mana.pause();mana.run(1);});return errors;
}

test('phase two retreats after its reveal and counters repeated melee; a finishing wave completes before the cut',async({page})=>{
 const errors=await start(page,'battle');
 const result=await page.evaluate(()=>{
  const m=mana.mod,base=mana.snapshot(),stock=[...mana.snes.ram.slice(0xcc48,0xcc54)].find(n=>(n&31)===5);
  m.frieza.hit(m.frieza.entity(),1e8);mana.run(380);
  const entrance=m.frieza.status.boss,first={hp:entrance.hp,x:entrance.x,y:entrance.y,guard:entrance.guard,dash:entrance.dash};
  m.action={kind:'punch'};const protectedHit=m.frieza.hit(m.frieza.entity(),100000).before-m.frieza.status.hp;m.action=null;
  mana.run(60);const escaped=m.frieza.status.boss;
  // Two close hits provoke a committed strike before his guarded retreat.
  let s=m.frieza.snapshot();s.boss.guard=0;s.boss.stun=0;s.boss.dash=0;s.boss.warning=null;s.boss.clock=999;s.boss.shots=[];s.boss.age=501;m.frieza.restore(s);
  m.action={kind:'punch'};m.frieza.hit(m.frieza.entity(),8191);m.frieza.hit(m.frieza.entity(),8191);m.action=null;
  const counter=m.frieza.status.boss;mana.run(65);const warning=m.frieza.status.boss.warning;
  // Land a normal fully charged wave with only one hit left in this phase.
  mana.restore(base);s=m.frieza.snapshot();Object.assign(s.boss,{tier:1,muscular:true,hp:32001,clock:9999,age:501,guard:0,stun:200,shots:[],warning:null});m.frieza.restore(s);
  const boss=m.frieza.entity();m.write16(0xe002,boss.x);m.write16(0xe004,boss.y+52);m.write8(0xe010,0);m.teleport.follow({x:boss.x,y:boss.y+52,terrain:2,layer:0});mana.run(70);
  mana.run(50,[10,1]);mana.run(1);const max=m.effects.find(e=>e.kind==='beam')?.life;
  let thresholdFrame=null,cutFrame=null,lastBeam=null;
  for(let i=0;i<90;i++){mana.run(1);const beam=m.effects.find(e=>e.kind==='beam');if(beam)lastBeam=i;if(m.frieza.status.hp===32000&&thresholdFrame===null)thresholdFrame=i;if(m.frieza.cinematic||m.frieza.status.boss.surge){cutFrame=i;break;}}
  return{stock,first,protectedHit,escaped:{x:escaped.x,y:escaped.y},counter:{guard:counter.guard,riposte:counter.riposte},warning:warning?.kind,max,thresholdFrame,cutFrame,lastBeam};
 });
 expect(result.stock).toBe(0xa5);expect(result.first.guard).toBeGreaterThan(0);expect(result.first.dash).toBeGreaterThan(0);expect(result.protectedHit).toBe(0);
 expect([result.escaped.x,result.escaped.y]).not.toEqual([result.first.x,result.first.y]);expect(result.counter.guard).toBeGreaterThan(0);expect(result.counter.riposte).toEqual({age:0});expect(result.warning).toBe('laser');
 expect(result.max).toBe(64);expect(result.thresholdFrame).toBeLessThan(20);expect(result.cutFrame).toBeGreaterThanOrEqual(63);expect(result.lastBeam).toBeGreaterThanOrEqual(61);expect(errors).toEqual([]);
});

test('phase two punishes repeated teleport melee while leaving time to fly out of the counter',async({page})=>{
 const errors=await start(page,'battle');
 const result=await page.evaluate(()=>{
  const m=mana.mod;m.frieza.hit(m.frieza.entity(),1e8);mana.run(450);
  let s=m.frieza.snapshot();Object.assign(s.boss,{guard:0,stun:0,grace:0,dash:0,windup:0,warning:null,shots:[],clock:9999,age:601,meleeHits:0});m.frieza.restore(s);
  mana.run(1,[10,0]);mana.run(45);
  // The first hit is accepted without a counter. A second immediately
  // after another transmission commits Frieza to a close-range retaliation.
  m.action={kind:'punch'};const hp=m.frieza.status.hp;m.frieza.hit(m.frieza.entity(),8191);m.action=null;
  const first={damage:hp-m.frieza.status.hp,riposte:m.frieza.status.boss.riposte??null};
  mana.run(1,[10,0]);mana.run(16);
  m.action={kind:'punch'};m.frieza.hit(m.frieza.entity(),8191);m.action=null;
  const saved=mana.snapshot(),before=m.status.hp,armed=!!m.frieza.status.boss.riposte;
  // A third transmission stays in range. The native damage worker consumes
  // the counter; it must not be canceled by repeated teleport inputs.
  mana.run(1,[10,0]);mana.run(30);
  const spam=before-m.status.hp;
  mana.restore(saved);
  // Fly away with actual controls during the tell, not a position write.
  const b=m.frieza.status.boss,dx=m.status.x-b.x,dy=m.status.y-12-b.y;
  const direction=Math.abs(dx)>Math.abs(dy)?dx<0?6:7:dy<0?4:5;
  mana.run(30,[8,direction]);const dodge=before-m.status.hp;
  return{first,armed,spam,dodge,can:m.canAttack,error:m.story.status.error};
 });
 expect(result.first.damage).toBeGreaterThan(0);expect(result.first.riposte).toBe(null);expect(result.armed).toBe(true);
 expect(result.spam).toBeGreaterThanOrEqual(200);expect(result.dodge).toBe(0);expect(result.can).toBe(true);expect(result.error).toBe(null);expect(errors).toEqual([]);
});

for(const kind of['battle','space'])test(`${kind}: native ring uses a stocked Senzu; fatal damage destroys the planet instead of retrying`,async({page})=>{
 const errors=await start(page,kind);
 const result=await page.evaluate(()=>{
  const m=mana.mod,base=mana.snapshot();m.write16(0xe182,500);
  mana.run(2,[9]);mana.run(70);mana.run(3,[4]);mana.run(60);mana.run(3,[7]);mana.run(60);
  const opened=!!(m.read8(0xec)&12),clock=m.frieza.status.boss.age;mana.run(60);const paused=clock===m.frieza.status.boss.age;
  mana.run(3,[0]);mana.run(70);mana.run(3,[0]);mana.run(180);
  const healed={hp:m.status.hp,stock:[...mana.snes.ram.slice(0xcc48,0xcc54)].find(n=>(n&31)===5),canAttack:m.canAttack,space:!!m.frieza.orbit};
  mana.restore(base);mana.run(1);m.write16(0xe1f1,2000);m.write8(0xe1f0,0);m.write8(0xe1ec,0);mana.run(180);
  const defeated={hp:m.status.hp,map:m.status.map,frozen:mana.battleRetry.defeated,phase:mana.battleRetry.encounter};
  const retried=mana.battleRetry.retry();mana.run(Math.max(0,360-m.ending.status.age));
  const nativeFrames=mana.snes.frames;mana.run(600);
  const loss={hp:m.status.hp,map:m.status.map,gameOver:mana.battleRetry.gameOver,phase:m.ending.status.phase,canAttack:m.canAttack,nativeFrozen:mana.snes.frames===nativeFrames};
  return{opened,paused,healed,defeated,retried,loss};
 });
 expect(result.opened&&result.paused).toBe(true);expect(result.healed).toEqual({hp:999,stock:0x85,canAttack:true,space:kind==='space'});
 expect(result.defeated).toEqual({hp:0,map:246,frozen:true,phase:kind==='space'?'frieza:2':'frieza:0'});
 expect(result.retried).toBe(false);expect(result.loss).toEqual({hp:0,map:246,gameOver:true,phase:'gameover',canAttack:false,nativeFrozen:true});expect(errors).toEqual([]);
});

test('the orbital wave stays attached to Goku through movement, teleport and melee inputs',async({page})=>{
 const errors=await start(page,'space');
 const result=await page.evaluate(()=>{
  const m=mana.mod,s=m.frieza.snapshot();s.boss.clock=9999;s.boss.shots=[];s.boss.warning=null;m.frieza.restore(s);
  mana.run(50,[10,1]);mana.run(1);const before={...m.frieza.orbit.hero};
  mana.run(3,[10,0,7]);mana.run(1);mana.run(3,[0,7]);
  const o=m.frieza.orbit,colors=new Set();let whole=true;
  for(let f=0;f<6;f++)for(const size of[16,32,48,64,80])m.kiArt.draw('death',f,80.2,90.4,size,(x,y,c)=>{colors.add(c);whole&&=Number.isInteger(x)&&Number.isInteger(y);});
  return{before,hero:o.hero,beam:{x:o.beam.x,y:o.beam.y,heading:o.beam.heading},teleport:o.teleport,punch:o.punch,colors:colors.size,whole};
 });
 expect(result.hero).toEqual(result.before);expect(result.beam).toMatchObject(result.before);expect(Number.isInteger(result.beam.heading)).toBe(true);
 expect(result.teleport).toBe(0);expect(result.punch).toBe(0);expect(result.colors).toBeLessThanOrEqual(15);expect(result.whole).toBe(true);expect(errors).toEqual([]);
});

test('ground attacks have single projectiles, reduced damage, beam counters and working flight/IT after a hit',async({page})=>{
 const errors=await start(page,'battle');
 const result=await page.evaluate(()=>{
  const m=mana.mod,base=mana.snapshot(),volleys=[];
  for(let cycle=0;cycle<3;cycle++){
   mana.restore(base);const state=m.frieza.snapshot();Object.assign(state.boss,{cycle,clock:1,age:501,shots:[],warning:null});m.frieza.restore(state);
   mana.run(67);volleys.push(m.frieza.status.boss.shots.map(s=>s.kind));
  }
  mana.restore(base);let state=m.frieza.snapshot();Object.assign(state.boss,{clock:9999,age:501,grace:0,shots:[{kind:'orb',x:m.status.x-3,y:m.status.y-12,angle:0,speed:3,age:15,trail:[]}]});m.frieza.restore(state);
  mana.run(20,[10,1]);const hurt={hp:m.status.hp,charging:m.charging,attackBlocked:m.attackBlocked};
  let recovery=0;for(;recovery<90&&!m.canAttack;recovery++)mana.run(1);mana.run(2);
  const x=m.status.x;mana.run(6,[8,7]);const travelled=m.status.x-x;
  const teleported=m.instantTransmission();mana.run(75);const settled={pending:m.teleport.pending,canAttack:m.canAttack,x:m.status.x,y:m.status.y};
  // Use the normal beam collision against both enemy projectile types.
  mana.restore(base);const origin={x:m.status.x,y:m.status.y-12};m.effects.push({...origin,kind:'beam',dx:-1,dy:0,life:50,max:64,mega:true,width:80,range:640,strength:1,super:true,damage:0,hits:[],pulses:{}});
  state=m.frieza.snapshot();Object.assign(state.boss,{clock:9999,age:501,shots:['orb','disc'].map(kind=>({kind,x:origin.x-36,y:origin.y,angle:0,speed:3,age:15,trail:[]}))});m.frieza.restore(state);mana.run(2);
  const countered=m.frieza.status.boss.shots.length;
  return{volleys,hurt,recovery,travelled,teleported,settled,countered};
 });
 expect(result.volleys).toEqual([['orb'],['disc'],['laser']]);expect(result.hurt).toEqual({hp:844,charging:false,attackBlocked:true});expect(result.recovery).toBeLessThan(90);expect(result.travelled).toBeGreaterThan(20);expect(result.teleported).toBe(true);
 expect(result.settled).toMatchObject({pending:false,canAttack:true});expect(Number.isInteger(result.settled.x)&&Number.isInteger(result.settled.y)).toBe(true);expect(result.countered).toBe(0);expect(errors).toEqual([]);
});
