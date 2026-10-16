// Character names in dialogue. Native text writes a name as 57h n, and the
// cartridge copies the 12-byte slot $CC00+12n to its text buffer (C0:1866).
//   {0} the hero: GOKU after the crash        {1} the girl   {2} the sprite
//   {3} the boy the player named on the title screen (retail Randi)
// Goku takes over slot 0 at the impact, so the boy's name moves into the
// unused tail of that slot ($CC06-$CC0B; names are at most 6 letters and
// GOKU ends at $CC04). Native saves store whole slots, so it persists. Text
// that names a companion who was never named shows the retail default.
import {encodeText} from './event-codec.js';

export const nameSlot=n=>0xcc00+n*12;
export const boyTail=0xcc06;
export const gokuName=encodeText('GOKU');
export const defaultNames=Object.freeze({1:encodeText('Primm'),2:encodeText('Popoi'),3:encodeText('Randi')});
const unnamedBoy=encodeText('BOY');   // the title editor's editable default
const copyRead=0x1869,copySignature=[0xbd,0x00,0xcc,0x99,0x2f,0xa2];

// A new game fills unnamed slots with FFh; a name ends at 00h.
const nameAt=(ram,at,max)=>{const out=[];for(let i=0;i<max&&ram[at+i]&&ram[at+i]!==0xff;i++)out.push(ram[at+i]);return out;};
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

// At the crash: slot 0 becomes GOKU and keeps the boy's name in its tail.
export function crownGoku(ram){
  const boy=nameAt(ram,nameSlot(0),6),named=same(boy,gokuName)?nameAt(ram,boyTail,6):boy;
  ram.fill(0,nameSlot(0),nameSlot(1));ram.set(gokuName,nameSlot(0));ram.set(named,boyTail);
}
// The name a 57h n code shows: the native slot, or the default when empty.
export function displayName(ram,n){
  if(n===3){const boy=nameAt(ram,boyTail,6);return boy.length&&!same(boy,unnamedBoy)?boy:[...defaultNames[3]];}
  const name=nameAt(ram,nameSlot(n),12);
  return name.length||!defaultNames[n]?name:[...defaultNames[n]];
}
// Overlay text (King Kai's radio, captions) uses the same names as dialogue.
const glyph=b=>b>=0x81&&b<=0x9a?String.fromCharCode(b-32):b>=0x9b&&b<=0xb4?String.fromCharCode(b-90):b>=0xb5&&b<=0xbe?String.fromCharCode(b-133):b===0x80?' ':b===0xc2?"'":b===0xc6?'-':b===0xbf?'.':'';
export const nameText=(ram,n)=>displayName(ram,n).map(glyph).join('');
export const withNames=(ram,text)=>text.replace(/\{([0-3])\}/g,(_,n)=>nameText(ram,Number(n)));

// Serve slot 3 and the defaults only to the cartridge's name-copy loop, so
// nothing else that reads $CC00-$CC2F sees a difference.
export function createNativeNames(snes){
  const read=snes.read,c=snes.cpu;let copy=null,supported=false;
  snes.read=function(address,dma){
    const value=read.call(this,address,dma),low=address&0xffff;
    if(!supported||dma||low<0xcc00||low>=0xcc30||c.br[4]!==copyRead||(c.r[1]&0x3f)!==0)return value;
    const n=(low-0xcc00)/12|0,i=(low-0xcc00)%12;
    if(i===0)copy=displayName(snes.ram,n);
    return copy?.[i]??0;
  };
  return{
    load(rom){supported=copySignature.every((v,i)=>rom[copyRead-3+i]===v);return supported;},
    get supported(){return supported;},
    get status(){return Object.fromEntries([0,1,2,3].map(n=>[n,nameText(snes.ram,n)]));},
    dispose(){if(snes.read!==read)snes.read=read;},
  };
}
