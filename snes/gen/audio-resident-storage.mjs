// Share byte-identical retail tracks, preserving every effect and both voices.
// These are whole tracks (or whole track suffixes), not allegedly unused ids.
// No jumps enter the reclaimed spans; validate that before emitting patches.
export const SHARED_TRACKS = [
  {start:0x379A,end:0x37AA,target:0x378A},
  {start:0x39E6,end:0x39F9,target:0x39D3},
  {start:0x3A16,end:0x3A29,target:0x39D3},
  {start:0x3A40,end:0x3A57,target:0x3A29},
  {start:0x3A89,end:0x3ABB,target:0x3A57},
  {start:0x3CC9,end:0x3CD5,target:0x3CBD},
];
export const EFFECT_ROM=0x32139,EFFECT_ARAM=0x2C00;
export const effectOffset=a=>EFFECT_ROM+a-EFFECT_ARAM;
export function effectRam(rom){
  const ram=new Uint8Array(65536);
  ram.set(rom.subarray(EFFECT_ROM,EFFECT_ROM+0x1C00),EFFECT_ARAM);
  // Operand counts from the unchanged boot driver.
  ram.set(rom.subarray(0x3074A+0x1284,0x3074A+0x1284+46),0x1484);
  return ram;
}
export function trackBytes(ram,start){
  let p=start;
  if(!p)return new Uint8Array();
  while(p>=0x2C00&&p<0x4800){
    const op=ram[p],n=op<0xD2?1:1+ram[0x1484+op-0xD2];
    if([0xF9,0xFA,0xFB].includes(op))throw Error('retail effect has an address-dependent jump');
    p+=n;if(op===0xF2)return ram.slice(start,p);
  }
  throw Error(`unterminated effect at ${start.toString(16)}`);
}
export function sharedPatches(rom){
  const ram=effectRam(rom),patches=[];
  for(const s of SHARED_TRACKS){
    for(let i=0;i<s.end-s.start;i++)if(ram[s.start+i]!==ram[s.target+i])throw Error('retail shared track differs');
  }
  for(let id=0;id<0xDC;id++)for(let voice=0;voice<2;voice++){
    const at=0x2C00+id*4+voice*2,p=ram[at]|ram[at+1]<<8;
    if(!p)continue;
    const bytes=trackBytes(ram,p),s=SHARED_TRACKS.find(s=>p>=s.start&&p<s.end);
    for(const span of SHARED_TRACKS)if(p<span.start&&p+bytes.length>span.start)throw Error('retail track falls into reclaimed bytes');
    if(s){
      const to=s.target+p-s.start;
      if(p+bytes.length>s.end)throw Error('shared track escapes its span');
      patches.push({addr:at,bytes:[to&255,to>>8],id,voice,target:to});
    }
  }
  return patches;
}
export function residentLayout(rom,resident){
  const patches=sharedPatches(rom),last=Math.max(...resident.map(r=>r.id));
  const tableEnd=0x2C00+(last+1)*4;
  const spans=[{start:tableEnd,end:0x3000},...SHARED_TRACKS].map(s=>({...s,next:s.start}));
  const tracks=resident.flatMap(r=>(r.tracks??[r.sequence]).map((bytes,voice)=>({id:r.id,voice,bytes,page:r.page})));
  // Largest first avoids wasting small holes; identical suffixes share a pointer.
  tracks.sort((a,b)=>b.bytes.length-a.bytes.length||a.id-b.id||a.voice-b.voice);
  const placed=[];
  for(const t of tracks){
    const shared=placed.find(s=>s.page===t.page&&s.bytes.length>=t.bytes.length&&t.bytes.every((v,i)=>v===s.bytes[s.bytes.length-t.bytes.length+i]));
    if(shared)t.shared=shared;else placed.push(t);
  }
  // Exact packing matters in the 12/16/19-byte holes: greedy placement can
  // strand enough bytes for a whole track. This runs at build time only.
  const failed=new Set(),constrained=tracks.some(t=>t.page!==undefined);
  function place(i){
    if(i===placed.length)return true;
    const rooms=spans.map(s=>s.end-s.next);
    const key=i+':'+(constrained?rooms:rooms.sort((a,b)=>a-b)).join(',');
    if(failed.has(key))return false;
    const t=placed[i],tried=new Set();
    for(const s of [...spans].sort((a,b)=>(a.end-a.next)-(b.end-b.next))){
      if(t.page!==undefined&&(s.next>>8)!==t.page)continue;
      const room=s.end-s.next,shape=constrained?(s.next>>8)+':'+room:room;
      if(room<t.bytes.length||tried.has(shape))continue;
      tried.add(shape);t.addr=s.next;s.next+=t.bytes.length;
      if(place(i+1))return true;
      s.next-=t.bytes.length;
    }
    failed.add(key);return false;
  }
  if(!place(0))throw Error('resident sequence storage exhausted');
  for(const t of tracks)if(t.shared){t.addr=t.shared.addr+t.shared.bytes.length-t.bytes.length;delete t.shared;}
  const table=new Array(tableEnd-0x2F70).fill(0);
  for(const t of tracks){const p=(t.id-0xDC)*4+t.voice*2;table[p]=t.addr&255;table[p+1]=t.addr>>8;}
  patches.push({addr:0x2F70,bytes:table},...placed.map(t=>({addr:t.addr,bytes:t.bytes})));
  return {patches,tracks,spans,used:table.length+placed.reduce((n,t)=>n+t.bytes.length,0),capacity:144+SHARED_TRACKS.reduce((n,s)=>n+s.end-s.start,0)};
}
export function storageAsm(rom,resident){
  const h=n=>'$'+n.toString(16).toUpperCase(),lines=[];
  for(const p of residentLayout(rom,resident).patches){
    const at=effectOffset(p.addr),cpu=0xC00000+at;
    for(let i=0;i<p.bytes.length;i++)lines.push(`%orig1(${h(cpu+i)}, ${h(rom[at+i])})`);
    lines.push(`%patch(${h(cpu)}, ${p.bytes.length}, audio)`,`org ${h(cpu)}`,`db ${p.bytes.map(h).join(',')}`);
  }
  return lines.join('\n')+'\n';
}
