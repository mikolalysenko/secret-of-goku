// Private whole-cartridge geometry audit. Native loading supplies live flags,
// map grids and collision descriptors; the independent ROM decoder checks them.
// This is geometry/route-candidate coverage, not a claim of story traversal.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {readOptions,loadAuditRom,loadCatalog,openAuditPage} from './area-catalog.mjs';
import {readMap} from '../rom/rom.mjs';
const compareOnly=process.argv.includes('--compare-only'),variants=process.argv.includes('--variants');
const options=readOptions(process.argv.slice(2).filter(a=>!['--compare-only','--variants'].includes(a))),rom=await loadAuditRom(options),catalog=await loadCatalog(options);
const maps=catalog.maps.filter(m=>options.selected.length?options.selected.includes(m.id):m.documented&&!['24-credits','25-intro'].includes(m.region));
// Every change in a piece's visibility range defines a distinct layout
// interval. Test their Cartesian product, including hidden story variants.
const jobs=maps.flatMap(map=>{
 if(!variants)return[{map,key:String(map.id).padStart(3,'0'),flags:{}}];
 const ranges=new Map();
 for(const piece of map.pieces??[]){const v=piece.visibility;if(!v.flag||v.min===0&&v.max===15)continue;
  const values=ranges.get(v.flag)??new Set([0]);values.add(v.min);if(v.max<15)values.add(v.max+1);ranges.set(v.flag,values);
 }
 if(!ranges.size)return[];
 let states=[{}];for(const[flag,values]of[...ranges].sort(([a],[b])=>a-b))states=states.flatMap(state=>[...values].sort((a,b)=>a-b).map(value=>({...state,[flag]:value})));
 return states.map(flags=>({map,flags,key:String(map.id).padStart(3,'0')+'-'+Object.entries(flags).map(([f,v])=>Number(f).toString(16)+'_'+v).join('-')}));
});
const directory=options.out+(variants?'/variants':'/runtime');
const baseline=JSON.parse(await fs.readFile(options.state)),browser=compareOnly?null:await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir(directory,{recursive:true});let next=0;const results=[];
async function worker(){
 const {page,errors}=compareOnly?{page:null,errors:[]}:await openAuditPage(browser,options,rom);
 try{while(next<jobs.length){const {map,key,flags}=jobs[next++];let result;
  try{
   const native=compareOnly?JSON.parse(await fs.readFile(directory+`/${key}.json`)):await page.evaluate(({baseline,map,flags})=>{
    const c=mana.snes.cart.data,r=mana.snes.ram,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010),write=mana.snes.write,bus=mana.snes.writeBBus,scratch=new Set();
    // Boss graphics unpack into otherwise unused tails of the map buffers.
    // Record C2:2519 and the WRAM graphics expansion/copy routines at
    // 00:01C8/01D7 so their bytes are reported separately from map geometry.
    mana.snes.write=function(a,v,dma=false){
     const bank=this.cpu.r[1],pc=this.cpu.br[4],copy=bank===0&&(pc===0x1c8||pc===0x1d7&&r[0x1d4]===0x54);
     if(a>>>16===0x7f&&(a&65535)<0x8000&&((bank&63)===2&&pc===0x251b||copy))scratch.add(a&65535);
     return write.call(this,a,v,dma);
    };
    // Uncompressed boss graphics also arrive through the WRAM data port.
    mana.snes.writeBBus=function(a,v){if(a===0x80&&this.ramAdr>=0x10000&&this.ramAdr<0x18000)scratch.add(this.ramAdr-0x10000);return bus.call(this,a,v);};
    try{
     baseline.romHash=mana.hash(c);mana.restore(baseline);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});
     for(const[flag,value]of Object.entries(flags))r[0xcf00+Number(flag)]=value;
     c.set([4,24,3,5,0],0x742b0);c.set([map.id&255,map.entry.x*2+(map.id>>8),map.entry.y*2+(map.entry.collisionLayer===2?1:0),0],0x8300c);
     r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(210);
    }finally{mana.snes.write=write;mana.snes.writeBBus=bus;c.set(e,0x742b0);c.set(d,0x8300c);}
    const h=mana.mod.localFlightHook,{width,height}=h.bounds(),counts=[{land:0,air:0,boundary:0},{land:0,air:0,boundary:0}],edgeViolations=[],spans=[],triggerTiles=[];
    for(let layer=0;layer<2;layer++){
     for(let y=8;y<height;y+=16)for(let x=8;x<width;x+=16){const t=h.tileAt(x,y,layer),land=h.canLand(x,y,layer),fly=h.canFly(x,y,layer);counts[layer][land?'land':fly?'air':'boundary']++;
      if(t&&(t.behavior&0x80||t.code>=0xd0))triggerTiles.push(t);
      if(!land&&fly&&t.code===0&&(t.flags&7)===3)spans.push({x,y,layer,tile:t.tile});
     }
     for(const [x,y]of[[4,8],[width-4,8],[8,4],[8,height-4],[-8,8],[width+8,8],[8,-8],[8,height+8]])if(h.canFly(x,y,layer))edgeViolations.push({x,y,layer});
    }
    const graphicsScratch=[];for(const at of [...scratch].sort((a,b)=>a-b)){const last=graphicsScratch.at(-1);if(last&&last.start+last.length===at)last.length++;else graphicsScratch.push({start:at,length:1});}
    return{map:mana.read16(0xdc),ground:[0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0].every((v,i)=>r[0x100+i]===v),status:mana.mod.status,width,height,counts,edgeViolations,spans,triggerTiles,triggerStart:r[0x4d],graphicsScratch,flags:[...r.slice(0xcf00,0xd000)],grids:[[...r.slice(0x10000,0x14000)],[...r.slice(0x14000,0x18000)]],descriptors:[...r.slice(0x1b800,0x1c000)]};
   },{baseline:structuredClone(baseline),map,flags});
   const decoded=readMap(rom,map.id,map.name,Object.fromEntries(native.flags.map((v,i)=>[i,v]))),differences=[];let compared=0,triggers=0,graphicsScratchBytes=0;
   if(native.map===map.id)for(const [layer,name]of[[0,'background'],[1,'foreground']]){
    const base=(layer?decoded.header.layer2UsesForegroundTiles:decoded.header.layer1UsesForegroundTiles)?192:0;
    for(let i=0;i<decoded.composite.layers[name].length;i++){
     const tile=decoded.composite.layers[name][i];if(tile===null)continue;
     const x=i%decoded.composite.width,y=Math.floor(i/decoded.composite.width),at=layer*0x4000+y*128+x,actual=native.grids[layer][y*128+x];
     if(x>=native.width/16||y>=native.height/16)continue;
     if(native.graphicsScratch?.some(s=>at>=s.start&&at<s.start+s.length)){graphicsScratchBytes++;continue;}
     // The loader gives every trigger an individual runtime metatile. Its
     // placement is retained in triggerTiles for separate event verification.
     if(actual>=native.triggerStart){triggers++;continue;}
     compared++;if(tile-base!==actual)differences.push({x,y,layer,expected:tile-base,actual});
    }
   }
   const adjusted=Object.entries(flags).filter(([flag,value])=>native.flags[Number(flag)]!==value).map(([flag,requested])=>({flag:Number(flag),requested,actual:native.flags[Number(flag)]}));
   result={id:map.id,key,requestedFlags:flags,adjusted,name:map.name,region:map.region,entry:map.entry,...native,compared,triggers,graphicsScratchBytes,differences,result:native.map!==map.id?'redirected':!native.ground?'scene-engine':native.edgeViolations.length?'unsafe-edge':differences.length?'decode-difference':'checked'};
  }catch(error){result={id:map.id,name:map.name,result:'error',error:error.stack};}
  await fs.writeFile(directory+`/${key}.json`,JSON.stringify(result));results.push(result);
  if(results.length%20===0||result.result!=='checked')console.log(JSON.stringify({done:results.length,total:jobs.length,id:map.id,key,result:result.result,differences:result.differences?.length}));
 }}finally{await page?.close();if(errors.length)console.log(JSON.stringify({pageErrors:errors}));}
}
try{await Promise.all(Array.from({length:Math.min(options.workers,jobs.length)},worker));}finally{await browser?.close();}
const report={coverage:(variants?'All piece-visibility range combinations for selected conditional gameplay maps. Adjusted flags explicitly record states changed by native entry/story adapters. ':'Selected named gameplay maps at the opening checkpoint story state. ')+'Native grids and independent decoder, both flight layers and map boundaries. Runtime trigger tiles and traced native graphics scratch are counted separately. Does not assert controller traversal.',counts:results.reduce((a,r)=>(a[r.result]=(a[r.result]||0)+1,a),{}),maps:results.map(({id,key,requestedFlags,adjusted,name,result,compared,triggers,graphicsScratchBytes,differences,edgeViolations,error})=>({id,key,requestedFlags,adjusted,name,result,compared,triggers,graphicsScratchBytes,differences:differences?.length,edgeViolations,error}))};
await fs.writeFile(options.out+(variants?'/variants-summary.json':'/runtime-summary.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.counts));
if(results.some(r=>['error','decode-difference','unsafe-edge'].includes(r.result)))process.exitCode=1;
