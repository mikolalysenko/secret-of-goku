// The power-on scenario every emulator plays (snes/test/emulators/run.mjs):
// boot checks, title screenshots, NEW GAME name editor, the opening up to the
// first controllable field scene (map 128), a CPU-bus probe of the ExHiROM
// mapping, a native save, a power cycle with battery RAM kept, and a load.
// mesen-ref.lua plays the same steps in Mesen (through the bus probe).

// WRAM (CPU addresses; the host accepts 7E:xxxx for WRAM)
export const A={
  tramp:0x7E0100,          // NMI trampoline: RTI in the title program, JML elsewhere
  d0:0x7E00D0,             // field event state ($83: text waits for a button)
  map:0x7E00DC,
  heroX:0x7EE002, heroY:0x7EE004,
  menuPage:0x7EA202,       // 3: name editor (game select reaches it)
  menuCursor:0x7EA211,
  nameLen:0x7EA1CC,
  coreFrame:0x7ED700, coreFlags:0x7ED73A,
  titleFlags:0x7EDD9E,     // bit 1: title program patched by the title module
  // Borrowed for three idle field frames and restored: the CORE_TEST mailbox
  // and reserved core WRAM, unused in release builds (the native tile
  // decoder may leave map data there, which the probe puts back).
  probeCode:0x7E6F40,
  probeOut:0x7E6FC0,
};
// SRAM offsets ($30:6000 = 0, $31:6000 = 0x2000, ...)
export const S={slot0:0x0000, liveMagic:0x203E, sidecar0:0x2400,
  eventReq:0x3490};        // !core_event_req ($31:7490): $8000|event id, started at the next idle field frame
export const SAVE_EVENT=0x05D8;      // the save point's script event (C9 table)
export const NMI_FIELD=[0x5C,0xA8,0xC0,0x00], NMI_MENU=[0x5C,0xA7,0x20,0xC0];
export const TITLE_FRAMES=[700,940];
export const WINDOW=6;
// Pictures taken relative to an event: Mesen shoots at frame F (30 frames
// after the event), the cores at F-2..F+2 as <name>-2 .. <name>+2, since
// frame boundaries differ by about one frame between emulators.
export const SHOT_WINDOW=2;
async function shotWindow(h,name){
  for(let k=-SHOT_WINDOW;k<=SHOT_WINDOW;k++){
    if(k>-SHOT_WINDOW)await h.wait(1);
    await h.shot(`${name}${k<0?'':'+'}${k}`);
  }
}

// ---------------------------------------------------------------------------
// CPU-bus probe. The test points the NMI trampoline's JML at a routine in
// free WRAM for a few frames; it copies the 32-byte xdata probe (a bank in
// $40-$7D, which only an ExHiROM mapping reaches) and single bytes from the
// header, ROM mirrors and save RAM banks to WRAM, counts its runs and jumps
// on to the game's NMI handler. Registers are preserved (PHP/REP/PHA/PHX).
export function probeReads(xprobe){
  return [
    {addr:0x00FFD5,what:'map mode via $00 (second 4 MiB)'},
    {addr:0x00FFD7,what:'ROM size via $00'},
    {addr:0x00FFD8,what:'SRAM size via $00'},
    {addr:0xC0FFD5,what:'map mode via $C0 (first 4 MiB)'},
    {addr:(xprobe|0x800000)>>>0,what:'xdata address in the $80+ mirror (first 4 MiB)'},
    {addr:0x306000,what:'save slot 0, byte 0 ($30)'},
    {addr:0x31603E,what:"live block magic 'G' via $31"},
    {addr:0xB1603E,what:"live block magic 'G' via $B1"},
    {addr:0x337FFF,what:'last save RAM byte via $33'},
    {addr:0xB37FFF,what:'last save RAM byte via $B3'},
    {addr:0x00FFFC,what:'reset vector low byte via $00'},
  ];
}
const long=a=>[a&255,(a>>8)&255,(a>>16)&255];
export function probeCode(xprobe,target){
  const out=A.probeOut;
  const b=[0x08,0xC2,0x30,0x48,0xDA,0xE2,0x20,0xA2,0x1F,0x00,   // PHP REP#30 PHA PHX SEP#20 LDX #$1F
    0xBF,...long(xprobe),0x9F,...long(out),0xCA,0x10,0xF5];       // copy 32 bytes (LDA l,X / STA l,X / DEX / BPL)
  probeReads(xprobe).forEach((r,i)=>b.push(0xAF,...long(r.addr),0x8F,...long(out+0x20+i)));
  b.push(0xAF,...long(out+0x3F),0x1A,0x8F,...long(out+0x3F));     // run counter
  b.push(0xC2,0x30,0xFA,0x68,0x28,0x5C,...long(target));         // REP#30 PLX PLA PLP JML target
  if(b.length>out-A.probeCode)throw Error(`probe code is ${b.length} bytes`);
  return b;
}
// What an ExHiROM board returns at a CPU address (rom: the 8 MiB file;
// sram: the core's battery RAM at that moment).
export function exhiromByte(rom,sram,addr){
  const bank=addr>>>16,off=addr&0xFFFF,b7=bank&0x7F;
  if(b7>=0x20&&b7<=0x3F&&off>=0x6000&&off<0x8000)return sram?sram[((b7&0x1F)*0x2000+off-0x6000)&(sram.length-1)]:null;
  if(bank>=0xC0)return rom[(bank-0xC0)*0x10000+off];
  if(bank>=0x80&&off>=0x8000)return rom[(bank-0x80)*0x10000+off];
  if(bank>=0x40&&bank<=0x7D)return rom[0x400000+(bank-0x40)*0x10000+off];
  if(bank<0x40&&off>=0x8000)return rom[0x400000+bank*0x10000+off];
  return null;
}

const hex=(v,n=2)=>v==null?'--':v.toString(16).toUpperCase().padStart(n,'0');
const hexs=a=>a.map(v=>hex(v)).join(' ');
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

// ---------------------------------------------------------------------------
// The scenario on a RetroHost (snes/test/emulators/retro.mjs).
export async function playScenario(h,{rom,xprobe,log=()=>{}}){
  const res={checks:[],values:{},events:{}};
  const check=(name,ok,detail='')=>{res.checks.push({name,pass:!!ok,detail:String(detail)});log(`  ${ok?'ok  ':'FAIL'} ${name} ${detail}`);return !!ok;};
  const tramp=async()=>h.bytes('wram',A.tramp,4);
  const inField=async()=>same(await tramp(),NMI_FIELD);
  const inMenu=async()=>same(await tramp(),NMI_MENU);
  const fieldIdle=async()=>{
    const z=await h.bytes('wram',A.d0,0x16);   // $D0-$E5
    return {d0:z[0],map:z[0x0C]|z[0x0D]<<8,idle:z[0]===0&&z[0x14]===1&&z[0x15]===1};
  };

  // 1. Power-on: the reset vector ran core_boot (live block magic written
  // over the noise battery RAM), and the title program runs, patched.
  await h.wait(120);
  const t=await h.bytes('wram',A.tramp,8);
  check('boot_title_program',t[0]===0x40&&same(t.slice(4),[0x5C,0x66,0xA2,0x7E]),`$0100: ${hexs(t)}`);
  const magic=await h.sram(S.liveMagic,2);
  check('boot_reset_ran_core_boot',magic===0x4B47,`live block magic ${hex(magic,4)} (GK = 4B47)`);
  check('boot_title_patched',((await h.r8(A.titleFlags))&2)!==0,`$DD9E ${hex(await h.r8(A.titleFlags))}`);

  // 2. Title: screenshots in a window around fixed frames.
  for(const F of TITLE_FRAMES){
    for(let f=F-WINDOW;f<=F+WINDOW;f++){
      if(f>h.frame)await h.wait(f-h.frame);
      await h.shot(`title-${F}-${f}`);
    }
  }

  // 3. Game select, NEW GAME name editor (title module prefills BOY).
  if(h.frame<960)await h.wait(960-h.frame);
  let editor=false;
  for(let i=0;i<60;i++){
    if(await inMenu()&&await h.r8(A.menuPage)===3){editor=true;break;}
    await h.tap('start',4,20);
  }
  check('name_editor_reached',editor,`frame ${h.frame}`);
  res.events.editor=h.frame;
  let prefilled=await h.waitFor(async()=>(await h.r8(A.nameLen))===3,240,2);
  if(!prefilled){for(let i=0;i<6&&!(await h.r8(A.nameLen));i++)await h.tap('b',4,30);}
  check('name_prefilled',prefilled,`length ${await h.r8(A.nameLen)}`);
  await h.wait(28);
  await shotWindow(h,'name');
  res.events.name=h.frame;
  if(!editor)return res;

  // 4. Opening: Start commits the name; text advanced with B when it waits.
  await h.wait(8);
  await h.tap('start',8,8);
  check('opening_started',await h.waitFor(inField,600,2),`frame ${h.frame}`);
  let control=false;
  for(let i=0;i<2400;i++){
    const s=await fieldIdle();
    if(s.d0===0x83)await h.tap('b',4,4);else await h.wait(4);
    const now=await fieldIdle();
    if(now.map===128&&now.idle&&await inField()){control=true;break;}
  }
  res.events.control=h.frame;
  check('waterfall_reached',control,`frame ${h.frame}, map ${(await fieldIdle()).map}`);
  if(!control)return res;
  await h.wait(28);
  await shotWindow(h,'waterfall');
  res.events.waterfall=h.frame;
  const cf0=await h.r16(A.coreFrame);
  await h.wait(60);
  const cf1=await h.r16(A.coreFrame);
  check('field_frames_advance',cf1-cf0>=30&&cf1-cf0<=61,`${cf1-cf0} field frames in 60`);
  res.values.map=await h.r16(A.map);
  res.values.hero=[await h.r16(A.heroX),await h.r16(A.heroY)];
  check('map_128',res.values.map===128,`map ${res.values.map}, hero ${res.values.hero}`);

  // 5. CPU-bus probe through the NMI trampoline.
  await busProbe(h,res,check,{rom,xprobe,inField});

  // 6. Native save from the field: the save point's own event.
  const slot0Before=await h.sram(S.slot0);
  await h.write('sram',S.eventReq,[SAVE_EVENT&255,0x80|SAVE_EVENT>>8]);
  const menu=await h.waitFor(inMenu,300,2);
  check('save_menu_opened',menu,`frame ${h.frame}`);
  if(!menu)return res;
  await h.wait(30);
  for(let i=0;i<8&&(await h.r8(A.menuCursor))!==0;i++)await h.tap(await h.r8(A.menuCursor)<0?'down':'up',6,24);
  await h.tap('b',6,60);
  await h.tap('b',6,60);
  const backInField=await h.waitFor(async()=>await inField()&&(await h.r8(A.d0))===0,600,2);
  const slot0=await h.sram(S.slot0);
  check('save_slot_header',slot0===0xC5,`SRAM[0] ${hex(slot0Before)} -> ${hex(slot0)} (C5 = slot header)`);
  const side=await h.sram(S.sidecar0,2);
  check('save_sidecar_magic',side===0x4B47,`sidecar 0 magic ${hex(side,4)}`);
  check('save_back_in_field',backInField,`frame ${h.frame}`);
  res.values.saved_hero=[await h.r16(A.heroX),await h.r16(A.heroY)];
  res.values.sram_after_save=await h.bytes('sram',0,16);

  // 7. Power cycle (battery RAM kept), title, GAME FILE, slot 1.
  await h.reload();
  res.events.reload=h.frame;
  const sramAfter=await h.sram(S.slot0);
  check('battery_kept_over_power_cycle',sramAfter===0xC5,`SRAM[0] after power cycle ${hex(sramAfter)}`);
  let sel=false;
  for(let i=1;i<=60;i++){
    if(await inMenu()){sel=true;break;}
    if(i%3===0)await h.tap('start',4,4);else await h.wait(20);
  }
  check('game_select_after_power_cycle',sel,`frame ${h.frame}`);
  if(!sel)return res;
  await h.wait(40);
  const choose=async v=>{
    for(let i=0;i<8;i++){
      const c=await h.r8(A.menuCursor);
      if(c===v)return true;
      await h.tap(c<v?'down':'up',6,24);
    }
    return (await h.r8(A.menuCursor))===v;
  };
  const fileDefault=await h.r8(A.menuCursor);
  check('game_file_offered',await choose(1),`cursor default ${fileDefault} (1 = GAME FILE)`);
  await h.tap('b',6,60);
  const list=(await h.r8(A.menuPage))===2&&await choose(0);
  check('file_list',list,`page ${await h.r8(A.menuPage)}`);
  await h.tap('b',6,60);
  const loaded=await h.waitFor(async()=>await inField()&&(await h.r8(A.d0))===0,900,2);
  await h.wait(28);
  await shotWindow(h,'loaded');
  const lmap=await h.r16(A.map),pos=[await h.r16(A.heroX),await h.r16(A.heroY)];
  // The position is compared with Mesen's load by run.mjs (loading places the
  // hero by the map's own rules, not exactly where the save happened).
  res.values.loaded_hero=pos;
  check('loaded_save',loaded&&lmap===128,`map ${lmap}, hero ${pos} (saved at ${res.values.saved_hero})`);
  check('loaded_sidecar_restored',((await h.r16(A.coreFlags))&1)===1,`core flags ${hex(await h.r16(A.coreFlags),4)}`);
  res.events.loaded=h.frame;
  return res;
}

// A new power-on with the battery RAM the scenario left (the core's own
// .srm for bsnes): GAME FILE is offered and the first slot loads.
export async function playBatteryLoad(h,{savedHero}){
  const res={checks:[]};
  const check=(name,ok,detail='')=>{res.checks.push({name,pass:!!ok,detail:String(detail)});return !!ok;};
  const tramp=async()=>h.bytes('wram',A.tramp,4);
  const inField=async()=>same(await tramp(),NMI_FIELD);
  const inMenu=async()=>same(await tramp(),NMI_MENU);
  check('battery_file_header',(await h.sram(S.slot0))===0xC5,`SRAM[0] ${hex(await h.sram(S.slot0))}`);
  let sel=false;
  for(let i=1;i<=60;i++){
    if(await inMenu()){sel=true;break;}
    if(i%3===0)await h.tap('start',4,4);else await h.wait(20);
  }
  if(!check('battery_game_select',sel,`frame ${h.frame}`))return res;
  await h.wait(40);
  const cursor=await h.r8(A.menuCursor);
  check('battery_game_file_default',cursor===1,`cursor ${cursor} (1 = GAME FILE)`);
  await h.tap('b',6,60);
  await h.tap('b',6,60);
  const loaded=await h.waitFor(async()=>await inField()&&(await h.r8(A.d0))===0,900,2);
  const pos=[await h.r16(A.heroX),await h.r16(A.heroY)];
  check('battery_loaded',loaded&&(await h.r16(A.map))===128&&(!savedHero||(pos[0]===savedHero[0]&&pos[1]===savedHero[1])),
    `map ${await h.r16(A.map)}, hero ${pos} (power-cycle load ${savedHero})`);
  check('battery_sidecar_restored',((await h.r16(A.coreFlags))&1)===1,`core flags ${hex(await h.r16(A.coreFlags),4)}`);
  return res;
}

async function busProbe(h,res,check,{rom,xprobe,inField}){
  const t=await h.bytes('wram',A.tramp,4);
  if(!same(t,NMI_FIELD)){check('bus_probe',false,`NMI trampoline ${hexs(t)}`);return;}
  const target=t[1]|t[2]<<8|t[3]<<16;
  const saved=await h.bytes('wram',A.probeCode,0xC0);
  await h.write('wram',A.probeCode,[...probeCode(xprobe,target),...new Array(0xC0).fill(0)].slice(0,0xC0));
  await h.write('wram',A.tramp+1,long(A.probeCode));
  await h.wait(3);
  await h.write('wram',A.tramp+1,long(target));
  const got=await h.bytes('wram',A.probeOut,0x40);
  const sram=await h.bytes('sram',0,0x8000);
  await h.write('wram',A.probeCode,saved);
  await h.wait(2);
  check('bus_probe_ran',got[0x3F]>=1,`${got[0x3F]} NMIs through the probe`);
  const want=[...Array(32)].map((_,i)=>exhiromByte(rom,null,xprobe+i));
  const text=String.fromCharCode(...got.slice(0,26));
  check('exhirom_xdata_probe',same(got.slice(0,32),want),`$${hex(xprobe,6)}: "${text}" ${hex(got[30])}${hex(got[31])}`);
  const reads=probeReads(xprobe).map((r,i)=>({...r,got:got[0x20+i],want:exhiromByte(rom,sram,r.addr)}));
  const bad=reads.filter(r=>r.got!==r.want);
  check('exhirom_bus_reads',!bad.length,bad.length?bad.map(r=>`$${hex(r.addr,6)} ${hex(r.got)}!=${hex(r.want)} (${r.what})`).join('; '):
    `$00:FFD5=${hex(reads[0].got)} $00:FFD7=${hex(reads[1].got)} $00:FFD8=${hex(reads[2].got)}, mirrors and save RAM banks agree`);
  res.values.bus=reads.map(r=>({addr:hex(r.addr,6),got:hex(r.got),want:hex(r.want),what:r.what}));
  check('field_after_probe',await inField(),'trampoline restored');
}
