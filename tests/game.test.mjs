import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Game} from '../src/game.js';
import {MAPS,NPCS,LANDINGS,POTOS_WORLD} from '../src/data.js';
const rom=JSON.parse(await readFile(new URL('../assets/data/potos-rom.json',import.meta.url)));
const make=()=>{const g=new Game();g.romMaps=rom;g.start();return g;};
const input=(down=[],pressed=[],released=[],x=0,y=0)=>({down:new Set(down),pressed:new Set(pressed),released:new Set(released),x,y});
const advance=(g,frames,i=input())=>{for(let n=0;n<frames;n++)g.step(1/60,i);};
const finishDialogue=g=>{let n=0;while(g.dialogue&&n++<30)g.advanceDialogue();assert.equal(g.dialogue,null);};

function reachable(g){
  const start=[Math.round((g.player.x-4)/8),Math.round((g.player.y-4)/8)],q=[start],seen=new Set([start.join(',')]);
  for(let i=0;i<q.length;i++)for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=q[i][0]+dx,ny=q[i][1]+dy,k=`${nx},${ny}`;
    if(!seen.has(k)&&g.walkable(nx*8+4,ny*8+4)){seen.add(k);q.push([nx,ny]);}
  }
  return q.map(([x,y])=>({x:x*8+4,y:y*8+4}));
}

test('ROM terrain connects spawn to all Potos doors, villagers, and the Mantis hole',()=>{
  const g=make(),points=reachable(g);assert.ok(points.length>2000);
  for(const p of [...MAPS.potos.doors,...NPCS.filter(n=>n.map==='potos'),{x:488,y:467}]){
    assert.ok(points.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<23),`${p.name||'Mantis hole'} is unreachable`);
  }
  assert.equal(g.walkable(20,20),false,'forest is solid');
  assert.equal(g.walkable(240,280),false,'house is solid');
});

test('tap attack punches; holding the same input waits, charges, and fires on release',()=>{
  const g=make();g.step(1/60,input(['attack'],['attack']));advance(g,5,input(['attack']));g.step(1/60,input([],[],['attack']));
  assert.equal(g.stats.punches,1);assert.equal(g.stats.beams,0);
  advance(g,30);g.step(1/60,input(['attack'],['attack']));advance(g,120,input(['attack']));
  assert.equal(g.stats.beams,0,'charge must not auto-fire');assert.equal(g.stats.punches,1);assert.equal(g.chargeFraction,1);
  g.step(1/60,input([],[],['attack']));assert.equal(g.stats.beams,1);assert.equal(g.player.charging,false);assert.ok(g.player.ki<80);
});

test('a punch launches an original 20 HP Rabite; a beam destroys targets farther away',()=>{
  const g=make(),e=g.enemies[0];g.player.x=e.x-25;g.player.y=e.y;g.player.facing='right';g.punch();
  assert.equal(e.hp,0);assert.equal(e.state,'launched');assert.ok(e.vx>=400);assert.equal(g.stats.damage,9001);
  const target=g.enemies[2];g.player.x=target.x-120;g.player.y=target.y;g.player.facing='right';g.beam(1);
  assert.equal(target.hp,0);assert.ok(target.vx>=700);assert.equal(g.activeNPCs.length,6);
});

test('Super Saiyan raises power, charges faster, and permits more punches per second',()=>{
  const base=make(),superGame=make();superGame.castTechnique(0);assert.equal(superGame.power,450050);
  for(const g of [base,superGame]){g.step(1/60,input(['attack'],['attack']));advance(g,58,input(['attack']));}
  assert.equal(superGame.chargeFraction,1);assert.ok(base.chargeFraction<.6);
  for(const g of [base,superGame]){g.cancelCharge();advance(g,60,input(['punch']));}
  assert.ok(superGame.stats.punches>=base.stats.punches*2.5);
});

test('obliterating the gate creates a walkable route to the chapter exit',()=>{
  const g=make(),gate=g.activeObstacles.find(o=>o.id==='gate');
  assert.equal(g.walkable(gate.x,gate.y),false);
  assert.ok(!reachable(g).some(p=>p.y>800));
  g.player.x=gate.x;g.player.y=gate.y-35;g.player.facing='down';g.beam(1);
  assert.ok(g.destroyed.has('gate'));assert.ok(g.walkable(gate.x,gate.y));assert.ok(reachable(g).some(p=>p.y>800));
  assert.equal(g.breaks.filter(b=>b.id==='gate').length,1);g.breakObstacle(gate);assert.equal(g.breaks.filter(b=>b.id==='gate').length,1);
});

test('early flight can land past the locked gate and returns from distant world coordinates',()=>{
  const g=make();g.takeOff();assert.equal(g.mode,'flight');assert.ok(g.breaks.some(b=>b.id==='earlyFlight'));
  g.flight.x=10;g.flight.y=10;assert.equal(g.land(),false);assert.equal(g.mode,'flight');
  g.step(1/60,input([],['home','slot3']));assert.equal(g.flight.x,POTOS_WORLD.x);assert.equal(g.flight.y,POTOS_WORLD.y);
  g.land();assert.equal(g.mode,'play');assert.equal(g.player.x,LANDINGS[2].x);assert.equal(g.player.y,LANDINGS[2].y);assert.ok(g.walkable(g.player.x,g.player.y));
  assert.ok(g.breaks.some(b=>b.id==='gateFlight'));
});

test('all five rooms have valid entrances and reachable exit interaction points',()=>{
  const g=make();
  for(const door of MAPS.potos.doors){g.enterMap(door.to,...door.spawn);assert.ok(g.walkable(g.player.x,g.player.y),door.name);
    assert.ok(reachable(g).some(p=>Math.hypot(p.x-g.level.exit.x,p.y-g.level.exit.y)<25),`${door.name} exit`);
  }
});

test('Elder, Mantis, rescue, and banishment dialogue form a completable Potos story',()=>{
  const g=make();g.talk('elder');finishDialogue(g);assert.equal(g.flags.metElder,true);
  g.enterCave();finishDialogue(g);g.player.x=227;g.player.y=225;g.player.facing='up';g.beam(1);assert.equal(g.flags.bossDefeated,true);
  advance(g,110);assert.ok(g.dialogue);finishDialogue(g);assert.equal(g.map,'potos');assert.ok(g.walkable(g.player.x,g.player.y));
  g.talk('elder');finishDialogue(g);assert.equal(g.flags.banished,true);assert.equal(g.flags.gateOpen,true);
  g.takeOff();g.land();assert.ok(g.breaks.some(b=>b.id==='return'));
});

test('senzu chest pays once; a saved adventure restores progress without pending effects',()=>{
  const g=make();g.enterMap('store',80,159);g.interact();finishDialogue(g);assert.equal(g.stats.beans,5);
  g.interact();finishDialogue(g);assert.equal(g.stats.beans,5);
  g.transform();g.destroyed.add('gate');g.takeOff(); // Indoors: remains safely on foot.
  const fresh=make();assert.equal(fresh.load(g.serialize()),true);assert.equal(fresh.map,'store');assert.equal(fresh.player.super,true);assert.equal(fresh.stats.beans,5);assert.ok(fresh.destroyed.has('gate'));assert.equal(fresh.player.charging,false);
});

test('invalid or partial saved data cannot strand the player or crash loading',()=>{
  const g=make();assert.equal(g.load({}),false);const saved=g.serialize();saved.player.x=99999;saved.destroyed={};saved.defeated='bad';saved.breaks=[null];
  assert.equal(g.load(saved),true);assert.deepEqual({x:g.player.x,y:g.player.y},MAPS.potos.spawn);assert.ok(g.walkable(g.player.x,g.player.y));
});
