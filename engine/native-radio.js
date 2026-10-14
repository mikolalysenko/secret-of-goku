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
export const treeBlastMessages=[
  'LUKA:The cloud barrier\nis open. The Mana Tree\nis still safe below it.',
  'GOKU:See? Just the clouds.\nKING KAI:Keep it that way!\nNow land carefully.',
];
export const dungeonQuips={
 water:'LUKA:This is a sanctuary!\nGOKU:Now it has a window.\nLUKA:THAT WAS THE WALL.',
 pandora:'KING KAI:Ancient ruins!\nGOKU:Even more ancient now.\nKAI:Not how that works.',
 gaia:'KING KAI:That was a cave!\nGOKU:Now it is TWO caves.\nKAI:Also not how it works.',
 witch:'KING KAI:The witch had a\nmaze planned here.\nGOKU:I found the short one.',
 earth:'KING KAI:They carved this\npalace out of a mountain!\nGOKU:I carved it smaller.',
 kilroy:'KING KAI:That ship floats!\nGOKU:Good. I made a window.\nKAI:BELOW THE WATERLINE!',
 wind:'KING KAI:That wall was\nholding the wind IN.\nGOKU:You are welcome?',
 matango:'GOKU:Shortcut!\nKING KAI:There WAS a path.\nGOKU:It took a whole minute.',
 ice:'KING KAI:The Ice Palace!\nGOKU:I helped defrost it.\nKAI:IT HAD PEOPLE IN IT.',
 sandship:'KING KAI:Stop remodeling\nthe ship while it is moving!\nGOKU:Better air flow!',
 fire:'GOKU:Fire exit!\nLUKA:That was not an exit.\nGOKU:It is now.',
 empire:'KING KAI:So much for\nsneaking into the castle.\nGOKU:I knocked first.',
 northtown:'KING KAI:You cannot punch\nyour way through history!\nGOKU:I used both hands.',
 light:'LUKA:The key is downstairs.\nGOKU:So is most of the wall.',
 jehk:'KING KAI:This is a test\nof patience and wisdom.\nGOKU:I finished early!',
 shade:'KING KAI:This palace is\nsupposed to be dark!\nGOKU:Found the light switch.',
 moon:'KING KAI:You cannot make\nan emergency exit in SPACE!\nGOKU:Watch me.',
 tasnica:'KING KAI:The king wanted\nan audience, not a patio!\nGOKU:Room for more people.',
 undersea:'KING KAI:We are UNDERWATER!\nGOKU:I held my breath.\nKAI:THE BUILDING CANNOT!',
 grand:'LUKA:Seven sacred trials.\nGOKU:One straight hallway.\nLUKA:That was the temple.',
 pure:'KING KAI:This is Pure Land!\nGOKU:Pure gravel now.\nKAI:Put that on the wish.',
 fortress:'KING KAI:That was a load\nbearing wall!\nGOKU:It should train harder.',
};
export const barrierReactions={
  ...Object.fromEntries(Object.entries(dungeonQuips).map(([id,text])=>[`dungeon-wall-${id}`,[text]])),
  'haunted-forest-bridge':['KING KAI:That was a\nsecurity system!\nGOKU:Seems pretty insecure.'],
  'witch-castle':['LUKA:That gate needed\nthree people on switches.\nGOKU:I pushed REALLY hard.'],
  'northtown-castle':['KING KAI:You needed an\ninvitation!\nGOKU:They can hear me now.'],
  'gold-tower':['LUKA:A key would have\nbeen cheaper.\nGOKU:I do not have pockets.'],
  'pandora-ruins-exit':['KING KAI:That was a lock!\nGOKU:It was in the way.\nKAI:THAT IS ITS JOB.'],
  'northtown-ruins-seal':['LUKA:That was a dark seal.\nGOKU:Now it is a doorway.\nLUKA:Go rescue someone.'],
  'pure-land-gate-1':['KING KAI:Defeat the dragon!\nGOKU:I fought the door.\nKAI:THAT DOES NOT COUNT.'],
  'pure-land-gate-2':['LUKA:Another ancient gate!\nGOKU:It lost the fight.\nLUKA:IT WAS A DOOR.'],
  'pure-land-gate-3':['KING KAI:The Tree is next.\nUse your INDOOR voice.\nAnd your INDOOR hands.'],
  'palace-combination':['LUKA:Four switches. One\ncorrect order.\nGOKU:I picked ALL OF THEM.'],
  'moon-ferry':['LUKA:You skipped the ferry.\nGOKU:Was it going to fly?\nLUKA:No. That is the point.'],
};

export function createNativeRadio(snes,mod){
  let current=null,queue=[],held=0,warned=false,warning=0,cooldown=0,firstFlight=false,lastMap=null;
  let barriers=new Set(),barrierCount=0,barrierCooldown=0;
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
    defeatedBarrier(id,{map=mod.read16(0xdc),onceKey=null}={}){
      // Only authored progression shortcuts qualify. Cutting scenery,
      // operating switches/orbs and ordinary flight are normal gameplay.
      // Unknown IDs must stay silent rather than fall back to a generic joke.
      const choices=Object.hasOwn(barrierReactions,id)?barrierReactions[id]:null;
      if(!choices||!mod.options.enabled||!mod.gokuActive)return false;
      const key=onceKey??`${map}:${id}`;if(barriers.has(key))return false;barriers.add(key);
      // Coalesce shortcuts hit by the same blast. Remember suppressed repeats
      // too, so returning to a breached gate cannot start another complaint.
      const prior=current?.kind==='barrier'?current:queue.find(m=>m.kind==='barrier');
      if(barrierCooldown||prior)return false;
      say(choices[barrierCount++%choices.length],{frames:230,kind:'barrier'});Object.assign(queue.at(-1),{barrierId:id,map});barrierCooldown=480;return true;
    },
    interrupt(messages,{frames=240,kind='story'}={}){
      // A catastrophe replaces stale flight instructions, then resumes any
      // collected-Ball notices. It never opens a native dialogue/input lock.
      for(const text of messages){encodeText(text);if(wrapText(text).split('\n').length>3)throw Error('Radio message is too long');}
      const keep=m=>!['flight','warning','power-intro','barrier','core-crisis'].includes(m.kind);
      queue=[...messages.map(text=>({text,remaining:frames,kind})),...(current&&keep(current)?[current]:[]),...queue.filter(keep)];
      current=null;firstFlight=true;visibilityFrame=-1;
    },
    tick(){
      if(!mod.options.enabled||!mod.gokuActive){current=null;queue=[];held=0;warned=false;return;}
      // One aside per charge, only after holding full SSJ power for 1.5s.
      // Release/menu cancellation rearms it but never adds a second punchline.
      if(!mod.charging||!mod.options.superSaiyan){held=0;warned=false;}
      if(mod.worldKi?.status.fortressDestroyed){if(current?.kind==='flight')current=null;queue=queue.filter(m=>m.kind!=='flight');firstFlight=true;}
      const map=mod.read16(0xdc);if(lastMap!==null&&map!==lastMap&&current?.kind==='warning')current=null;lastMap=map;
      // A deferred shortcut aside belongs where the skip happened. Do not
      // carry it into the next room's ordinary gameplay.
      const here=m=>m.kind!=='barrier'||m.map===map;
      if(current&&!here(current))current=null;queue=queue.filter(here);
      if(!visible())return;
      // First-use banter waits for the attack to finish. It must not add a
      // second King Kai remark to the single-warning charge sequence.
      const introPaused=mod.charging||mod.action?.kind==='beam';
      const aside=m=>m.kind==='power-intro'||m.kind==='barrier';
      if(introPaused&&current&&aside(current)){queue.unshift(current);current=null;}
      if(mod.worldFlight&&!firstFlight){firstFlight=true;if(!mod.frieza?.crisisActive)for(const text of firstFlightMessages)say(text,{frames:240,kind:'flight'});}
      if(cooldown>0)cooldown--;
      if(barrierCooldown>0)barrierCooldown--;
      if(mod.charging&&mod.options.superSaiyan&&mod.charge>=45){
        held++;
        if(held>=90&&!warned&&!cooldown&&(!current||current.kind!=='warning'&&current.remaining<60)){
          const message={text:kaiWarnings[warning++%kaiWarnings.length],remaining:220,kind:'warning'};
          if(current)queue.unshift(current);current=message;warned=true;cooldown=300;
        }
      }else held=0;
      if(current&&--current.remaining<=0)current=null;
      if(!current&&queue.length){const next=queue.findIndex(m=>!introPaused||!aside(m));if(next>=0)current=queue.splice(next,1)[0];}
    },
    get status(){return{current:current?{...current}:null,queued:queue.length,held,warned,warning,firstFlight,barrierCount,visible:!!current&&visible()};},
    snapshot(){return structuredClone({barrierVersion:2,current,queue,held,warned,warning,cooldown,firstFlight,lastMap,barriers:[...barriers],barrierCount,barrierCooldown});},
    restore(saved){
      const s=saved?structuredClone(saved):null;
      const keep=m=>m.kind!=='barrier'||s?.barrierVersion===2&&Object.hasOwn(barrierReactions,m.barrierId);
      current=s?.current&&keep(s.current)?s.current:null;queue=(s?.queue??[]).filter(keep);
      held=s?.held??0;warned=s?.warned??(s?.nextWarning>90);warning=s?.warning??0;cooldown=s?.cooldown??0;firstFlight=!!s?.firstFlight;lastMap=s?.lastMap??null;
      barriers=new Set(s?.barriers??[]);barrierCount=s?.barrierCount??0;barrierCooldown=s?.barrierVersion===2?(s.barrierCooldown??0):0;raster=key=null;visibilityFrame=-1;
    },
    dispose(){p.getColor=previous;},
  };
}
