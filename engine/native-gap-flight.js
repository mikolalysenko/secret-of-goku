// Native whip pads (event 6D8) and post hits (6FA) share the original 6F9
// crossing. Bypass equipment/fastening; retain party gathering, movement,
// camera and the balanced CF01 collision flag in the original event script.
// Post descriptor/direction lookup verified against FastWhipPosts research;
// see CREDITS.md. The cartridge buffer and disk ROM remain unchanged.
export function createNativeGapFlight(snes,mod){
  const r=snes.ram,word=a=>r[a]|r[a+1]<<8;
  const state={active:false,map:-1,crossings:0};
  let cart=null,read=null;
  const enabled=()=>mod.options.enabled&&mod.gokuActive&&(r[0xe000]&1)&&(r[0xe02c]&1)&&word(0xd4)===0;
  function direction(){
    const x=word(0xe002)>>4,y=word(0xe004)>>4,layer=(r[0xe00b]&0x80)?1:0;
    const dirs=[[0,-4,0],[0,4,1],[4,0,2],[-4,0,0x82]];
    dirs.sort((a,b)=>(b[2]===r[0xe010])-(a[2]===r[0xe010]));
    for(const [dx,dy,facing]of dirs){
      const tx=x+dx,ty=y+dy;if(tx<0||tx>=128||ty<0||ty>=128)continue;
      const tile=r[0x10000+layer*0x4000+ty*128+tx],descriptor=0x1b800+layer*0x400+tile*4;
      if(r[descriptor+2]===0xf8&&r[descriptor+3]===0x6f)return facing;
    }
    return null;
  }
  function gapRead(bank,address){
    const offset=((bank&0x3f)<<16)|address;
    const entry=offset>=0xa90da&&offset<0xa90e1?0xa90da:offset>=0xa927a&&offset<0xa9283?0xa927a:null;
    if((bank&0xc0)===0xc0&&entry!==null&&enabled()){
      if(offset===entry){
        const facing=direction();
        if(facing===null)return 0; // No matching post: end, never jump blindly.
        r[0xe010]=facing;state.active=true;state.map=word(0xdc);state.crossings++;
        mod.cancelCombat();mod.localFlight=false;mod.localLift=0;mod.playSound?.('flight');
      }
      return offset===entry?0x16:offset===entry+1?0xf9:0;
    }
    return read.call(this,bank,address);
  }
  return{
    get active(){return state.active;},get crossings(){return state.crossings;},
    load(){
      if(cart?.read===gapRead)cart.read=read;
      cart=snes.cart;read=cart.read;
      for(const [at,bytes]of [[0xa90da,[0x4e,0,0xe4,4,0x16,0xd7,0]],[0xa927a,[0x4e,0,0xe4,4,0x16,0xfb,0x20,7,0]]])
        if(!bytes.every((v,i)=>cart.data[at+i]===v))throw Error('Unsupported native whip crossing event');
      cart.read=gapRead;this.restore();
    },
    tick(){if(state.active&&(word(0xdc)!==state.map||!mod.options.enabled||r[0xd0]===0)){if(mod.options.enabled&&word(0xdc)===state.map)mod.playSound?.('landing');state.active=false;}},
    snapshot(){return{...state};},
    restore(saved){Object.assign(state,{active:false,map:-1,crossings:0},saved||{});},
    dispose(){if(cart?.read===gapRead)cart.read=read;},
  };
}
