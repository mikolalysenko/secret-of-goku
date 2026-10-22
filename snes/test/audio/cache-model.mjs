#!/usr/bin/env node
// Exact model of the song-load instrument cache (cache.asm) and the optional
// bank's admission (extended.asm audio_extended_prepare), for trying cache
// policies offline. It replays a pass recorded with load-profile.lua:
//   SNES_LUA_PRELUDE=snes/test/audio/load-profile.lua node snes/test/audio/run.mjs loads loads-boot
//   node snes/test/audio/cache-model.mjs .local/snes-test/audio/loads/results.json [...]
// Each load's cache before it, its uploads, moves and song history must
// match the measurement exactly. --policy=retail|holes|gated picks the
// allocator to replay (default gated, the cartridge's); a mismatch then
// shows where another policy departs from the recorded run, and the
// predicted stall (the measured one, with the transfer cost model's change
// for the other policy's uploads and moves) is printed per load.
// Reads the built cartridge's tables: dist/snes/secret-of-goku.sfc and
// dist/snes/gen/audio (or SNES_ROM and its dist/snes/gen).
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export function cacheData(root=repo){
 const rom=readFileSync(process.env.SNES_ROM??join(root,'dist/snes/secret-of-goku.sfc'));
 const gen=join(root,'dist/snes/gen/audio');
 const u16=a=>rom[a]|rom[a+1]<<8;
 const cache=readFileSync(join(gen,'cache.asm'),'utf8');
 const nums=name=>cache.split(name+':')[1].split('\n')[1].replace(/^\s*d[wb]\s*/,'').split(',').map(Number);
 const custom=readFileSync(join(gen,'custom.asm'),'utf8');
 const ext=readFileSync(join(gen,'extended.asm'),'utf8');
 return {
  lengths:nums('audio_cache_lengths'),costs:nums('audio_cache_costs'),
  floor:Number(custom.match(/AUDIO_CUSTOM_FLOOR = (\d+)/)[1]),
  caps:custom.split('audio_custom_edl_caps:')[1].split('\n')[1].replace(/^\s*db\s*/,'').split(',').map(Number),
  reserve:Number(ext.match(/AUDIO_EXT_RESERVE = (\d+)/)[1]),
  required:ext.split('audio_extended_required:')[1].split('\n')[1].replace(/^\s*dw\s*/,'').split(',').map(Number),
  // C3:3F22: 16 instrument ids per song (the built cartridge's, $3B-$3F included)
  lists:Array.from({length:64},(_,s)=>Array.from({length:16},(_,k)=>u16(0x33F22+32*s+2*k))),
  seqLen:Array.from({length:64},(_,s)=>u16((rom[0x33D39+3*s]|rom[0x33D3A+3*s]<<8|rom[0x33D3B+3*s]<<16)&0x3FFFFF)),
 };
}

// State: 16 slots {id, addr, len, flag} kept address-sorted, empties last
// (flag low byte 0 disposable, 1 retained, 2 upload; 0x100 recent), the
// optional bank {start, state, valid} and the song history (cache.asm).
export function cacheState(cache=[],history=[0,0,0,0,0]){
 const slots=Array.from({length:16},()=>({id:0,addr:0,len:0,flag:0}));
 cache.filter(c=>c.id).forEach((c,i)=>{slots[i]={id:c.id,addr:c.addr,len:c.bytes,flag:0};});
 return {slots,ext:{start:0,state:0,valid:0},hist:history.slice(0,4),heat:history[4]??0};
}
function sortSlots(slots){
 // audio_cache_sort: stable by address, empty slots last
 const live=slots.filter(s=>s.id),rest=slots.filter(s=>!s.id);
 live.sort((a,b)=>a.addr-b.addr);
 slots.splice(0,16,...live,...rest);
}
function compact(st,need,out,floor){
 // audio_cache_compact: drop disposable entries, pack the rest downward in
 // address order until a hole of `need` bytes exists (0: the whole set).
 for(const s of st.slots)if(s.id&&(s.flag&0xFF)===0){s.id=0;s.flag=0;}
 let at=floor;
 for(const s of st.slots){
  if(!s.id)continue;
  if(need&&at+need<=s.addr)break;
  if(s.addr!==at){if((s.flag&0xFF)===1)out.moves.push({id:s.id,bytes:s.len,src:s.addr,dst:at});s.addr=at;}
  at+=s.len;
 }
}
// Round eight's non-moving allocator (audio_cache_allocate).
export function holes(st,list,limit,out,d){
 const slots=st.slots,len=id=>d.lengths[id];
 const resolved=new Set();
 for(let guard=0;guard<200;guard++){
  let placed=false;
  for(let y=0;y<16;y++){
   const id=list[y];if(!id)break;
   if(resolved.has(y))continue;
   if(slots.some(s=>s.id===id)){resolved.add(y);continue;}
   const need=len(id);
   let at=d.floor,found=null,cost=0;
   for(const s of slots){if(!s.id)break;if(s.addr-at>=need){found=at;break;}at=s.addr+s.len;}
   if(found===null&&at+need<=0xFFFF&&at+need<limit)found=at;
   if(found===null){
    let best=0xFFFF,bestAddr=0;
    const starts=[{start:d.floor,from:0}];
    slots.forEach((s,i)=>{if(s.id)starts.push({start:s.addr+s.len,from:i+1});});
    for(const c of starts){
     const a=c.start,e=a+need;
     if(e>0xFFFF||e>=limit)continue;
     let sum=0,rejected=false;
     for(let x=c.from;x<16;x++){
      const s=slots[x];if(!s.id||s.addr>=e)break;
      if(s.addr+s.len<=a)continue;
      if(s.flag&0xFF){rejected=true;break;}
      sum+=d.costs[s.id]*(s.flag&0x100?2:1);
      if(sum>best||(sum===best&&a>=bestAddr)){rejected=true;break;}
     }
     if(rejected)continue;
     if(sum<best||(sum===best&&a<bestAddr)){best=sum;bestAddr=a;if(!best)break;}
    }
    if(best===0xFFFF){compact(st,need,out,d.floor);sortSlots(slots);placed=true;break;}
    found=bestAddr;cost=best;
   }
   const a=found,e=a+need;
   if(cost)for(const s of slots)if(s.id&&s.addr<e&&s.addr+s.len>a)s.id=0;
   const slot=slots.find(s=>!s.id)??slots.find(s=>s.flag===0)??slots.find(s=>(s.flag&0xFF)===0);
   Object.assign(slot,{id,len:need,addr:a,flag:2});
   sortSlots(slots);placed=true;break;
  }
  if(!placed)return;
 }
 throw Error('allocator loop');
}
// The retail allocator (audio_cache_append): append at the tail; when the
// tail or the slots run out, pack the required set once, then append. The
// fit test counts every missing list entry, a duplicated one twice.
export function retail(st,list,limit,out,d){
 const slots=st.slots,len=id=>d.lengths[id];
 const missing=[];let total=0,count=0;
 for(const id of list){if(!id)break;if(!slots.some(s=>s.id===id)){total+=len(id);count++;if(!missing.includes(id))missing.push(id);}}
 if(!missing.length)return;
 const tail=()=>slots.reduce((t,s)=>s.id?s.addr+s.len:t,d.floor);
 let at=tail();
 if(!(slots.filter(s=>s.id).length+count<=16&&at+total<limit)){
  compact(st,0,out,d.floor);sortSlots(slots);at=tail();
 }
 for(const id of missing){const slot=slots.find(s=>!s.id);Object.assign(slot,{id,len:len(id),addr:at,flag:2});at+=len(id);}
}
export function gated(st,list,limit,out,d,song){
 // audio_cache_history: the last four song ids + 1, a three-load window
 if(st.heat)st.heat--;
 if(st.hist.includes(song+1))st.heat=3;
 st.hist=[song+1,...st.hist].slice(0,4);
 out.policy=st.heat?'holes':'retail';
 (st.heat?holes:retail)(st,list,limit,out,d);
}
const POLICIES={gated,holes:(st,l,lim,out,d)=>holes(st,l,lim,out,d),retail:(st,l,lim,out,d)=>retail(st,l,lim,out,d)};

// One song load: the bank's admission, the plan's retain pass, allocation.
export function load(st,song,edl,d,policy=gated){
 const out={song,uploads:[],moves:[],bank:'none'};
 const ceiling=0xFA00-Math.max(1,edl)*0x800;
 let limit=ceiling;
 const list=d.lists[song],ext=st.ext;
 if(ext.valid!==0xA8DB){ext.start=0;ext.state=0;}
 const room=slab=>{
  let top=d.floor;
  for(const s of st.slots){if(!s.id||s.addr<d.floor)continue;const end=s.addr+s.len;if(end>=ceiling)continue;if(end>=slab)return false;if(end>=top)top=end;}
  for(const id of list){
   if(!id)return true;
   const s=st.slots.find(s=>s.id===id);
   if(s&&s.addr>=d.floor&&s.addr+s.len<ceiling)continue;
   top+=d.lengths[id];if(top>0xFFFF||top>=slab)return false;
  }
  return true;
 };
 let next=0;
 const keep=ext.start!==0&&ext.start>d.required[song]&&ext.start+d.reserve<=ceiling;
 const slab=ceiling-d.reserve;
 if(keep&&room(ext.start)){next=ext.start;limit=ext.start;out.bank='keep';}
 else if(!keep&&slab>d.required[song]&&room(slab)){next=slab;limit=slab;out.bank='new';}
 else ext.state=0;
 for(const s of st.slots)s.flag=(s.flag&0xFF)?0x100:0;
 for(const s of st.slots){
  if(!s.id)continue;
  if(s.addr<d.floor||s.addr+s.len>=limit){s.id=0;continue;}
  if(list.includes(s.id))s.flag|=1;
 }
 sortSlots(st.slots);
 policy(st,list,limit,out,d,song);
 for(const s of st.slots)if(s.id&&(s.flag&0xFF)===2)out.uploads.push({id:s.id,bytes:s.len,addr:s.addr});
 ext.start=next;ext.valid=0xA8DB;ext.state=next?3:0; // the tests wait for a complete fill
 return out;
}
// Transfer costs fitted on measured loads (NTSC frames): FastROM mode 4
// uploads, mode 7 moves. Only differences between policies are used.
export const transferFrames=o=>o.uploads.reduce((a,u)=>a+u.bytes,0)*0.0011046+o.uploads.length*0.0167
 +o.moves.reduce((a,m)=>a+m.bytes,0)*0.00083+o.moves.length*0.08;

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),files=args.filter(a=>!a.startsWith('--'));
 const name=args.find(a=>a.startsWith('--policy='))?.slice(9)??'gated';
 const policy=POLICIES[name];if(!policy)throw Error('unknown policy '+name);
 const d=cacheData();let failed=false;
 for(const f of files){
  const res=JSON.parse(readFileSync(f,'utf8')),prof=res.song_load_profile;
  if(!prof?.length||prof[0].edl==null)throw Error(f+': record it with the current load-profile.lua');
  const st=cacheState(prof[0].cache,prof[0].history),ref=cacheState(prof[0].cache,prof[0].history);
  let match=0,first=null,sum=0,sumNew=0,n=0;
  for(const p of prof){
   const before=st.slots.filter(s=>s.id).map(s=>s.id+'@'+s.addr).join(' ');
   const seen=p.cache.filter(c=>c.id).map(c=>c.id+'@'+c.addr).sort().join(' ');
   const o=load(st,p.song,p.edl,d,policy),r=load(ref,p.song,p.edl,d,gated);
   const same=before.split(' ').sort().join(' ')===seen&&o.uploads.map(u=>u.bytes).join()===p.uploads.join()&&
    o.moves.reduce((a,m)=>a+m.bytes,0)===p.moves.reduce((a,m)=>a+m.bytes,0);
   if(same)match++;else if(!first)first={song:p.song.toString(16),uploads:o.uploads.map(u=>u.id),moves:o.moves.map(m=>m.id),measured:p.uploads};
   if(name!=='gated'){
    const measured=['fade','echo_setup','sequence','cache_plan','compact','instruments','tables','finish'].reduce((a,k)=>a+(p[k]??0),0);
    const predicted=measured-transferFrames(r)+transferFrames(o);sum+=measured;sumNew+=predicted;n++;
   }
  }
  console.log(`${f}: ${prof.length} loads, ${match} match the ${name} model${first?'; first difference at $'+first.song+' '+JSON.stringify(first):''}`+
   (n?`; mean stall ${(sum/n).toFixed(3)} measured -> ${(sumNew/n).toFixed(3)} predicted`:''));
  if(name==='gated'&&match!==prof.length)failed=true;
 }
 process.exit(failed?1:0);
}
