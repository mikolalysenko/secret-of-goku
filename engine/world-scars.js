import {decodePotosCrater} from './native-crater.js';

// Positions come from the cartridge's world takeoff table, in 12-bit pixels.
export const blastTowns=[[131,'Potos'],[144,'Pandora'],[168,'Kippo'],[223,'Matango'],[228,'Todo'],[89,'Kakkara'],[114,'Southtown'],[115,'Northtown'],[113,'Gold City'],[63,'Mandala'],[24,'Tasnica']];
const delta=(a,b)=>((a-b+2048)&4095)-2048;
export function createWorldScars(snes,mod){
  const p=snes.ppu,renderLine=p.renderLine,getColor=p.getColor,texture=new Uint16Array(1024*1024);
  let scars=[],art=null,viewKey=null,visible=false;
  const position=map=>({x:snes.cart.data[0x67a80+map*2]*16,y:snes.cart.data[0x67a81+map*2]*16});
  function rebuild(){
    texture.fill(0);const x=mod.read16(0xfa)&4095,y=mod.read16(0xfc)&4095;
    for(const scar of scars){
      // The native world renderer streams a wrapping 1024px texture around
      // the camera. Cull other continents before wrapping the scar into it.
      if(Math.abs(delta(scar.x,x))>480||Math.abs(delta(scar.y,y))>480)continue;
      const width=scar.size,height=Math.round(width*2/3),left=scar.x-(width>>1),top=scar.y-(height>>1);
      for(let py=0;py<height;py++)for(let px=0;px<width;px++){
        const color=art.pixels[Math.floor(py*art.height/height)*art.width+Math.floor(px*art.width/width)];
        if(color)texture[((top+py)&1023)*1024+((left+px)&1023)]=color;
      }
    }
  }
  p.renderLine=function(line){
    if(line===0){
      visible=!!art&&scars.length>0&&mod.options.enabled&&mod.gokuActive&&mod.worldFlight;
      if(visible){const key=`${mod.read16(0xfa)>>6}:${mod.read16(0xfc)>>6}:${scars.length}`;if(key!==viewKey){viewKey=key;rebuild();}}
    }
    return renderLine.call(this,line);
  };
  p.getColor=function(sub,x,y){
    const result=getColor.call(this,sub,x,y);
    if(visible&&this.mode===7&&result[1]===0){
      const rx=this.mode7FlipX?255-x:x,px=(this.mode7Xcoords[rx]>>8)&1023,py=(this.mode7Ycoords[rx]>>8)&1023;
      const color=texture[py*1024+px];if(color)result[0]=color-1;
    }
    return result;
  };
  const scarLine=new Uint16Array(256);
  p.registerLineHook?.('getColor',p.getColor,getColor,ppu=>!visible||ppu.mode!==7,(ppu,line,plan)=>{
    if(plan.bg1Color)return false;
    for(let x=0;x<256;x++){
      const rx=ppu.mode7FlipX?255-x:x,px=(ppu.mode7Xcoords[rx]>>8)&1023,py=(ppu.mode7Ycoords[rx]>>8)&1023;
      scarLine[x]=texture[py*1024+px];
    }
    plan.bg1Color=scarLine;return true;
  });
  return{
    load(rom){art=decodePotosCrater(rom);viewKey=null;},
    targets(){return blastTowns.filter(([map])=>!scars.some(s=>s.towns.includes(map))).map(([map,name])=>({id:`town-${map}`,map,name,...position(map),radius:32}));},
    strike(target,mega=false){
      const x=Math.round(target.x)&4095,y=Math.round(target.y)&4095,size=mega?224:144;
      const towns=blastTowns.filter(([map])=>{const t=position(map);return Math.hypot(delta(t.x,x),delta(t.y,y))<size*.4;});
      let scar=scars.find(s=>Math.hypot(delta(s.x,x),delta(s.y,y))<24);
      const fresh=towns.filter(([map])=>!scars.some(s=>s.towns.includes(map)));
      if(scar){scar.size=Math.max(scar.size,size);scar.towns=[...new Set([...scar.towns,...towns.map(t=>t[0])])];}
      else{scar={x,y,size,towns:towns.map(t=>t[0])};scars.push(scar);}viewKey=null;
      if(fresh.length){
        mod.radio?.say(`KING KAI:That was ${fresh[0][1]}!\nThere were PEOPLE there!\nGOKU:Oh. Oops. Sorry!`,{frames:240,kind:'collateral'});
        mod.radio?.say("GOKU:I promise to wish\neveryone back when I'm done.\nAnd the houses. My bad.",{frames:260,kind:'collateral'});
      }
      return scar;
    },
    get status(){return structuredClone(scars);},
    snapshot(){return structuredClone(scars);},
    restore(saved){scars=structuredClone(saved??[]);viewKey=null;visible=false;},
  };
}
