// Compare two renders of one native machine state. Only the deliberate player,
// portrait and weapon replacement regions may differ; all other pixels must
// still come from the original PPU. Used by the local graphics audit, not play.
export async function comparePresentation(page) {
  return page.evaluate(() => {
    const saved=mana.snapshot(),options={...mana.mod.options},layer=mana.mod.spriteLayer;
    const modState={};for(const key of ['frame','facing','charge','charging','attackFrames','attackCooldown','attackHeld','nativeTapFrames','moving','worldFlight','nameEditor','input','lastInput'])modState[key]=mana.mod[key];
    modState.effects=mana.mod.effects.map(effect=>({...effect}));
    const mask=new Uint8Array(256*256),prepare=layer.prepare;
    const mark=(x,y,w,h)=>{
      for(let yy=Math.max(0,y);yy<Math.min(256,y+h);yy++)
        for(let xx=Math.max(0,x);xx<Math.min(256,x+w);xx++)mask[yy*256+xx]=1;
    };
    layer.prepare=function(){
      prepare.call(this);
      const p=mana.snes.ppu,plan=this.plan;
      for(const index of plan.hidden){
        let x=(p.oam[index]&255)|(((p.highOam[index>>4]>>(index&15))&1)<<8);
        if(x>255)x-=512;
        const size=p.spriteSizes[p.objSize+(((p.highOam[index>>4]>>(index&15))&2)?8:0)]*8;
        let y=p.oam[index]>>8;if(y>=256-size)y-=256;
        mark(x,y,size,size);
      }
      for(const portrait of plan.portraits.values())mark(portrait.x,portrait.y,portrait.size,portrait.size);
      if(plan.sprite)mark(plan.sprite.x,plan.sprite.y,plan.sprite.width,plan.sprite.height);
      for(let i=0;i<this.surface.length;i++)if(this.surface[i])mask[i]=1;
    };
    try{
      mana.mod.configure({enabled:false,power:false});mana.run(1);
      const native=mana.snes.ppu.pixelOutput.slice();
      mana.restore(saved);Object.assign(mana.mod,modState);mana.mod.configure({enabled:true,power:false});mana.run(1);
      const pixels=mana.snes.ppu.pixelOutput;let changed=0,unexpected=0,masked=0;const examples=[];
      for(let line=1;line<225;line++)for(let x=0;x<256;x++){
        const i=line*1536+x*6,allowed=mask[(line-1)*256+x];
        if(allowed)masked++;
        let differs=false;for(let c=0;c<6;c++)if(native[i+c]!==pixels[i+c]){differs=true;break;}
        if(differs){changed++;if(!allowed){unexpected++;if(examples.length<12)examples.push({x,y:line-1});}}
      }
      const plan=layer.plan;
      return{map:mana.read16(0xdc),menu:mana.read8(0xec),event:mana.read8(0xd0),changed,unexpected,masked,examples,
        sprite:plan?.sprite||null,bodyParts:plan?.parts.length||0,portraits:plan?.portraits.size||0,
        palette:plan?.anchor?.palette??null,brightness:mana.snes.ppu.brightness,forcedBlank:mana.snes.ppu.forcedBlank};
    }finally{
      layer.prepare=prepare;
      mana.mod.configure(options);
    }
  });
}
