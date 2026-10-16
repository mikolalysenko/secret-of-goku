// Title-only BG2 substitution, before SNES palette lookup, windows and fades.
// The game decompresses its own logo/font into VRAM; no ROM graphics are stored
// here. Only the new GOKU letter silhouettes are authored by this project.

export const TITLE_CREDIT = 'PROGRAMMED BY NASIR AND CHATGPT';
export const TITLE_LOGO_RECT = Object.freeze({x:143,y:56,width:49,height:48});
const TITLE_MAP = 0x800;
const ORIGINAL_CREDIT = 'PROGRAMMED BY NASIR';
const tileFor = char => char === ' ' ? 0x60 : char.charCodeAt(0) - 64 + 0x60;
const creditRow = Array.from({length:32},(_,x)=>0x2000|tileFor(ORIGINAL_CREDIT[x-6]??' '));
const signature = [[8,7,0],[9,7,1],[23,7,15],[8,9,32],[23,11,79],[12,12,20],[17,12,23]];

export function isNativeTitle(ppu) {
  return ppu.mode===3 && ppu.tileAdr[1]===0 && ppu.tilemapAdr[1]===TITLE_MAP &&
    ppu.mainScreenEnabled[1] && !ppu.bigTiles[1] &&
    signature.every(([x,y,tile])=>ppu.vram[TITLE_MAP+y*32+x]===(0x2000|tile));
}

// Tall initial and condensed small capitals follow the original logo's metrics.
// # is gold ink; the bevel below uses the title's existing gold CGRAM entries.
const letters = [
  {x:1,y:5,rows:[
    '....#####....',
    '...##...##...',
    '..###....##..',
    '.###......##.',
    '.###.......#.',
    '###........##',
    '###........##',
    '###.........#',
    '###.........#',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###.....#####',
    '###......###.',
    '###.......##.',
    '###.......##.',
    '###.......##.',
    '###.......##.',
    '###.......##.',
    '.###......##.',
    '.###......##.',
    '..###....###.',
    '..###...#.##.',
    '...##..#..##.',
    '....###....#.',
  ]},
  {x:16,y:17,rows:[
    '...###...',
    '..##.##..',
    '.###..##.',
    '.##....#.',
    ...Array(13).fill('###....##'),
    '.##....#.',
    '.###..##.',
    '..##.##..',
    '...###...',
  ]},
  {x:27,y:17,rows:[
    '#####..###',
    '.###...##.',
    '.###...#..',
    '.###..##..',
    '.###..#...',
    '.###..#...',
    '.###.##...',
    '.###.#....',
    '.#####....',
    '.#####....',
    '.######...',
    '.###.##...',
    '.###.###..',
    '.###..##..',
    '.###..##..',
    '.###..###.',
    '.###...##.',
    '.###...##.',
    '.###...###',
    '.###...###',
    '#####.####',
  ]},
  {x:38,y:17,rows:[
    '#####..###',
    ...Array(15).fill('.###....#.'),
    '.###....#.',
    '..##...##.',
    '..###..#..',
    '...####...',
    '....##....',
  ]},
];

function makeGoldLetters() {
  const {width,height}=TITLE_LOGO_RECT, ink=new Uint8Array(width*height),pixels=new Uint8Array(ink.length);
  for(const {x,y,rows} of letters)for(let row=0;row<rows.length;row++)for(let col=0;col<rows[row].length;col++) {
    if(rows[row][col]==='#')ink[(y+row)*width+x+col]=1;
  }
  const at=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&ink[y*width+x];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    let color=0;
    if(at(x,y))color=at(x+1,y)?8:at(x-1,y)?9:8;
    else if(at(x-1,y)&&at(x-1,y-1))color=12;
    else if(at(x,y-1)&&at(x-1,y-1))color=11;
    else if([-1,0,1].some(dy=>[-1,0,1].some(dx=>at(x+dx,y+dy))))color=14;
    pixels[y*width+x]=color;
  }
  return pixels;
}

const goldLetters=makeGoldLetters();

function fontPixel(vram,tile,x,y) {
  const address=tile*16+y,low=vram[address],high=vram[address+8],bit=7-x;
  return ((low>>bit)&1)|(((low>>(bit+8))&1)<<1)|(((high>>bit)&1)<<2)|(((high>>(bit+8))&1)<<3);
}

export function createTitleLayer(ppu) {
  const layer={enabled:true,active:false,creditVisible:false};
  const renderLine=ppu.renderLine,getPixel=ppu.getPixelForLayer;
  ppu.renderLine=function(line) {
    if(line===0) {
      layer.active=layer.enabled&&isNativeTitle(ppu);
      layer.creditVisible=layer.active&&creditRow.every((word,x)=>ppu.vram[TITLE_MAP+17*32+x]===word);
    }
    return renderLine.call(this,line);
  };
  ppu.getPixelForLayer=function(x,y,bg,priority) {
    if(layer.active&&layer.enabled&&bg===1&&priority===1&&ppu.mode===3) {
      const {x:left,y:top,width,height}=TITLE_LOGO_RECT;
      if(x>=left&&x<left+width&&y>=top&&y<top+height)return goldLetters[(y-top)*width+x-left];
      if(layer.creditVisible&&y>=136&&y<144&&x>=0&&x<256) {
        // A half-cell inset centers all 31 original 8×8 font cells.
        const local=x-4;
        if(local<0||local>=TITLE_CREDIT.length*8)return 0;
        return fontPixel(ppu.vram,tileFor(TITLE_CREDIT[local>>3]),local&7,y&7);
      }
    }
    return getPixel.call(this,x,y,bg,priority);
  };
  const patch={layer:1,prio:1,mask:new Uint8Array(256),values:new Uint16Array(256)};
  // BG2 row the per-pixel path would query on this line (mosaic, scroll).
  const rowOf=(p,line)=>{let y=line;if(p.mosaicEnabled[1])y-=(y-p.mosaicStartLine)%p.mosaicSize;return y+p.bgVoff[1];};
  ppu.registerLineHook?.('getPixelForLayer',ppu.getPixelForLayer,getPixel,(p,line)=>{
    if(!(layer.active&&layer.enabled&&p.mode===3))return true;
    const y=rowOf(p,line),{y:top,height}=TITLE_LOGO_RECT;
    return !(y>=top&&y<top+height)&&!(layer.creditVisible&&y>=136&&y<144);
  },(p,line,plan)=>{
    // The same replacement as the wrapper above, for every screen x.
    if(plan.layerPatch)return false;
    const y=rowOf(p,line),{x:left,y:top,width,height}=TITLE_LOGO_RECT;
    patch.mask.fill(0);
    for(let x=0;x<256;x++){
      let lx=x;if(p.mosaicEnabled[1])lx-=lx%p.mosaicSize;lx+=p.bgHoff[1];
      if(lx>=left&&lx<left+width&&y>=top&&y<top+height){patch.mask[x]=1;patch.values[x]=goldLetters[(y-top)*width+lx-left];}
      else if(layer.creditVisible&&y>=136&&y<144&&lx>=0&&lx<256){
        const local=lx-4;patch.mask[x]=1;
        patch.values[x]=local<0||local>=TITLE_CREDIT.length*8?0:fontPixel(p.vram,tileFor(TITLE_CREDIT[local>>3]),local&7,y&7);
      }
    }
    plan.layerPatch=patch;return true;
  });
  return layer;
}
