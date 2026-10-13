// Keep the original Flammie rescue, NPCs, flags and event choreography. Only
// these text spans change: the dragon is a friend, rather than Goku's mount.
const encode=text=>Uint8Array.from(text,c=>{
  if(c==='\n')return 0x7f;if(c===' ')return 0x80;
  const n=c.charCodeAt(0);if(n>=97&&n<=122)return n+32;if(n>=65&&n<=90)return n+90;
  const punctuation={'.':0xbf,',':0xc0,"'":0xc2,':':0xc5,'!':0xc8,'?':0xca};
  if(c in punctuation)return punctuation[c];throw Error(`Unsupported flight dialogue character ${c}`);
});
export const flightDialogue=[
  {at:0xa39b2,before:" It's way too big for us to\n carry! Let's ask Truffle.",after:" I can carry him! ...Gently.\n Let's ask Truffle."},
  {at:0xa3a05,before:"TRUFFLE:He'll only slow you\n down...so I'll raise him!",after:"TRUFFLE:I'll raise him!\n Don't fly inside my house."},
  {at:0xa5fb6,before:":We're finished!",after:':I can fly!'},
  {at:0xa617a,before:" Take this Flammie Drum.\n It's his favorite toy.",after:' Keep this drum as a toy.\n You can already fly!'},
  {at:0xa61ad,before:" Use it anywhere and he'll\n come to you!",after:" Fly us home! Please don't\n drop anyone."},
  {at:0xaa139,before:'Flammie Drum',after:'Fly',name:true},
].map(patch=>{
  if(patch.after.length>patch.before.length)throw Error('Flight dialogue exceeds its native span');
  if(patch.after.split('\n').some(line=>line.length>28))throw Error('Flight dialogue exceeds native line width');
  const bytes=encode(patch.after.padEnd(patch.before.length,' '));if(patch.name)bytes[patch.after.length]=0;
  return Object.freeze({...patch,bytes,original:encode(patch.before)});
});
export function installFlightDialogue(cart,enabled=()=>true){
  for(const patch of flightDialogue)if(!patch.original.every((byte,i)=>cart.data[patch.at+i]===byte))throw Error(`Unsupported Flammie text at ${patch.at.toString(16)}`);
  const read=cart.read;
  function flightRead(bank,address){
    const offset=((bank&0x3f)<<16)|address;
    if((bank&0xc0)===0xc0&&enabled())for(const patch of flightDialogue)if(offset>=patch.at&&offset<patch.at+patch.bytes.length)return patch.bytes[offset-patch.at];
    return read.call(this,bank,address);
  }
  cart.read=flightRead;
  return{dispose(){if(cart.read===flightRead)cart.read=read;}};
}
