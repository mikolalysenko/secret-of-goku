import {encodeText,wrapText} from './event-codec.js';

// The retail 8x12 font and 2bpp window corners, decoded from the user's ROM.
// This is a PPU message surface, not an event: it never takes controller input
// or opens $D0, so a warning cannot release/cancel a held Kamehameha.
export function radioPixels(rom,text){
  const lines=wrapText(text).split('\n');
  if(lines.length>3)throw Error('Radio message exceeds the native window');
  const pixels=new Uint16Array(240*64),put=(x,y,c)=>{if(x>=0&&x<240&&y>=0&&y<64)pixels[y*240+x]=c+1;};
  const tile=(id,x,y,flipX=false,flipY=false)=>{
    for(let py=0;py<8;py++)for(let px=0;px<8;px++){
      const at=0x12d080+id*16+(flipY?7-py:py)*2,bit=flipX?px:7-px;
      const index=(rom[at]>>bit&1)|(rom[at+1]>>bit&1)<<1;
      if(index)put(x+px,y+py,[0,0,0x5250,0x739c][index]);
    }
  };
  for(let y=8;y<56;y++)for(let x=8;x<232;x++)if((x+(y>>1))%2===0)put(x,y,0x2c00);
  for(let x=0;x<240;x+=8){tile(x===0||x===232?0:1,x,0,x>=120);tile(x===0||x===232?0:1,x,56,x>=120,true);}
  for(let y=8;y<56;y+=8){tile(3,0,y);tile(3,232,y,true);}
  const glyphs=[];
  lines.forEach((line,row)=>encodeText(line).forEach((code,col)=>{
    for(let y=0;y<12;y++)for(let x=0;x<8;x++)if(rom[0x12d600+code*12+y]>>(7-x)&1)glyphs.push([8+col*8+x,10+row*16+y]);
  }));
  for(const[x,y]of glyphs)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)put(x+dx,y+dy,0);
  for(const[x,y]of glyphs)put(x,y,0x7fff);
  return pixels;
}

export const kaiWarnings=[
  'KING KAI:Goku! That is\nenough. The planet lives\nunder your target!',
  'KING KAI:STOP CHARGING!\nI can see that from here.\nI live in the AFTERLIFE!',
  'KING KAI:You are going\ntoo far! There is no prize\nfor killing the horizon!',
  'KING KAI:That is a planet,\nGoku. We keep EVERYONE\nthere. Including lunch!',
  'KING KAI:The Dragon Balls\ncannot wish back my nerves.\nPut the moon DOWN!',
  'KING KAI:I said save Mana!\nNot turn it into a very\nbrief second sun!',
];
export const firstFlightMessages=[
  'GOKU:Hey! The Fortress!\nI could just blow it up.\nBe right back!',
  'LUKA:NO! That could burn\nALL Mana! You broke the\nSword seal. It woke early!',
  'LUKA:Find seven Dragon\nBalls. Wish the boy and\nthe Sword back. GENTLY.',
  'KING KAI:I will shield\nthe people. That is NOT\npermission to shoot!',
];

export function createNativeRadio(snes,mod){
  let current=null,queue=[],held=0,warned=false,warning=0,cooldown=0,firstFlight=false,lastMap=null;
  let raster=null,key=null,visibilityFrame=-1,frameVisible=false;
  const p=snes.ppu,previous=p.getColor;
  const visible=()=>mod.options.enabled&&mod.gokuActive&&!p.forcedBlank&&
    (mod.worldFlight?!(snes.ram[0xfe]&0xc0)&&snes.ram[0x8c]===0&&!(snes.ram[0xe2]&1):mod.canAttack&&!mod.ceiling?.busy)&&
    snes.ram[0xd0]===0&&(snes.ram[0xec]&0x7e)===0&&(mod.worldFlight||!snes.ram[0x2c]);
  p.getColor=function(sub,x,y){
    const color=previous.call(this,sub,x,y);
    // World flight has no bottom HUD. Keep the sky, Fortress and beam clear.
    const top=mod.worldFlight?152:8;
    if(!sub&&current&&x>=8&&x<248&&y>=top&&y<top+64){
      if(visibilityFrame!==mod.frame){visibilityFrame=mod.frame;frameVisible=visible();}
      if(!frameVisible)return color;
      if(key!==current.text){key=current.text;raster=radioPixels(snes.cart.data,key);}
      const pixel=raster[(y-top)*240+x-8];if(pixel)return[pixel-1,4,0x86];
    }
    return color;
  };
  const say=(text,{frames=230,kind='story'}={})=>{encodeText(text);if(wrapText(text).split('\n').length>3)throw Error('Radio message is too long');queue.push({text,remaining:frames,kind});};
  return{
    say,
    tick(){
      if(!mod.options.enabled||!mod.gokuActive){current=null;queue=[];held=0;warned=false;return;}
      // One aside per charge, only after holding full SSJ power for 1.5s.
      // Release/menu cancellation rearms it but never adds a second punchline.
      if(!mod.charging||!mod.options.superSaiyan){held=0;warned=false;}
      if(mod.worldKi?.status.fortressDestroyed){if(current?.kind==='flight')current=null;queue=queue.filter(m=>m.kind!=='flight');firstFlight=true;}
      const map=mod.read16(0xdc);if(lastMap!==null&&map!==lastMap&&current?.kind==='warning')current=null;lastMap=map;
      if(!visible())return;
      if(mod.worldFlight&&!firstFlight){firstFlight=true;for(const text of firstFlightMessages)say(text,{frames:240,kind:'flight'});}
      if(cooldown>0)cooldown--;
      if(mod.charging&&mod.options.superSaiyan&&mod.charge>=45){
        held++;
        if(held>=90&&!warned&&!cooldown&&(!current||current.kind!=='warning'&&current.remaining<60)){
          const message={text:kaiWarnings[warning++%kaiWarnings.length],remaining:220,kind:'warning'};
          if(current)queue.unshift(current);current=message;warned=true;cooldown=300;
        }
      }else held=0;
      if(current&&--current.remaining<=0)current=null;
      if(!current&&queue.length)current=queue.shift();
    },
    get status(){return{current:current?{...current}:null,queued:queue.length,held,warned,warning,firstFlight,visible:!!current&&visible()};},
    snapshot(){return structuredClone({current,queue,held,warned,warning,cooldown,firstFlight,lastMap});},
    restore(saved){const s=saved?structuredClone(saved):null;current=s?.current??null;queue=s?.queue??[];held=s?.held??0;warned=s?.warned??(s?.nextWarning>90);warning=s?.warning??0;cooldown=s?.cooldown??0;firstFlight=!!s?.firstFlight;lastMap=s?.lastMap??null;raster=key=null;visibilityFrame=-1;},
    dispose(){p.getColor=previous;},
  };
}
