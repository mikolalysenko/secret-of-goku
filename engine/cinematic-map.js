// Read-only scenery for the collateral montage. Decode the selected cartridge
// into a separate picture; never load a town into the running boss's map RAM.
import {decodeMapPiece,decodeMetatiles} from '../tools/rom/map-codec.mjs';
export function cinematicMap(rom,id){
 const word=a=>rom[a]|rom[a+1]<<8,long=a=>word(a)|rom[a+2]<<16;
 const header=0x80000+word(0x87000+id*2),set=rom[header+2]&63;
 const metatiles=decodeMetatiles(rom.subarray(long(0xb4000+set*3),long(0xb4003+set*3))).metatiles;
 const pieces=[];let layer=0,width=0,height=0;
 for(let a=0x80000+word(0x85000+id*2),end=0x80000+word(0x85002+id*2);a<end;){
  if(rom[a]>=254){layer=rom[a++]===255?1:0;continue;}
  const flag=rom[a],min=rom[a+1]>>4,max=rom[a+1]&15,part=rom[a+2]|(rom[a+3]&1)<<8|(rom[a+4]&1)<<9;
  const bank=part<0xa3?13:part<0x206?14:part<0x300?15:12,at=bank*65536+word(0xd0004+part*2);
  const p=decodeMapPiece(rom.subarray(at));p.x=rom[a+3]>>1;p.y=rom[a+4]>>1;p.layer=layer;
  // Intact towns, independent of the player's flags; their destruction is
  // the shot's narrative, not a persistent mutation of shop/door scripts.
  const value=flag===0x10?6:0;if(value>=min&&value<=max)pieces.push(p);
  width=Math.max(width,p.x+p.width);height=Math.max(height,p.y+p.height);a+=5;
 }
 const layers=[new Int16Array(width*height).fill(-1),new Int16Array(width*height).fill(-1)];
 for(const p of pieces)for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)layers[p.layer][(p.y+y)*width+p.x+x]=p.tiles[y*p.width+x]+(rom[header+2]&(p.layer?128:64)?192:0);
 const gfx=[],gfxId=rom[header]&63;
 const tile=(at,bpp=4,fill=0)=>{
  const out=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++){let c=fill;for(let p=0;p<bpp;p++)c|=(rom[at+(bpp===3&&p===2?16+y:(p>>1)*16+y*2+(p&1))]>>(7-x)&1)<<p;out[y*8+x]=c;}return out;
 };
 for(let a=0xc0000+word(0xce27e+gfxId*2),end=0xc0000+word(0xce280+gfxId*2);a<end;a+=3){
  const n=word(a),mode=n>>>13,bpp=mode===6?4:mode>=4?3:2,fill=bpp===2?((mode&2)?4:0)|((mode&1)?8:0):bpp===3&&(mode&1)?8:0;
  for(let i=0;i<=rom[a+2];i++)gfx.push(tile(long(0xce270+(bpp-2)*3)+((n&8191)+i)*bpp*8,bpp,fill));
 }
 for(let g=0;g<8;g++)for(let i=0;i<4;i++)gfx[864+g*4+i]=tile(0x1c8000+(rom[0x80441+rom[0x80400+gfxId]*2+g]&63)*512+i*32);
 const palette=0xc8000+(rom[header+1]&127)*210,pixels=new Uint16Array(width*16*height*16);
 for(const[layer,priority]of[[1,0],[0,0],[1,1],[0,1]])for(let cell=0;cell<layers[layer].length;cell++){
  const id=layers[layer][cell];if(id<0)continue;
  for(let s=0;s<4;s++){const n=metatiles[id][s];if((n>>13&1)!==priority)continue;const art=gfx[n&1023];if(!art)continue;
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=art[(n&32768?7-y:y)*8+(n&16384?7-x:x)],p=n>>10&7;if(c)pixels[(Math.floor(cell/width)*16+(s>>1)*8+y)*width*16+(cell%width)*16+(s&1)*8+x]=p?1+(word(palette+(p-1)*30+(c-1)*2)&0x7fff):0;}
  }
 }
 return{pixels,width:width*16,height:height*16};
}
