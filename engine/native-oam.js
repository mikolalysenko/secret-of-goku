// Native sprite ownership sidecar. Original ROM/core behavior remains intact.
// Each tag follows a native actor descriptor into WRAM OAM, then follows the
// *actual DMA bytes* into PPU OAM. WRAM and PPU ownership are separate buffers.
export function installNativeOamOwnership(s){
  const r=s.ram,p=s.ppu,oldRead=s.read,oldWrite=s.write,oldBus=s.writeBBus;
  const ramOwners=new Array(128).fill(null),ppuOwners=new Array(128).fill(null),words=new Array(256).fill(null);
  const stats={descriptors:0,shadows:0,unknown:0,commits:0,dmaSources:new Set(),writers:new Map()};
  let source=null,pending=null,revision=0,serial=0;
  const w=a=>r[a]|r[a+1]<<8,signed=a=>(w(a)<<16)>>16;
  const copy=value=>value==null?null:JSON.parse(JSON.stringify(value));
  const metadata=tag=>{
    if(!tag)return null;
    const b=tag.base,shadowHeight=r[b+0x74]&0x7f;
    return{...tag,serial:++serial,
      native:{map:w(0xdc),x:w(b+2),y:w(b+4),actorFlags:r[b],species:r[b+0x180],animation:r[b+0x11],latchedAnimation:r[b+0x31],graphicFrame:w(b+0x26),sequence:w(b+0x18),scriptPc:w(b+0x16),facing:r[b+0x10],latchedFacing:r[b+0x30],lift:r[b+0x45],shadowHeight,status1:r[b+0x190],status2:r[b+0x191],screenX:signed(b+0x20),screenY:signed(b+0x22)},
      // $04/$06 already include the original renderer's shake and vertical
      // lift. renderedFeetY therefore must NOT subtract native.lift again.
      anchor:tag.kind==='body'?{x:signed(4),baseY:signed(6),renderedFeetY:signed(6)+shadowHeight,dx:(r[tag.descriptor]<<24)>>24,dy:(r[tag.descriptor+1]<<24)>>24}:null,
    };
  };
  const normalize=a=>{
    const bank=a>>>16,off=a&65535;
    if(bank===0x7e||bank===0x7f)return (bank&1)*65536+off;
    return off<0x2000&&(bank<0x40||(bank>=0x80&&bank<0xc0))?off:-1;
  };
  const classify=(pc,x)=>{
    if((pc&0x3fffff)===0x00e6ab){
      // Source descriptors are passed in X, not tied to a tile or palette.
      if(x>=0xe090){
        const base=x&0xfe00,relative=x-base,n=r[base+0x83]&15;
        if(relative>=0x90&&relative<0x90+n*4&&!(relative&3))return{base,actor:(base-0xe000)/0x200,kind:'body',descriptor:x};
        if(relative>=0xd0&&relative<0x110&&!(relative&3))return{base,actor:(base-0xe000)/0x200,kind:'attachment',descriptor:x};
      }
      // C000 cached animation/weapon cells also pass through this routine.
      // The native renderer's current actor remains at direct-page $14.
      const actorOffset=r[0x14]|r[0x15]<<8;
      if(x>=0xc000&&x<0xd000&&!(actorOffset&0x1ff)&&actorOffset<=0x1e00)return{base:0xe000+actorOffset,actor:actorOffset/0x200,kind:'cached-attachment',descriptor:x};
    }
    if((pc&0x3fffff)===0x00e874&&!(x&0x1ff)&&x<=0x1e00)return{base:0xe000+x,actor:x/0x200,kind:'shadow',descriptor:null};
    return null;
  };
  s.write=function(a,v,dma){
    const off=normalize(a);
    if(off>=0x800&&off<0xa00){
      const byte=(off-0x800)&3,slot=(off-0x800)>>2;
      if(byte===0)ramOwners[slot]=null;
      if(byte===2){
        const c=s.cpu,pc=c.r[1]*65536+c.br[4],tag=metadata(classify(pc,c.br[1]));ramOwners[slot]=tag;
        stats.writers.set(pc,(stats.writers.get(pc)||0)+1);
        if(tag?.kind==='body')stats.descriptors++;else if(tag?.kind==='shadow')stats.shadows++;else if(!tag)stats.unknown++;
      }
      if(byte===1&&v===0xf0)ramOwners[slot]=null;
    }
    return oldWrite.call(this,a,v,dma);
  };
  s.read=function(a,dma){
    const value=oldRead.call(this,a,dma),off=normalize(a);
    source=dma&&off>=0x800&&off<0xa00?{offset:off,value,owner:ramOwners[(off-0x800)>>2]}:null;
    if(source)stats.dmaSources.add(a>>>16);
    return value;
  };
  s.writeBBus=function(a,v){
    if(a===4&&!p.oamInHigh){
      if(!p.oamSecond)pending=source&&source.value===v?source:null;
      else{
        const at=p.oamAdr,slot=at>>1;
        const copied=pending&&source&&source.value===v&&source.offset===pending.offset+1;
        words[at]=copied?{sourceSlot:(source.offset-0x800)>>2,owner:source.owner}:null;
        ppuOwners[slot]=null;
        if(at&1){
          const xy=words[at-1],attr=words[at];
          if(xy&&attr&&xy.sourceSlot===attr.sourceSlot&&xy.owner?.serial===attr.owner?.serial)ppuOwners[slot]=attr.owner;
          stats.commits++;
        }
        revision++;
        pending=null;
      }
    }
    source=null;
    return oldBus.call(this,a,v);
  };
  return{
    ramOwners,ppuOwners,stats,
    get revision(){return revision;},
    reset(){ramOwners.fill(null);ppuOwners.fill(null);words.fill(null);source=pending=null;revision++;},
    snapshot(){return{version:1,ramOwners:copy(ramOwners),ppuOwners:copy(ppuOwners),words:copy(words),source:copy(source),pending:copy(pending),serial};},
    restore(state){
      this.reset();
      if(state?.version!==1||!Array.isArray(state.ramOwners)||state.ramOwners.length!==128||!Array.isArray(state.ppuOwners)||state.ppuOwners.length!==128||!Array.isArray(state.words)||state.words.length!==256)return false;
      for(let i=0;i<128;i++){ramOwners[i]=copy(state.ramOwners[i]);ppuOwners[i]=copy(state.ppuOwners[i]);}
      for(let i=0;i<256;i++)words[i]=copy(state.words[i]);
      source=copy(state.source);pending=copy(state.pending);serial=Number(state.serial)||0;
      return true;
    },
    stop(){s.read=oldRead;s.write=oldWrite;s.writeBBus=oldBus;},
  };
}
