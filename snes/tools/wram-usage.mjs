// Scans private SnesJs probe states (.local/**.json) and records which WRAM
// bytes were ever nonzero; optionally replays each state to record writes.
// Output: dist/snes/analysis/wram-usage.json (never committed).
import {readFileSync,readdirSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
const root='.local',files=[];
(function walk(d){for(const f of readdirSync(d)){const p=join(d,f);let s;try{s=statSync(p);}catch{continue;}
 if(s.isDirectory()){if(!/node_modules|tools/.test(f))walk(p);}else if(f.endsWith('.json')&&s.size>1e6)files.push(p);}})(root);
const nonzero=new Uint32Array(0x20000),written=new Uint32Array(0x20000);let used=0;
const replay=process.argv.includes('--replay');
const rom=new Uint8Array(readFileSync('rom/secret-of-mana-us.sfc'));
function core(){
 const context={console,Uint8Array,Uint16Array,Int8Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math,Map,clearArray:a=>a.fill(0),log:()=>{},getByteRep:x=>x.toString(16),getWordRep:x=>x.toString(16),getLongRep:x=>x.toString(16)};
 vm.createContext(context);
 for(const name of['cart','dsp','spc','apu','pipu','cpu','snes'])vm.runInContext(readFileSync(`vendor/snes/${name}.js`,'utf8'),context);
 const snes=new context.Snes();snes.loadRom(rom,true);snes.reset(true);return snes;
}
const {restore,hash}=await import('../../engine/state.js');
for(const f of files){
 let st;try{st=JSON.parse(readFileSync(f,'utf8'));}catch{continue;}
 if(st?.format!=='SnesJs-probe-v1')continue;
 const rootNode=st.nodes[st.root.$ref];const ref=rootNode?.props?.ram;if(!ref)continue;
 const ram=st.nodes[ref.$ref];if(!ram?.typed||ram.values.length!==0x20000)continue;
 used++;for(let i=0;i<0x20000;i++)if(ram.values[i])nonzero[i]++;
 if(replay){
  const s=core();
  try{restore(s,{...st,romHash:hash(s.cart.data)});}catch(e){continue;}
  const before=Uint8Array.from(s.ram);const wr=s.write;
  // Track CPU writes into WRAM via the bus write path.
  const mark=new Uint8Array(0x20000);
  const origWrite=s.write.bind(s);
  s.write=function(adr,value,dma){const bank=adr>>16,a=adr&0xffff;
   if(bank===0x7e||bank===0x7f)mark[((bank&1)<<16)|a]=1;else if((bank<0x40||(bank>=0x80&&bank<0xc0))&&a<0x2000)mark[a]=1;
   return origWrite(adr,value,dma);};
  for(let i=0;i<180;i++){s.joypad1State=(i%30<3)?0x80:0;s.runFrame(true);}
  for(let i=0;i<0x20000;i++)if(mark[i]||s.ram[i]!==before[i])written[i]++;
 }
}
mkdirSync('dist/snes/analysis',{recursive:true});
const ranges=(arr)=>{const out=[];let start=-1;for(let i=0;i<=0x20000;i++){const free=i<0x20000&&arr[i]===0;if(free&&start<0)start=i;if(!free&&start>=0){if(i-start>=64)out.push([start,i-start]);start=-1;}}return out;};
const combined=new Uint32Array(0x20000);for(let i=0;i<0x20000;i++)combined[i]=nonzero[i]+written[i];
const free=ranges(combined).sort((a,b)=>b[1]-a[1]);
writeFileSync('dist/snes/analysis/wram-usage.json',JSON.stringify({states:used,replay,free:free.map(([s,n])=>({start:'7E'+'0000'.slice(0)+'',addr:(0x7e0000+s).toString(16),size:n}))},null,1));
console.log('states',used,'replay',replay);
for(const [s,n] of free.slice(0,40))console.log((0x7e0000+s).toString(16),n.toString(16),n);
