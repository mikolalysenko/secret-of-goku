// Measured resident palette. Selection/audition: snes/test/audio/effects.mjs.
// Nine one-track effects, 142 bytes including pointers, all boot samples.
export const RESIDENT = [
 {id:0xDC,name:'clink',sequence:[0xD2,0xC0,0xEA,5,0xE4,2,0xD6,24,64,0x53,0xF2]},
 {id:0xDD,name:'impact',sequence:[0xD2,0xA8,0xEA,3,0xE4,6,0xD6,48,64,0x50,0xF2]},
 {id:0xDE,name:'ki-warp',sequence:[0xD2,0xC0,0xEA,9,0xE4,4,0xD6,96,12,0x4D,0xF2]},
 {id:0xDF,name:'charged',sequence:[0xD2,0xA0,0xEA,9,0xE4,6,0xD6,24,220,0x53,0xF2]},
 {id:0xE0,name:'transform',sequence:[0xD2,0xC0,0xEA,1,0xE4,4,0xD6,255,12,0x4B,0xB8,0xF2]},
 {id:0xE1,name:'burst',sequence:[0xD2,0xC0,0xEA,0,0xE4,4,0xD6,192,220,0xD3,192,0,0x4B,0xF2]},
 {id:0xE2,name:'disc',sequence:[0xD2,0xC0,0xEA,9,0xE4,6,0xD6,48,220,0x50,0xF2]},
 {id:0xE3,name:'air-release',sequence:[0xD2,0xC0,0xEA,8,0xE4,6,0xD6,48,220,0xD3,48,0,0x50,0xF2]},
 {id:0xE4,name:'beam',sequence:[0xD2,0xB0,0xEA,3,0xE4,6,0xD6,144,64,0x4C,0xF2]},
];
// Indexed by stable AUDIO_SFX id. $00 is a real retail effect (laser).
// Silent voice entries are rejected by priority, not by their effect byte.
export const NATIVE_IDS=[0,0xDC,0xBF,0xDD,0xA3,0xDE,0xDD,0x0E,
 0xE4,0xDF,0xE0,0xE3,0xE1,0xDC,0xDC,0xDC,0xDE,0xDE,0xDD,0xE3,
 0xE1,0xE2,0x00,0xE4,0xDD,0xE1,0xDD,0xE4,0,0,0,0,0];
export const NATIVE_PRIORITY=[0,1,1,5,5,3,5,2,7,4,8,8,8,5,5,5,
 6,6,2,2,3,3,3,7,5,7,3,7,0,0,0,0,0];
// Internal selector row: held charge uses the longer rumble, while the
// short CHARGED one-shot and quieter aura keep $DF. Public ids stay 1-32.
export const NATIVE_CHARGE_CUE=33;
export const NATIVE_BEDS={charge:0xDD,aura:0xDF,friezaCharge:0xDD};
export function residentAsm(){
 const h=n=>'$'+n.toString(16).toUpperCase().padStart(2,'0');
 const size=RESIDENT.reduce((n,r)=>n+4+r.sequence.length,0);
 if(size>144)throw Error(`resident palette uses ${size}/144 bytes`);
 return [...RESIDENT.map(r=>`dw resident_${r.id.toString(16)}-!resident_rom+!resident_aram,0`),
  ...RESIDENT.flatMap(r=>[`resident_${r.id.toString(16)}: ; ${r.name}`,`db ${r.sequence.map(h).join(',')}`])].join('\n')+'\n';
}
export function nativeMapAsm(){
 return `!AUDIO_NATIVE_CHARGE = ${NATIVE_CHARGE_CUE}\naudio_native_ids:\ndb ${[...NATIVE_IDS,NATIVE_BEDS.charge].join(',')}\naudio_native_priority:\ndb ${[...NATIVE_PRIORITY,4].join(',')}\n`;
}
