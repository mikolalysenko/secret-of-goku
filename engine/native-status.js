import {encodeText,decodeText} from './event-codec.js';
import {powerLevel,formatPower} from './scouter.js';

// Read the same live values as combat. In particular, Saiyan attack is not
// the byte-sized retail weapon attack, and a power level is a ki reading,
// not an extra damage multiplier. Never write gameplay state while drawing.
export function gokuStats(mod){
 const byte=a=>mod.read8(a),word=a=>mod.read16(a);
 return{
  form:mod.options.superSaiyan?'SUPER SAIYAN':'SAIYAN',weighted:!!mod.equipment?.weighted,
  level:byte(0xe181)+1,hp:word(0xe182),maxHp:word(0xe184),power:powerLevel(mod,{index:0}),
  strength:byte(0xe188),agility:byte(0xe189),constitution:byte(0xe18a),intelligence:byte(0xe18b),wisdom:byte(0xe18c),
  attack:mod.damageScale(),hit:byte(0xe197),defense:word(0xe1a5),evade:byte(0xe1a4),magicDefense:word(0xe1a8),
  // C0:29FC counts the eight native seed flags which are exactly 1.
  mana:Array.from({length:8},(_,i)=>byte(0xcf90+i)).filter(v=>v===1).length,
  money:word(0xcc6a)|(byte(0xcc6c)<<16),
 };
}

export function isGokuStatus(snes,mod){
 const p=snes.ppu,r=snes.ram,v=p.vram;
 // The native STATUS ring item, selected for Goku, plus its exact three
 // left panels and tall right panel. Saves, gear, action grids and companions
 // all keep their own native UI. The original menu still owns all inputs.
 return !!(mod.options.enabled&&mod.options.power&&mod.gokuActive&&p.mode===5&&
  r[0x2c]===3&&!(r[0xec]&0xfe)&&r[0x1808]===0&&r[0x19fe]===0&&r[0x1809]===2&&r[0x180a]===2&&
  p.tilemapAdr[1]===0x5800&&v[0x5820]===0x2020&&v[0x5830]===0x2020&&
  v[0x59c0]===0xa020&&v[0x5b10]===0xa020);
}

const white=0x739c,gold=0x2fff,red=0x285f,dim=0x294a;
export function statusPixels(rom,stats,name='GOKU'){
 // Mode 5 has 512 horizontal pixels and 224 scanlines. Use the cartridge's
 // actual 8x12 font and window cells, with integer placement at this scale.
 const pixels=new Uint16Array(512*224);
 const put=(x,y,c)=>{if(x>=0&&x<512&&y>=0&&y<224)pixels[y*512+x]=c+1;};
 function tile(id,x,y,flipX=false,flipY=false){
  for(let py=0;py<8;py++)for(let px=0;px<8;px++){
   const at=0x12d080+id*16+(flipY?7-py:py)*2,bit=flipX?px:7-px;
   const index=(rom[at]>>bit&1)|(rom[at+1]>>bit&1)<<1;
   if(index)for(let dx=0;dx<2;dx++)put(x+px*2+dx,y+py,[0,0,0x5250,white][index]);
  }
 }
 function window(x,y,w,h){
  for(let dx=0;dx<w;dx+=16){const end=dx===0||dx===w-16;tile(end?0:1,x+dx,y,dx>=w/2);tile(end?0:1,x+dx,y+h-8,dx>=w/2,true);}
  for(let dy=8;dy<h-8;dy+=8){tile(3,x,y+dy);tile(3,x+w-16,y+dy,true);}
 }
 function text(value,x,y,{color=white,scale=1,right=false}={}){
  const codes=encodeText(String(value));if(right)x-=codes.length*8*scale;
  const points=[];
  codes.forEach((code,col)=>{for(let py=0;py<12;py++)for(let px=0;px<8;px++)if(rom[0x12d600+code*12+py]>>(7-px)&1)
   for(let dx=0;dx<scale;dx++)points.push([x+(col*8+px)*scale+dx,y+py]);});
  for(const[x,y]of points){put(x+1,y+1,0);put(x-1,y,0);}
  for(const[x,y]of points)put(x,y,color);
 }
 window(0,8,256,112);window(256,8,256,192);window(0,120,256,48);window(0,168,256,32);
 text(name,80,18);text('LEVEL',80,34);text(stats.level,232,34,{right:true});
 text('HP',80,50);text(`${stats.hp}/${stats.maxHp}`,232,50,{right:true});
 text(stats.form,16,68,{color:gold});
 text('POWER LEVEL',16,83);
 text(formatPower(stats.power),240,98,{color:gold,scale:2,right:true});
 text(stats.weighted?'HEAVY GI / TRAINING':'WEIGHTS OFF',16,130,{color:gold});
 text(stats.weighted?'POWER -10%  AGILITY -20%':'NO TRAINING PENALTY',16,146);
 text(`MANA ${stats.mana}`,16,179);text(`${formatPower(stats.money)} GP`,240,179,{right:true});
 text('OFF THE SCALE!',272,17,{color:gold});
 const rows=[['STRENGTH','strength',255],['AGILITY','agility',100],['CONSTITUTION','constitution',100],
  ['INTELLIGENCE','intelligence',100],['WISDOM','wisdom',100],['ATTACK','attack',8191],['HIT %','hit',100],
  ['DEFENSE','defense',999],['EVADE %','evade',100],['MAGIC DEF','magicDefense',999]];
 rows.forEach(([label,key,max],i)=>{
  const y=34+i*15,value=stats[key],color=['strength','attack','defense','magicDefense'].includes(key)?gold:white;
  text(label,272,y);text(formatPower(value),496,y,{right:true,color});
  // A bounded, two-tone meter. It cannot wrap into Goku's portrait or
  // another row when an attack goes thousands beyond the retail limit.
  const filled=Math.min(96,Math.round(96*value/max));
  for(let x=0;x<96;x++)for(let dy=0;dy<2;dy++)put(400+x,y+12+dy,x<filled?(dy?red:gold):dim);
 });
 return pixels;
}

export function createNativeStatus(snes,mod){
 const p=snes.ppu,previous=p.getColor;
 let frame=-1,active=false,raster=null,key='';
 p.getColor=function(sub,x,y){
  if(frame!==mod.frame){
   frame=mod.frame;active=isGokuStatus(snes,mod);
   if(active){
    const stats=gokuStats(mod),r=snes.ram,end=r.indexOf(0,0xcc00),name=decodeText(r.slice(0xcc00,Math.min(end,0xcc06)));
    const next=JSON.stringify([stats,name]);if(next!==key){key=next;raster=statusPixels(snes.cart.data,stats,name);}
   }
  }
  if(!active||this.mode!==5)return previous.call(this,sub,x,y);
  // Replace only the native text/window layer. Its animated green texture,
  // Goku's real menu sprite, brightness, fades and color math stay native.
  const screens=sub?this.subScreenEnabled:this.mainScreenEnabled,enabled=screens[1];
  let color;try{screens[1]=false;color=previous.call(this,sub,x,y);}finally{screens[1]=enabled;}
  const pixel=raster[y*512+x*2+(sub?0:1)];return pixel?[pixel-1,1,3]:color;
 };
 return{get active(){return isGokuStatus(snes,mod);},get stats(){return gokuStats(mod);},dispose(){p.getColor=previous;}};
}
