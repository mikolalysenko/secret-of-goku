// Inspect boundaries from the original map loader, including maps the offline
// graphics decoder cannot decode. Reports stay private under .local/.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {readOptions,loadAuditRom,loadCatalog,openAuditPage} from './area-catalog.mjs';
const options=readOptions(),rom=await loadAuditRom(options),catalog=await loadCatalog(options);
const maps=catalog.maps.filter(m=>options.selected.length?options.selected.includes(m.id):m.documented&&!['24-credits','25-intro','26-unclassified'].includes(m.region));
const baseline=JSON.parse(await fs.readFile(options.state,'utf8')),browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];let next=0;
await fs.mkdir(options.out+'/boundaries',{recursive:true});
async function worker(){
  const {page,errors}=await openAuditPage(browser,options,rom);
  try{while(next<maps.length){
    const map=maps[next++];let result;
    try{result=await page.evaluate(({baseline,map})=>{
      const r=mana.snes.ram,cart=mana.snes.cart.data,event=cart.slice(0x742b0,0x742b5),door=cart.slice(0x8300c,0x83010);
      try{
        cart.set([4,0x18,3,5,0],0x742b0);
        cart.set([map.id&255,(map.entry.x<<1)|(map.id>>8),(map.entry.y<<1)|(map.entry.collisionLayer===2?1:0),0],0x8300c);
        baseline.romHash=mana.hash(cart);mana.restore(baseline);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});
        r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(210);
        for(let frames=210;frames<480&&(mana.snes.ppu.forcedBlank||r[0xe4]!==1||r[0xe5]!==1);frames+=30)mana.run(30);
      }finally{cart.set(event,0x742b0);cart.set(door,0x8300c);}
      const h=mana.mod.localFlightHook,{width,height}=h.bounds(),actual=mana.read16(0xdc);
      if(actual!==map.id)return{result:'redirected',actual,width,height};
      if(![0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0].every((v,i)=>r[0x100+i]===v))return{result:'not-ground-engine',actual,width,height};
      const layers=[],violations=[];
      for(let layer=0;layer<2;layer++){
        const counts={clear:0,lowObstacle:0,nativeBoundary:0},rows=[];
        for(let y=8;y<height;y+=16){let row='';for(let x=8;x<width;x+=16){
          const land=h.canLand(x,y,layer),float=h.canFloat(x,y,layer),tile=h.tileAt(x,y,layer);
          const type=land?'clear':float?'lowObstacle':'nativeBoundary';counts[type]++;row+=land?'.':float?'o':'#';
          // Independently check each accepted center against the descriptor.
          if(float&&(tile.flags&8))violations.push({layer,x,y,tile});
          if(land&&((tile.flags&7)===3||(tile.flags&8)||(tile.code!==0&&!(tile.code===0xc1&&tile.replacement===0))))violations.push({layer,x,y,tile});
        }rows.push(row);}
        for(const [x,y]of [[0,8],[width-1,8],[8,0],[8,height-1],[-1,8],[width,8],[8,-1],[8,height]])
          if(h.canLand(x,y,layer)||h.canFloat(x,y,layer))violations.push({layer,x,y,edge:true});
        layers.push({layer,counts,rows});
      }
      return{result:violations.length?'failed':'checked',actual,width,height,layers,violations};
    },{baseline:structuredClone(baseline),map});}catch(error){result={result:'error',error:error.message};}
    const record={id:map.id,name:map.name,region:map.region,...result};results.push(record);const done=results.length;
    await fs.writeFile(options.out+`/boundaries/${String(map.id).padStart(3,'0')}.json`,JSON.stringify(record));
    if(done%25===0)console.log(JSON.stringify({done,total:maps.length}));
  }}finally{await page.close();if(errors.length)console.log(JSON.stringify({pageErrors:errors}));}
}
try{await Promise.all(Array.from({length:Math.min(options.workers,maps.length)},worker));}finally{await browser.close();}
const report={coverage:'Native loaded collision grids, both layers, tile centers and map edges; opening story flags. Not a full traversal or every story variant.',legend:{'.':'safe landing','o':'low obstacle flight','#':'original collision'},counts:results.reduce((a,r)=>(a[r.result]=(a[r.result]||0)+1,a),{}),maps:results.map(({layers,...r})=>({...r,layers:layers?.map(({rows,...l})=>l)}))};
await fs.writeFile(options.out+'/flight-boundaries.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({counts:report.counts,total:maps.length,out:options.out}));
if(results.some(r=>r.result==='failed'||r.result==='error'))process.exitCode=1;
