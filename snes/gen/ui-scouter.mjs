// Scouter cells and number layouts. Font/colours come from ui.mjs's checked
// extraction of engine/scouter.js; powerLevel is the browser's implementation.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {powerLevel,formatPower} from '../../engine/scouter.js';
import {TRAINING_GI,trainingPenalty} from '../../engine/native-equipment.js';

export function scouterData({glyphs,outDir,xdata,def,rd}) {
  const formats=[],runs=[],byRun=new Map();
  const runId=s=>{if(!byRun.has(s)){byRun.set(s,runs.length);runs.push(s);}return byRun.get(s);};
  const add=n=>{const text=formatPower(n),parts=[];for(let i=0;i<text.length;i+=3)parts.push(runId(text.slice(i,i+3)));formats.push({n,text,parts});return formats.length-1;};
  // Generic actors: two significant figures, including carry into a new decade.
  for(let scale=0;scale<7;scale++)for(let lead=0;lead<100;lead++)add(lead*10**scale);
  const charge=[];
  for(const superSaiyan of [false,true])for(const weighted of [false,true])for(let q=0;q<=90;q++) {
    const mod={options:{superSaiyan},charging:true,charge:q,equipment:{powerScale:weighted?trainingPenalty.power:1}};
    charge.push(add(powerLevel(mod,{index:0})));
  }
  const frieza=[false,true].map(muscular=>add(powerLevel({frieza:{status:{boss:{muscular}}}},{custom:'frieza'})));
  const cells=[];
  function tile(img,tx,ty){const b=Buffer.alloc(32);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const pixel=img[(ty*8+y)*16+tx*8+x],c=pixel?pixel+13:0;for(let p=0;p<4;p++)b[(p>>1)*16+y*2+(p&1)]|=((c>>p)&1)<<(7-x);}return b;}
  const cell=img=>Buffer.concat([tile(img,0,0),tile(img,1,0),tile(img,0,1),tile(img,1,1)]);
  // Seven top-clipping variants keep the radio's y<72 mask pixel-exact.
  for(const s of runs){const img=new Uint8Array(256),green=[];
    [...s].forEach((ch,i)=>glyphs[ch].forEach((row,y)=>{for(let x=0;x<3;x++)if(row&(128>>x))green.push([1+i*4+x,1+y]);}));
    for(const [x,y] of green)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)img[(y+dy)*16+x+dx]=1;
    for(const [x,y] of green)img[y*16+x]=2;
    for(let cut=0;cut<7;cut++){const clipped=img.slice();clipped.fill(0,0,cut*16);cells.push(cell(clipped));}
  }
  const corner=cells.length;
  // One L, reused with OBJ flips. Partial radio clipping selects a variant
  // for the stored orientation (top crop or bottom crop before V-flip).
  for(let v=0;v<2;v++)for(let cut=0;cut<4;cut++){
    const img=new Uint8Array(256);for(let i=0;i<4;i++){img[i]=2;img[i*16]=2;}
    for(let y=0;y<4;y++)if(v?y>=4-cut:y<cut)img.fill(0,y*16,(y+1)*16);
    cells.push(cell(img));
  }
  // Every glyph/corner fits the upper eight rows. Store only those two
  // tiles; the lower row streams from UI_ZERO_ROWS in the original ROM.
  // Keep full cells below for the decoder/reference artifact.
  if(cells.some(c=>c.subarray(64).some(v=>v!==0)))throw Error('scouter cell needs a nonblank lower row');
  const blobs=[];for(let at=0;at<cells.length;at+=256){const name=`ui_sc_cells_${blobs.length}`;const data=Buffer.concat(cells.slice(at,at+256).map(c=>c.subarray(0,64)));xdata(name,data);blobs.push({name,at,count:data.length/64});}
  rd.push('ui_sc_banks:');for(const {name} of blobs)rd.push(`\tdl !XDATA_${name.toUpperCase()}`);
  def.push(`!UI_SC_CORNER = ${corner}`,`!UI_SC_CELL_COUNT = ${cells.length}`,`!UI_SC_GI = ${TRAINING_GI}`);
  rd.push('ui_sc_charge:');for(let i=0;i<charge.length;i+=12)rd.push('\tdw '+charge.slice(i,i+12).map(x=>x*10).join(','));
  rd.push('ui_sc_frieza: dw '+frieza.map(x=>x*10).join(','));
  const fmt=Buffer.alloc(formats.length*10,255);formats.forEach((f,i)=>{fmt[i*10]=f.text.length*2-1;fmt[i*10+1]=f.parts.length;f.parts.forEach((v,j)=>fmt.writeUInt16LE(v*7,i*10+2+j*2));});
  xdata('ui_sc_formats',fmt);
  writeFileSync(join(outDir,'scouter-cells.bin'),Buffer.concat(cells));
  writeFileSync(join(outDir,'scouter.json'),JSON.stringify({runs,formats,charge,frieza,corner,cells:cells.length}));
  // Decode every generated cell: green bits must be exactly the browser font,
  // with no truncation at cell edges (the third glyph ends at x=11).
  for(let k=0;k<runs.length;k++)for(let cut=0;cut<7;cut++)for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const b=cells[k*7+cut],off=((y>>3)*2+(x>>3))*32+(y&7)*2,bit=7-(x&7);
    const raw=(b[off]>>bit&1)|(b[off+1]>>bit&1)<<1|(b[off+16]>>bit&1)<<2|(b[off+17]>>bit&1)<<3;
    const got=raw?raw-13:0;
    const green=(px,py)=>py>=1&&py<=5&&px>=1&&px<=11&&((glyphs[runs[k][Math.floor((px-1)/4)]]?.[py-1]??0)&(128>>((px-1)%4)))!==0;
    let want=0;if(y>=cut){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(green(x+dx,y+dy))want=1;if(green(x,y))want=2;}
    if(got!==want)throw Error(`scouter font mismatch: ${runs[k]} cut ${cut} at ${x},${y}`);
  }
}
