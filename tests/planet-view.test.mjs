import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {decodePlanetTexture} from '../engine/world-texture.js';
import {readWorldMap} from '../tools/rom/world.mjs';
import {aerialBeamGeometry,createWorldKi} from '../engine/world-ki.js';
import {createPlanetView} from '../engine/planet-view.js';
import {pullbackStart} from '../engine/frieza-cinematic.js';
import {createNativeEffects} from '../engine/native-effects.js';

test('one forward aerial beam cannot skew with a culled, wrapped or off-centre Fortress',()=>{
  for(const mega of[false,true])for(const end of[{x:0,y:250},{x:255,y:49},{x:128,y:88},{x:-100,y:88}]){
    const g=aerialBeamGeometry({age:16,max:mega?72:32,strength:1,mega,end});
    assert.equal(g.x,128);assert.equal(g.y,88);assert.equal(g.dx,0);assert.equal(g.dy,-1);
    assert.ok(g.length>g.y);assert.ok(g.halfWidth>20);for(const v of Object.values(g))assert.ok(Number.isFinite(v));
  }
});
test('Fortress destruction cuts to space, replays from a checkpoint and queues exactly one native landing',()=>{
  const ram=new Uint8Array(0x20000),snes={ram,cpu:{cycle(){}},cart:{data:new Uint8Array(0x200000)},joypad1State:0};
  const w=(a,n)=>{ram[a]=n;ram[a+1]=n>>8;};w(0xfa,1000);w(0xfc,1000);w(0x128,1000);w(0x12a,700);ram[0xe3]=64;
  const m={options:{enabled:true,superSaiyan:true},gokuActive:true,worldFlight:true,charge:45,charging:true,attackHeld:1,frame:0,beamProfile:()=>({mega:true}),frieza:{unresolved:true},playSound(){},log(){}};
  const ki=createWorldKi(snes,m);ki.tick(0);
  for(let i=0;i<45;i++)ki.tick(0);
  assert.equal(ki.status.fortressDestroyed,true,'Even hostage Balls can be destroyed; this is a bad-ending route');
  assert.ok(ki.cinematic);assert.equal(ki.status.landingQueued,false);
  const saved=ki.snapshot();for(let i=0;i<60;i++)ki.tick(0);const expected=ki.snapshot();
  ki.restore(saved);for(let i=0;i<60;i++)ki.tick(0);assert.deepEqual(ki.snapshot(),expected);
  for(let i=0;i<200;i++){snes.joypad1State=0xfff;ki.tick(0xfff);assert.equal(snes.joypad1State,0);}
  assert.equal(ki.cinematic,null);assert.equal(ki.status.explosion,null);assert.equal(ki.status.landingQueued,true);
  m.worldFlight=false;ki.tick(0);assert.equal(ki.cinematic,null);assert.equal(ki.status.shot,null);
});
test('space globe samples match the independent original world decoder in both palettes',{skip:!existsSync('.local/rom/secret-of-mana-us.sfc')},()=>{
  const rom=readFileSync('.local/rom/secret-of-mana-us.sfc'),texture=decodePlanetTexture(rom),world=readWorldMap(rom);
  for(const night of[false,true])for(let i=0;i<4000;i++){
    const x=i*53%4096,y=i*79%4096,tile=world.tiles[(y>>3)*512+(x>>3)],index=world.tilePixels[tile][(y&7)*8+(x&7)];
    const color=world.palettes[night?'night':'day'][world.paletteAssignments[tile]][index];
    const expected=(color[0]>>3)|((color[1]>>3)<<5)|((color[2]>>3)<<10);
    assert.equal(texture.sample(x,y,night),expected);assert.equal(texture.sample(x+4096,y-4096,night),expected);
  }
});
test('cosmic clash never emits invalid/white underflow pixels below the beam',{skip:!existsSync('.local/rom/secret-of-mana-us.sfc')},()=>{
 const rom=readFileSync('.local/rom/secret-of-mana-us.sfc'),ppu={getColor:()=>[0,0,0]},snes={ppu,cart:{data:rom}};
 const mod={frame:1,options:{enabled:true},gokuActive:true,frieza:{crisisActive:true,cinematic:{kind:'frieza-cosmic',age:pullbackStart+100,target:{x:2000,y:2000}}},spriteLayer:{effects:{},atlas:{}}};
 const scene=createPlanetView(snes,mod);scene.load(rom);let whiteBelow=0;
 for(let y=0;y<224;y++)for(let x=0;x<256;x++){
  const c=ppu.getColor(false,x,y)[0];assert.ok(Number.isInteger(c)&&c>=0&&c<=32767,`invalid color ${c} at ${x},${y}`);
  if(y>160&&c===32767)whiteBelow++;
 }
 assert.equal(whiteBelow,0);scene.dispose();
});

test('the pullback keeps the beam rooted at the globe and scales its width with the planet',{skip:!existsSync('.local/rom/secret-of-mana-us.sfc')},()=>{
 const rom=readFileSync('.local/rom/secret-of-mana-us.sfc'),ppu={getColor:()=>[0,0,0]},snes={ppu,cart:{data:rom}};
 const state={kind:'frieza-cosmic',age:0,target:{x:2000,y:2000}},orbs=[];
 const effects=createNativeEffects(rom,JSON.parse(readFileSync('engine/native-effects.json','utf8')));
 const mod={frame:0,options:{enabled:true},gokuActive:true,frieza:{cinematic:state},spriteLayer:{effects,atlas:{}},kiArt:{draw:(kind,frame,x,y,size)=>orbs.push({x,y,size})}};
 const scene=createPlanetView(snes,mod);scene.load(rom);
 const blue=new Set([...effects['beam-body'],...effects['charge-orb']].flatMap(cell=>[...cell]).filter(Boolean).map(c=>c-1));
 // Independently calculated camera keyframes, in native screen pixels.
 const frames=[{t:60,x:21,y:254,r:211},{t:100,x:48,y:218,r:172},{t:130,x:68,y:190,r:142}];
 let lastWidth=Infinity;
 for(const f of frames){
  mod.frame++;state.age=pullbackStart+f.t;
  const picture=new Uint16Array(256*224);
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){
   const c=ppu.getColor(false,x,y)[0];assert.ok(Number.isInteger(c)&&c>=0&&c<=32767);picture[y*256+x]=c;
  }
  const origin={x:Math.round(f.x+.62*f.r),y:Math.round(f.y-.69*f.r)},dx=Math.SQRT1_2,dy=-Math.SQRT1_2;
  const sample=(along,across=0)=>picture[Math.round(origin.y+dy*along+dx*across)*256+Math.round(origin.x+dx*along-dy*across)];
  assert.ok(blue.has(sample(3)),`Beam must emerge from the globe at frame ${f.t}`);
  assert.ok(blue.has(sample(f.r*.4)),'The same world-space beam center keeps its native spell colors throughout the zoom');
  let width=0;for(let offset=-40;offset<=40;offset++)if(blue.has(sample(f.r*.4,offset)))width++;
  assert.ok(Math.abs(width-26*f.r/104)<4,`Beam width ${width} must shrink with radius ${f.r}`);
  assert.ok(width<lastWidth);lastWidth=width;
  const orb=orbs.at(-1);assert.equal(orb.size%16,0);assert.ok(Math.abs(orb.size-29*f.r/104)<=8,'Death Ball follows the same zoom in discrete sprite sizes');
  assert.ok(Math.abs((orb.x-origin.x)*dy-(orb.y-origin.y)*dx)<=1,'Death Ball stays on the beam axis within one native pixel');
 }
 scene.dispose();
});
