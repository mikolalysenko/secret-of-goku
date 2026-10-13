// DIAGNOSTIC HARNESS. Never changes ROM files or player save data.
// Each map uses a copied party checkpoint plus a native event/door transition.
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {chromium} from '@playwright/test';
import {comparePresentation} from './presentation.mjs';
import {readOptions,loadAuditRom,loadCatalog,openAuditPage} from './area-catalog.mjs';
import {initializeManaBeast} from './area-manabeast.mjs';
const options=readOptions(),out=options.out,rom=await loadAuditRom(options);
const catalog=(await loadCatalog(options)).maps;
const baselineFile=options.state,baseline=JSON.parse(await fs.readFile(baselineFile,'utf8'));
const selected=options.retry?JSON.parse(await fs.readFile(out+'/last-run.json','utf8')).maps.filter(m=>m.result!=='captured').map(m=>m.id):options.selected;
const rendererSourceHash=createHash('sha256').update(await fs.readFile('engine/sprite-layer.js')).digest('hex');
const all=options.all,workers=options.workers,nativeArrival=options.nativeArrival;
const maps=(selected.length||options.retry?catalog.filter(m=>selected.includes(m.id)):catalog.filter(m=>all||m.documented)).sort((a,b)=>a.region.localeCompare(b.region)||a.id-b.id);
if(!maps.length){console.log('No selected maps require an audit.');process.exit(0);}
await fs.mkdir(out+'/captures',{recursive:true});await fs.mkdir(out+'/records',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});let next=0;const results=[];
const start=Date.now();
async function worker(index){
 const {page,errors}=await openAuditPage(browser,options,rom);
 while(next<maps.length){const map=maps[next++],started=Date.now(),pageErrorStart=errors.length;let record={id:map.id,name:map.name,region:map.region,entry:map.entry,diagnostic:true,baselineFile,rendererSourceHash,arrivalMode:nativeArrival?'original door transition':'fixed-coordinate transition 0',party:'native named/added girl and sprite',profile:'opening story flags, full party'};
  try{
   let loaded=await page.evaluate(({baseline,map,nativeArrival})=>{
    // Private scratch event: hide, use door3, show, end. The native engine
    // performs every loader operation; no VRAM/OAM/map grid is fabricated.
    const s=mana.snes,r=s.ram,cart=s.cart.data,x=map.entry.x,y=map.entry.y;
    cart.set([0x04,0x18,0x03,0x05,0x00],0x742b0);
    const transition=nativeArrival?(map.inboundDoors.find(d=>d.id===map.entry.sourceDoor)?.transition||0):0;
    cart.set([map.id&255,(x<<1)|(map.id>>8),(y<<1)|(map.entry.collisionLayer===2?1:0),transition],0x8300c);
    baseline.romHash=mana.hash(cart);mana.restore(baseline);mana.mod.configure({enabled:true,power:false,superSaiyan:false});
    if(map.id===253)return null;
    r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;
    let frames=0,history=[];
    do{mana.run(30);frames+=30;history.push({frames,map:mana.read16(0xdc),event:r[0xd0],mode:[r[0xe4],r[0xe5]],blank:s.ppu.forcedBlank,brightness:s.ppu.brightness});}
    while(frames<180||(frames<480&&(s.ppu.forcedBlank||s.ppu.brightness<14||r[0xe4]!==1||r[0xe5]!==1||r[0xd0]===1)));
    // Spread native followers slightly when a ground controller is available.
    // Preserve the loaded state if this step exits the requested map.
    if(mana.mod.canAttack){const at=mana.snapshot();mana.run(8,[5]);mana.run(2);if(mana.read16(0xdc)!==map.id)mana.restore(at);}
    return{history,status:mana.mod.status,frames,actualMap:mana.read16(0xdc)};
   },{baseline:structuredClone(baseline),map,nativeArrival});
   if(map.id===253){const special=await initializeManaBeast(page);loaded=await page.evaluate(()=>{mana.run(180);return{status:mana.mod.status,actualMap:mana.read16(0xdc)};});loaded={...loaded,special,frames:special.frames+180,history:special.history};}
   record={...record,...loaded,coverage:map.id===253?'native final-battle entry':map.region==='24-credits'||map.region==='25-intro'?'scene map background only':'native entry viewport'};
   const blank=await page.evaluate(()=>mana.snes.ppu.forcedBlank);
   record.comparison=blank?await page.evaluate(()=>{
    // Blank/unused map slots never evaluate an OBJ line, so no sprite plan
    // exists. Compare their whole unchanged PPU frame without an OBJ mask.
    const saved=mana.snapshot(),options={...mana.mod.options};
    try{
     mana.mod.configure({enabled:false,power:false});mana.run(1);const native=mana.snes.ppu.pixelOutput.slice();
     mana.restore(saved);mana.mod.configure({enabled:true,power:false});mana.run(1);
     const pixels=mana.snes.ppu.pixelOutput;let changed=0;
     for(let line=1;line<225;line++)for(let x=0;x<256;x++){const i=line*1536+x*6;for(let c=0;c<6;c++)if(native[i+c]!==pixels[i+c]){changed++;break;}}
     return{map:mana.read16(0xdc),menu:mana.read8(0xec),event:mana.read8(0xd0),changed,unexpected:changed,masked:0,examples:[],sprite:null,bodyParts:0,portraits:0,palette:null,brightness:mana.snes.ppu.brightness,blankComparison:true};
    }finally{mana.mod.configure(options);}
   }):await comparePresentation(page);
   const captured=await page.evaluate(()=>{
    const s=mana.snes,p=s.ppu,plan=mana.mod.spriteLayer.plan||{anchor:null,parts:[],hidden:new Set(),portraits:new Map(),sprite:null},r=s.ram;
    const visible=[];for(let i=0;i<256;i+=2){const attr=p.oam[i+1],y=p.oam[i]>>8;let x=(p.oam[i]&255)|(((p.highOam[i>>4]>>(i&15))&1)<<8);if(x>255)x-=512;const size=p.spriteSizes[p.objSize+(((p.highOam[i>>4]>>(i&15))&2)?8:0)]*8;if(y<224&&x>-size&&x<256)visible.push({slot:i/2,x,y,size,tile:attr&255,bank:!!(attr&256),palette:(attr>>9)&7,priority:(attr>>12)&3,hidden:plan.hidden.has(i)});}
    const rgba=mana.pixels;let nonBlack=0;const colors=new Set();for(let i=0;i<rgba.length;i+=4){if(rgba[i]||rgba[i+1]||rgba[i+2])nonBlack++;colors.add(rgba[i]<<16|rgba[i+1]<<8|rgba[i+2]);}
    return{png:document.getElementById('screen').toDataURL('image/png'),status:mana.mod.status,party:mana.mod.entities().slice(0,3),visibleOam:visible,oam:[...p.oam],highOam:[...p.highOam],cgram:[...p.cgram],ppu:{mode:p.mode,brightness:p.brightness,forcedBlank:p.forcedBlank,bgHoff:[...p.bgHoff],bgVoff:[...p.bgVoff],mainScreenEnabled:p.mainScreenEnabled,subScreenEnabled:p.subScreenEnabled,objSize:p.objSize,rangeOver:p.rangeOver,timeOver:p.timeOver},plan:{anchor:plan.anchor,parts:plan.parts,hidden:[...plan.hidden],portraits:[...plan.portraits],sprite:plan.sprite},nonBlack,uniqueColors:colors.size,eventFlags:[...r.slice(0xcf00,0xd000)]};
   });
   const {png,...fields}=captured;record={...record,...fields};
   await fs.writeFile(out+`/captures/${String(map.id).padStart(3,'0')}.png`,Buffer.from(png.split(',')[1],'base64'));
   record.result=record.actualMap>511?'invalid-map':record.actualMap!==map.id?'redirected':record.ppu.forcedBlank||record.uniqueColors<3?'blank':record.comparison.unexpected?'unexpected-pixels':'captured';
  }catch(error){record.result='error';record.error=error.stack;}
  record.pageErrors=errors.slice(pageErrorStart);record.ms=Date.now()-started;
  await fs.writeFile(out+`/records/${String(map.id).padStart(3,'0')}.json`,JSON.stringify(record,null,2));results.push(record);
  console.log(JSON.stringify({worker:index,id:map.id,region:map.region,result:record.result,map:record.actualMap,colors:record.uniqueColors,unexpected:record.comparison?.unexpected,parts:record.plan?.parts?.length,ms:record.ms,done:results.length,total:maps.length}));
 }
 await page.close();
}
try{await Promise.all(Array.from({length:Math.min(workers,maps.length)},(_,i)=>worker(i)));}finally{await browser.close();}
await fs.writeFile(out+'/last-run.json',JSON.stringify({started:new Date(start).toISOString(),durationMs:Date.now()-start,rendererSourceHash,url:options.url,baselineFile,nativeArrival,maps:results.map(({id,result,ms,actualMap,comparison,error})=>({id,result,ms,actualMap,comparison,error}))},null,2));
console.log('COMPLETE',JSON.stringify({out,ms:Date.now()-start,counts:results.reduce((a,r)=>(a[r.result]=(a[r.result]||0)+1,a),{})}));
