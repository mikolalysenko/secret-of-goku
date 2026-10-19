#!/usr/bin/env node
// Normalises snes/src/modules.asm after merges: removes duplicate JSL lines
// inside each core dispatch block and orders them by the documented
// constraints (gameplay before Goku's pose/palette work, drawing after its
// clients, HDMA programmers after all vblank DMA, audio last because it sends
// what others requested). Modules not listed keep their relative order and
// run before the "late" group.
//   node snes/tools/order-dispatch.mjs [path]
import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2]??'snes/src/modules.asm';
// Per block: [early..., '*', late...]; '*' marks where unlisted calls go.
const ORDER={
  modules_field_frame:['title_field_frame','story_field_frame','debug_field_frame','combat_frame','combat_field_frame','flight_frame','flight_field_frame','ui_field_frame','world_field_frame','*','goku_frame','destroy_field_frame','fx_frame','ending_frame','audio_frame'],
  // ui and destroy only write HDMA registers: first, so they check the
  // vblank line before Goku's cell DMA; fx programs channels 2/3 after all DMA.
  modules_field_nmi:['ui_field_nmi','destroy_field_nmi','goku_nmi','*','ending_nmi','fx_nmi'],
  // Prepare/reset world state and consume combat input before the radar's
  // visibility decision. UI remains the first call that allocates OAM.
  modules_world_frame:['world_prepare_frame','combat_world_frame','ui_world_frame','destroy_world_frame','world_world_frame','*','fx_world_frame','ending_world_frame','audio_frame'],
  modules_world_nmi:['ending_world_nmi','ui_world_nmi','world_world_nmi','*','fx_world_nmi'],
  modules_menu_frame:['goku_menu_frame','title_menu_frame','ui_menu_frame','*','audio_pause'],
  modules_ring_frame:['fx_ring_frame','ui_ring_frame','*','audio_pause'],
};
const src=readFileSync(path,'utf8');
const lines=src.split('\n');
const out=[];
for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^(modules_\w+):\s*$/);
  if(!m){out.push(lines[i]);continue;}
  out.push(lines[i]);
  // Collect the block's body up to its RTL. Conditional (if/endif) lines and
  // comments stay in place relative to the block start. A block is a
  // dispatch list only when it reaches its RTL before the next label and
  // holds no data: data tables (combat's modules_combat_targets: dl/db
  // entries) stay exactly as written.
  const body=[];
  let j=i+1;
  while(j<lines.length&&!/^\tRTL\b/.test(lines[j])&&!/^[A-Za-z_]\w*:/.test(lines[j])){body.push(lines[j]);j++;}
  if(j>=lines.length||!/^\tRTL\b/.test(lines[j])||body.some(l=>/^\s*(dl|dw|db|dd)\b/.test(l))){out.push(...body);i=j-1;continue;}
  const jsl=[],other=[];
  const seen=new Set();
  let inCond=0;
  for(const l of body){
    if(/^\s*if\b/.test(l))inCond++;
    const call=l.match(/^\tJSL\s+(\w+)/);
    if(call&&!inCond){if(!seen.has(call[1])){seen.add(call[1]);jsl.push({name:call[1],line:l});}}
    else other.push(l);
    if(/^\s*endif\b/.test(l))inCond--;
  }
  const order=ORDER[m[1]];
  if(order){
    const star=order.indexOf('*');
    const rank=n=>{const k=order.indexOf(n);return k<0?star:k;};
    jsl.sort((a,b)=>rank(a.name)-rank(b.name));
  }
  out.push(...other,...jsl.map(x=>x.line));
  i=j-1;
}
const result=out.join('\n');
if(result!==src){writeFileSync(path,result);console.log('reordered',path);}
else console.log('already ordered',path);
