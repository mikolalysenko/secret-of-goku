// Goku's scouter and power-level readouts for the native Analyzer spell.
// The scouter is owned once Sylphid's powers are granted ($CFAB >= 2): it is
// derived from native progress, so saves and checkpoints already carry it.
// L+X scans everyone on screen. Analyzer (spell 17h, Primm's Sylphid magic)
// shows its target's power level beside the native readout: the native hit
// context stores the incoming spell in the target's +181h byte (C0:D453).
// A PPU overlay like the radar; no cartridge bytes or event scripts change.
export const analyzerSpell=0x17;
export const sylphidFlag=0xab;
const lifetime=240,green=4|31<<5|8<<10,shadow=0x0421;

// Project-authored 3x5 digits (plus comma), drawn with a 1px dark outline.
const font={
 0:['111','101','101','101','111'],1:['010','110','010','010','111'],2:['111','001','111','100','111'],
 3:['111','001','111','001','111'],4:['101','101','111','001','001'],5:['111','100','111','001','111'],
 6:['111','100','111','101','111'],7:['111','001','010','010','010'],8:['111','101','111','101','111'],
 9:['111','101','111','001','111'],',':['000','000','000','010','100'],
};
export const formatPower=n=>Math.round(n).toLocaleString('en-US');

// Canon numbers for Goku and Frieza; everyone else scales with max HP so a
// Rabite reads in the tens and late bosses in the tens of thousands.
export function powerLevel(mod,entity){
 if(entity.custom==='frieza')return mod.frieza?.status.boss?.muscular?120_000_000:60_000_000;
 if(entity.index===0){
  const base=mod.options.superSaiyan?150_000_000:90_000;
  const charge=mod.charging?Math.min(1,mod.charge/(mod.options.superSaiyan?45:90)):0;
  return Math.round(base*(1+charge)*(mod.equipment?.powerScale??1));
 }
 let level=Math.max(1,entity.maxHp)*(entity.index<3?3:4);
 if(mod.challenge?.status.fed&&mod.read16(0xdc)===253)level*=4;   // seven seeds fed to the Beast
 if(mod.frieza?.trial)level*=10;                                  // Frieza's ki in Thanatos
 // Two significant figures, like a scouter that has not settled yet.
 const scale=10**Math.max(0,Math.floor(Math.log10(level))-1);
 return Math.round(level/scale)*scale;
}

export function createScouter(snes,mod){
 const p=snes.ppu,previous=p.getColor,write=snes.write,r=snes.ram;
 let readouts=new Map(),scans=0,jokes=new Set(),lastChord=false,frame=-1,overlay=null,radioShown=false;
 const owned=()=>r[0xcf00+sylphidFlag]>=2;
 const visibleState=()=>mod.options.enabled&&mod.gokuActive&&!p.forcedBlank&&!mod.worldFlight&&!mod.worldKi?.cinematic&&!mod.frieza?.cinematic&&!mod.ending?.active;
 const actors=()=>mod.entities().filter(e=>e.active&&(e.hp>0)&&(e.index<3||e.species<128||e.custom==='frieza')&&e.species!==0x55&&
  e.screenX>-16&&e.screenX<272&&e.screenY>-16&&e.screenY<240);
 // Analyzer hits: the cartridge writes the spell into the target's +181h.
 snes.write=function(address,value,dma=false){
  const result=write.call(this,address,value,dma),low=address&0xffff,bank=address>>>16&255;
  if(value===analyzerSpell&&bank===0x7e&&low>=0xe000&&low<0xf800&&(low-0xe000)%0x200===0x181&&mod.options.enabled)
   readouts.set(low-0x181,{age:0,source:'analyzer'});
  return result;
 };
 function joke(key,text){if(jokes.has(key))return;jokes.add(key);mod.radio?.say(text,{frames:260,kind:'scouter'});}
 function scan(){
  scans++;mod.playSound?.('teleport');
  for(const e of actors())readouts.set(e.custom==='frieza'?'frieza':e.base,{age:0,source:'scouter'});
  const frieza=mod.frieza?.entity?.();
  if(mod.options.superSaiyan)joke('gold','KING KAI:The scouter is\nSMOKING! What did you do?\nGOKU:Went gold. Oops.');
  else if(frieza)joke('frieza','KING KAI:SIXTY MILLION!\nAnd he is holding back!\nGOKU:Great! So am I!');
  else joke('goku',mod.equipment?.weighted?"GOKU:It's OVER 9000!\nKING KAI:And that is with\nyour training weights on!":"GOKU:It's OVER 9000!\nKING KAI:It says NINETY\nTHOUSAND. Do not gloat.");
 }
 function draw(){
  frame=mod.frame;overlay=null;radioShown=!!mod.radio?.status?.visible;
  if(!readouts.size||!visibleState())return;
  overlay=new Uint16Array(256*224);
  const put=(x,y,c)=>{if(x>=0&&x<256&&y>=0&&y<224)overlay[y*256+x]=c+1;};
  const all=new Map(actors().map(e=>[e.custom==='frieza'?'frieza':e.base,e]));
  for(const[key,readout]of readouts){
   const e=all.get(key);if(!e)continue;
   const blink=readout.age<24&&readout.age%8<4;if(blink)continue;
   const text=formatPower(powerLevel(mod,e)),width=text.length*4-1,cx=e.screenX,top=e.screenY-40;
   // Reticle corners around the body, then the reading above it.
   const box=[cx-12,e.screenY-28,cx+12,e.screenY+2];
   for(const[x0,y0,dx,dy]of[[box[0],box[1],1,1],[box[2],box[1],-1,1],[box[0],box[3],1,-1],[box[2],box[3],-1,-1]])
    for(let i=0;i<4;i++){put(x0+dx*i,y0,green);put(x0,y0+dy*i,green);}
   const glyphs=[];
   [...text].forEach((ch,i)=>font[ch]?.forEach((row,y)=>[...row].forEach((bit,x)=>{if(bit==='1')glyphs.push([cx-(width>>1)+i*4+x,top+y]);})));
   for(const[x,y]of glyphs)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!overlay[(y+dy)*256+x+dx])put(x+dx,y+dy,shadow);
   for(const[x,y]of glyphs)put(x,y,green);
  }
 }
 p.getColor=function(sub,x,y){
  const color=previous.call(this,sub,x,y);
  if(sub||!readouts.size)return color;
  if(frame!==mod.frame)draw();
  // King Kai's radio window (rows 8-72) stays readable over the readouts.
  if(y<72&&radioShown)return color;
  const pixel=overlay?.[y*256+x];
  return pixel?[pixel-1,4,0x86]:color;
 };
 return{
  // Called from the input pipeline. Returns true when L+X belongs to the
  // scouter, so the ring tap must not reach the cartridge.
  chord(input,controlled){
   const held=!!(input&0x400)&&!!(input&0x200),usable=held&&controlled&&mod.canAttack&&owned()&&!mod.worldFlight;
   if(usable&&!lastChord)scan();
   lastChord=held;
   return usable||(held&&owned()&&controlled);
  },
  tick(){
   for(const[key,readout]of readouts)if(++readout.age>lifetime)readouts.delete(key);
   if(!mod.options.enabled)readouts.clear();
  },
  get owned(){return owned();},
  get status(){return{owned:owned(),scans,readouts:[...readouts].map(([key,v])=>({key,...v})),jokes:[...jokes]};},
  snapshot(){return{version:1,jokes:[...jokes],scans};},
  restore(saved){readouts=new Map();lastChord=false;jokes=new Set(saved?.jokes??[]);scans=saved?.scans??0;},
  dispose(){p.getColor=previous;snes.write=write;},
 };
}
