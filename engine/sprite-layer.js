/* Goku enters the PPU's OBJ layer, before background priority, windows,
 * brightness and color math. No artwork is painted over the completed frame.
 * Sprite evaluation follows SnesJs, Copyright (c) 2019 angelo_wf
 * (MIT; vendor/snes/LICENSE.txt). */
class ManaSpriteLayer {
  constructor(snes, mod) {
    this.snes=snes;this.mod=mod;this.atlas={};this.customLine=new Uint16Array(256);
    this.surface=new Uint16Array(256*256);this.effectMask=new Uint8Array(256*256);this.effects={};this.plan=null;this.paletteCache=new Map();
    const ppu=snes.ppu,self=this;
    this.originalEvaluate=ppu.evaluateSprites;this.originalColor=ppu.getColor;
    ppu.evaluateSprites=function(line){
      if(!mod.options.enabled||!self.atlas.goku||mod.ending?.nativeBoy||(mod.gokuActive===false&&!mod.arrival?.animating)){
        self.customLine.fill(0);mod.hiddenLastFrame=[];self.plan=null;return self.originalEvaluate.call(this,line);
      }
      if(line===0||!self.plan||self.plan.frame!==mod.frame||self.plan.oamRevision!==mod.ownership?.revision)self.prepare();
      if(!self.plan.anchor&&!self.plan.portraits.size){self.customLine.fill(0);return self.originalEvaluate.call(this,line);}
      self.evaluate(this,line);
    };
    ppu.getColor=function(sub,x,y){
      const result=self.originalColor.call(this,sub,x,y);
      if(result[1]===4&&self.customLine[x])result[0]=self.customLine[x]-1;
      const face=self.savePortrait(this,x,y);
      if(face){result[0]=face-1;result[1]=1;result[2]=1;}
      return result;
    };
  }
  savePortrait(ppu,x,y){
    if(!this.mod.options.enabled||!this.atlas.goku||ppu.mode!==5||x<94||x>=110||y<31||y>=191)return 0;
    if(this.saveFrame!==this.mod.frame){
      this.saveFrame=this.mod.frame;this.saveFaces=0;
      // The native four-slot file window, not naming, shops or ring icons.
      // C7:5BDA uses four $400-byte records with $1000-byte backup copies;
      // C7:5C3B leaves two validation bits per slot in $A215.
      if(ppu.tilemapAdr?.[1]===0x5800&&[2,8,14,20].every(row=>
        (ppu.vram[0x5800+row*32+7]&0xc3ff)===0x20&&
        (ppu.vram[0x5800+(row+5)*32+7]&0xc3ff)===0x8020)){
        const invalid=this.mod.read8(0xa215),sram=this.snes.cart?.sram;
        for(let slot=0;slot<4;slot++){
          const bits=(invalid>>(slot*2))&3,at=slot*0x400+((bits&1)?0x1000:0);
          if(bits!==3&&sram?.[at]===0xc5&&sram[at+0x2bb]===0x3a&&[0xa1,0xa9,0xa5,0xaf,0].every((v,i)=>sram[at+3+i]===v))this.saveFaces|=1<<slot;
        }
      }
    }
    const slot=Math.floor((y-31)/48),row=y-31-slot*48;
    if(!(this.saveFaces&(1<<slot))||row>=16)return 0;
    const a=this.atlas.goku;return a.pixels[(32+Math.floor(row*21/16))*a.width+3+Math.floor((x-94)*26/16)];
  }
  load(images){
    for(const [name,image] of Object.entries(images)){
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
      const bytes=context.getImageData(0,0,canvas.width,canvas.height).data,pixels=new Uint16Array(canvas.width*canvas.height);
      for(let i=0;i<pixels.length;i++)if(bytes[i*4+3])pixels[i]=1+((bytes[i*4]>>3)|((bytes[i*4+1]>>3)<<5)|((bytes[i*4+2]>>3)<<10));
      this.atlas[name]={pixels,width:canvas.width,height:canvas.height};
    }
  }
  rgb(r,g,b){return 1+((r>>3)|((g>>3)<<5)|((b>>3)<<10));}
  pixel(x,y,color,effect=false){x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<256){const i=y*256+x;if(effect&&this.behindBody&&this.surface[i]&&!this.effectMask[i])return;this.surface[i]=color;this.effectMask[i]=effect?1:0;}}
  stamp(group,frame,x,y,dx=1,dy=0){
    const frames=this.effects[group];if(!frames?.length)return;
    const pixels=frames[((frame%frames.length)+frames.length)%frames.length];
    // Original 16x16 OBJ cells, with exact quarter turns and no resampling.
    for(let py=0;py<16;py++)for(let px=0;px<16;px++){
      const color=pixels[py*16+px],u=px-8,v=py-8;
      if(color)this.pixel(x+dx*u-dy*v,y+dy*u+dx*v,color,true);
    }
  }
  giantBeam(x,y,dx,dy,length,halfWidth,phase,{taper=44,farScale=1}={}){
    // A solid blue-white core, using only Lucent Beam's original colors.
    // Work in native pixels: no stretched sprites, alpha glow or canvas layer.
    const colors=[...new Set((this.effects['beam-body']||[]).flatMap(p=>Array.from(p)))].filter(Boolean).sort((a,b)=>a-b);
    if(colors.length<4)return;
    const radius=d=>halfWidth*Math.min(1,(d+8)/taper)*(1-(1-farScale)*d/Math.max(1,length));
    const x0=Math.max(0,Math.floor(Math.min(x,x+dx*length)-halfWidth-2)),x1=Math.min(255,Math.ceil(Math.max(x,x+dx*length)+halfWidth+2));
    const y0=Math.max(0,Math.floor(Math.min(y,y+dy*length)-halfWidth-2)),y1=Math.min(223,Math.ceil(Math.max(y,y+dy*length)+halfWidth+2));
    for(let py=y0;py<=y1;py++)for(let px=x0;px<=x1;px++){
      const ox=px-x,oy=py-y,d=ox*dx+oy*dy,across=Math.abs(ox*dy-oy*dx);
      if(d<0||d>length)continue;
      const edge=radius(d)*Math.min(1,Math.sqrt(Math.max(0,(length-d)/12)));
      const ripple=((Math.floor(d/8)+phase)%3===0?2:0),distance=edge-across;
      if(distance<0)continue;
      const color=distance<3+ripple?colors[0]:distance<9+ripple?colors[1]:distance<17+ripple?colors[2]:colors[3];
      this.pixel(px,py,color,true);
    }
    // Native sparks and short, blue Thunderbolt arcs race down both edges.
    for(let d=18+(phase*7)%28;d<Math.min(length,360);d+=28)for(const side of[-1,1]){
      const across=side*(radius(d)-2),px=x+dx*d-dy*across,py=y+dy*d+dx*across;
      this.stamp((Math.floor(d/28)+phase)%3?'impact-spark':'lightning',phase%2,px,py,dx,dy);
    }
    this.stamp('charge-orb',4,x,y,dx,dy);
  }
  chargeLightning(x,y){
    const m=this.mod,state=m.status,origin={x:x+state.cameraX,y:y+state.cameraY};
    const arcs=m.lightning?.(origin)||[];this.plan.lightning=arcs;
    for(const arc of arcs){
      // Use only the original Thunderbolt palette, including its bright core.
      const colors=[...new Set(this.effects.lightning?.[arc.phase%this.effects.lightning.length]||[])].filter(Boolean);
      if(!colors.length)continue;
      colors.sort((a,b)=>{const light=c=>(c-1&31)+((c-1>>5)&31)+((c-1>>10)&31);return light(a)-light(b);});
      const core=colors.at(-1),edge=colors[Math.max(0,colors.length-2)];
      for(let i=1;i<arc.points.length;i++){
        const a=arc.points[i-1],b=arc.points[i],steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
        for(let n=0;n<=steps;n++){
          const px=Math.round(a.x+(b.x-a.x)*n/(steps||1)-state.cameraX),py=Math.round(a.y+(b.y-a.y)*n/(steps||1)-state.cameraY);
          this.pixel(px+1,py,edge,true);this.pixel(px,py,core,true);
        }
      }
      const p=arc.points[Math.floor(arc.points.length/2)],a=arc.points[0],b=arc.target;
      const horizontal=Math.abs(b.x-a.x)>Math.abs(b.y-a.y);
      this.stamp('lightning',arc.phase,p.x-state.cameraX,p.y-state.cameraY,horizontal?0:1,horizontal?1:0);
      if(b.kind!=='air')this.stamp('impact-spark',arc.phase,b.x-state.cameraX,b.y-state.cameraY);
    }
  }
  blit(sheet,column,row,x,y,width=32,height=32,legs=null){
    const a=this.atlas[sheet];
    for(let py=0;py<height;py++)for(let px=0;px<width;px++){
      const lx=Math.floor(px*32/width),ly=Math.floor(py*32/height);
      const hand=(row===1&&lx>=23)||(row===2&&lx<10)||(row===3&&lx>=22);
      const sourceColumn=legs!==null&&ly>=24&&!hand?legs:column;
      const sx=sourceColumn*32+lx,sy=32+row*32+ly;
      const color=a.pixels[sy*a.width+sx];if(color)this.pixel(x+px,y+py,color);
    }
  }
  boyMenuPalette(ppu){
    const rom=this.snes.cart?.data;
    if(!rom||!ppu.cgram)return false;
    // Full-screen menus reuse one OAM palette for the selected character.
    // Match the original boy palette so Primm/Popoi keep their own artwork.
    for(let i=1;i<16;i++){
      const at=0x80ffe+0x80*30+i*2;
      if(ppu.cgram[0x90+i]!==((rom[at]|rom[at+1]<<8)&0x7fff))return false;
    }
    return true;
  }
  tint(color,palette){
    const rom=this.snes.cart?.data,p=this.snes.ppu;
    if(!rom||!p.cgram)return color;
    let cache=this.paletteCache.get(palette);
    if(!cache){
      const base=[],current=[];
      for(let i=0;i<16;i++){const at=0x80ffe+0x80*30+i*2;base.push((rom[at]|rom[at+1]<<8)&0x7fff);current.push(p.cgram[0x80+palette*16+i]);}
      cache={base,current,colors:new Map(),normal:base.slice(1).every((c,i)=>c===current[i+1])};this.paletteCache.set(palette,cache);
    }
    if(cache.normal)return color;
    if(cache.colors.has(color))return cache.colors.get(color);
    const rgb=color-1,r=rgb&31,g=(rgb>>5)&31,b=(rgb>>10)&31;
    let result;
    if(this.mod.read8(0xe190)&0x40){
      // The native petrify palette has six statue shades; use those very
      // colors on Goku rather than drawing the original boy's stone statue.
      const ramp=[1,6,5,4,3,2],shade=Math.min(5,Math.round((r*3+g*6+b)/62));
      result=1+cache.current[ramp[shade]];
    }else{
      const skin=new Set([0x0d50,0x1df5,0x32bb,0x3b1e,0x15b5,0x2a58,0x19b4,0x4efb,0x1592]);
      const candidates=rgb===0?[1]:skin.has(rgb)?[5,6,7]:[1,2,3,4,8,9,10,11,12,13,14,15];
      let index=candidates[0],distance=Infinity;
      for(const i of candidates){const c=cache.base[i],d=(r-(c&31))**2+(g-((c>>5)&31))**2+(b-((c>>10)&31))**2;if(d<distance){index=i;distance=d;}}
      const before=cache.base[index],after=cache.current[index],clamp=x=>Math.max(0,Math.min(31,x));
      result=1+clamp(r+(after&31)-(before&31))+(clamp(g+((after>>5)&31)-((before>>5)&31))<<5)+(clamp(b+((after>>10)&31)-((before>>10)&31))<<10);
    }
    cache.colors.set(color,result);return result;
  }
  prepare(){
    const m=this.mod,p=this.snes.ppu,parts=[],hidden=new Set(),portraits=new Map(),flight=m.nativeFlight??m.worldFlight,replacing=m.gokuActive!==false;
    const passengers=new Set(m.localFlightHook?.passengers??[]);
    this.surface.fill(0);this.effectMask.fill(0);this.paletteCache.clear();this.behindBody=false;
    // Title screens and naming menus have no ground actor. In particular,
    // never mistake their reused OAM tile numbers for the player.
    // $E4/$E5 are brightness fade timers. Door/boss fades continue displaying
    // the native actor, so its DMA ownership decides when to replace it.
    const displayed=m.ownership?.ppuOwners.find(owner=>owner?.base===0xe000&&owner.kind==='body');
    const hud=m.ownership?.ppuOwners.find(owner=>owner?.base===0xe000&&owner.kind==='portrait');
    const ground=!!displayed||(m.read8(0xe4)===1&&m.read8(0xe5)===1&&(m.read8(0xe000)&1));
    const naming=m.nameEditor&&m.read8(0xe4)===0&&m.read8(0xe5)===0;
    // Save confirmation uses the same eight OBJ cells as Status, but clears
    // the text-panel flag. Its Mode 5 layout still needs the boy replacement.
    const menuBoy=ground&&(m.read8(0x2c)!==0||p.mode===5)&&m.read8(0xec)===0&&this.boyMenuPalette(p);
    const menuParts=[];
    // Snowman and moogle are shared native transformation sprites, not Randi
    // artwork. Keep their actual animation and matching transformed portraits.
    const nativeForm=(ground||hud)&&((((displayed??hud)?.native.status1??m.read8(0xe190))&0x20)||(((displayed??hud)?.native.status2??m.read8(0xe191))&0x10));
    // Balloon, Barrel and Engulf reuse the weapon OBJ slots for their native
    // covering/effect. Preserve those cells over the replacement body.
    const weaponEffect=ground&&(m.read8(0xe191)&0x45);
    let flyItem=-1;
    if(ground&&(m.read8(0xec)&8)&&m.read8(0x1809)===0)for(let i=0;i<12;i++){
      const item=m.read8(0xcc48+i);if(item===255)break;if((item&31)===7){flyItem=i;break;}
    }
    if(ground||hud||flight||naming)for(let index=0;index<256;index+=2){
      const attr=p.oam[index+1],tile=attr&255,palette=(attr>>9)&7;
      let x=p.oam[index]&255,y=p.oam[index]>>8;
      x|=((p.highOam[index>>4]>>(index&15))&1)<<8;if(x>255)x-=512;
      const size=p.spriteSizes[p.objSize+(((p.highOam[index>>4]>>(index&15))&2)?8:0)]*8;
      if(y>=256-size)y-=256;
      if(y>=224||y<=-size||x<=-size||x>=256)continue;
      // Water uses palette 5 (the color-math-enabled copy of player palette 1).
      const owner=m.ownership?.ppuOwners[index/2];
      // Ferry passengers ride with Goku as during world flight. Hide only
      // their owned body/attachment/shadow cells, retaining the native HUD.
      if(passengers.has(owner?.base)){hidden.add(index);continue;}
      const body=ground&&!nativeForm&&(m.ownership?owner?.base===0xe000&&owner.kind==='body':(palette===1||palette===5)&&(attr&0x100)&&tile>=0xc0&&tile<0xe8);
      const nameBody=naming&&palette===1&&!(attr&0x100)&&tile>=0x30&&tile<=0x37;
      if(menuBoy&&palette===1&&!(attr&0x100)&&tile>=0x30&&tile<=0x37&&size===8)menuParts.push({index,x,y,size,tile,palette,priority:(attr>>12)&3});
      const dragon=flight&&palette===5;
      const portrait=!nativeForm&&(m.ownership?owner?.base===0xe000&&owner.kind==='portrait':ground&&(palette===1||palette===5)&&(attr&0x100)&&tile===0xe8);
      const flyIcon=flyItem>=0&&index/2===18+flyItem&&!(attr&0x100)&&tile===0xe0+flyItem*2&&size===16;
      const senzuIcon=size===16&&m.senzu?.iconMatches(p,attr);
      const dustIcon=size===16&&m.equipment?.iconMatches(p,attr,index/2);
      // The waterfall engine also moves the weapon to color-math palette 4.
      const screenX=m.read16(0xe020)<<16>>16,screenY=m.read16(0xe022)<<16>>16;
      const sword=ground&&!nativeForm&&!weaponEffect&&(palette===0||palette===4)&&(attr&0x100)&&[0x44,0x46,0x48].includes(tile)&&Math.abs(x-screenX)<48&&Math.abs(y-screenY)<48;
      if(body||dragon||nameBody){parts.push({index,x,y,size,palette,priority:(attr>>12)&3,owner:body?owner:null});if(replacing)hidden.add(index);}
      else if(portrait&&replacing){portraits.set(index,{x:x+(tile===0x0a?3:0),y:y+(tile===0x0a?2:0),size:tile===0x0a?10:16,palette,priority:(attr>>12)&3});hidden.add(index);}
      else if(flyIcon&&replacing){portraits.set(index,{x,y,size:16,palette,priority:(attr>>12)&3,kind:'fly'});hidden.add(index);}
      else if(senzuIcon){portraits.set(index,{x,y,size:16,palette,priority:(attr>>12)&3,kind:'senzu',flipX:!!(attr&0x4000),flipY:!!(attr&0x8000)});hidden.add(index);}
      else if(dustIcon){portraits.set(index,{x,y,size:16,palette,priority:(attr>>12)&3,kind:'dust'});hidden.add(index);}
      else if(m.gapFlight?.active&&owner?.base===0xe000&&['attachment','cached-attachment'].includes(owner.kind))hidden.add(index);
      else if(sword&&replacing)hidden.add(index);
    }
    // Status and Action Grid use the same 2-by-4 cell character as naming.
    // Require the complete native arrangement, not just reused tile numbers.
    const menuOrigin=menuParts.find(part=>part.tile===0x30);
    const menuBody=menuOrigin&&menuParts.length===8&&menuParts.every(part=>part.x===menuOrigin.x+((part.tile-0x30)&1)*8&&part.y===menuOrigin.y+((part.tile-0x30)>>1)*8);
    if(menuBody)for(const part of menuParts){parts.push(part);hidden.add(part.index);}
    m.hiddenLastFrame=[...hidden].map(i=>i/2);
    const docking=flight&&m.flight?.docking;
    const anchor=parts.length?parts.reduce((a,b)=>a.index<b.index?a:b):docking?{index:0,x:112,y:68,size:32,palette:5,priority:3}:null;
    this.plan={frame:m.frame,oamRevision:m.ownership?.revision,anchor,hidden,parts,portraits};
    if(!anchor){
      if(m.arrival?.animating){this.plan.anchor={index:0,x:0,y:0,size:8,palette:0,priority:3};m.arrival.drawScene(this);}
      return;
    }
    if(m.arrival?.drawScene(this))return;
    const superForm=m.options.superSaiyan;
    // Native direction changes also cover scripted walks and conversations.
    const display=anchor.owner;
    const direction=display?.native.facing??m.read8(0xe010);if(ground&&!m.action)m.facing=(direction&0x7f)===0?3:(direction&0x7f)===1?0:(direction&0x80)?2:1;
    m.motion??=new window.GokuAnimation(m);
    const pose=m.motion.pose({flight,menu:!!(naming||menuBody),displayed:display?.native}),{row,column}=pose;
    if(docking){
      // A pixel-stepped quadratic arc zips from the world-flight position
      // into the actual projected Fortress. Its native fade remains intact.
      const point=t=>({x:(1-t)**2*128+2*(1-t)*t*210+t*t*docking.x,y:(1-t)**2*84-2*(1-t)*t*12+t*t*docking.y});
      const at=point(docking.t),size=32-16*docking.t;
      const colors=[this.rgb(56,136,248),this.rgb(160,224,248),this.rgb(248,248,248)];
      for(let t=Math.max(0,docking.t-.38);t<docking.t;t+=.004){const q=point(t),bright=Math.min(2,Math.floor((t-docking.t+.38)*8));this.pixel(q.x,q.y,colors[bright],true);if(bright>0)this.pixel(q.x,q.y+1,colors[bright-1],true);}
      this.blit(pose.sheet,column,row,Math.round(at.x-size/2),Math.round(at.y-size/2),Math.round(size),Math.round(size));
      this.plan.sprite={x:at.x-size/2,y:at.y-size/2,width:size,height:size,row,column,sheet:pose.sheet,kind:'fortressApproach'};
      return;
    }
    const small=ground&&!menuBody&&m.read8(0xe180)===0xf6,size=small?16:32;
    const x=flight?112+(pose.bank||0)*2:(naming||menuBody)?Math.min(...parts.map(a=>a.x))-8:(display?.anchor.x??(m.read16(0xe020)<<16>>16))-size/2;
    const y=flight?68+(pose.bob||0):(naming||menuBody)?Math.min(...parts.map(a=>a.y)):Math.round((display?.anchor.renderedFeetY??((m.read16(0xe022)<<16>>16)-pose.lift))-31*size/32)-(pose.extraLift||0);
    this.plan.sprite={x,y,width:size,height:size,row,column,facing:m.facing,sheet:pose.sheet,kind:pose.kind,age:pose.age,legs:pose.legs};
    // Every crop includes all 32 source rows, including the boots on row 31.
    // The game keeps its own ground shadow; no browser clipping is involved.
    const powering=m.action?.kind==='transform'||m.action?.kind==='revert',aura=(superForm&&m.charging)||powering;
    if(aura&&(m.canAttack||flight)){
      // Lucid Barrier's original quarter-circle cells and discrete gold cycle.
      const phase=Math.floor(m.frame/4),ax=x+size/2-16,ay=y+size-32;
      for(const [ox,oy,dx,dy]of [[8,8,1,0],[24,8,0,1],[24,24,-1,0],[8,24,0,-1]])this.stamp('gold-arc',phase,ax+ox,ay+oy,dx,dy);
      this.stamp('gold-spark',phase,ax+4,ay+10);
      this.stamp('gold-spark',phase+2,ax+28,ay+22);
      if(m.charging)this.chargeLightning(x+size/2,y+size/2);
    }
    if(m.action?.kind==='focus'&&(m.canAttack||flight)){
      const power=m.powerCharge/96,phase=m.frame>>2,cx=x+size/2,cy=y+size/2;
      const radius=6+power*12,count=4+Math.floor(power*4),gold=superForm;
      this.plan.power=power;
      for(let i=0;i<count;i++){
        const angle=i*Math.PI*2/count,rad=radius+((phase+i)%3-1)*2;
        const [dx,dy]=[[1,0],[0,1],[-1,0],[0,-1]][Math.floor(i*4/count)];
        this.stamp(gold?'gold-arc':'aura-arc',phase+i,Math.round(cx+Math.cos(angle)*rad),Math.round(cy+Math.sin(angle)*rad*1.3),dx,dy);
      }
      for(let i=0;i<Math.floor(power*6);i++){
        const rise=(m.frame*2+i*9)%44,side=i&1?1:-1;
        this.stamp(gold?'gold-spark':'impact-spark',phase+i,cx+side*(10+(i%3)*3),cy+22-rise);
      }
      if(power>.65)for(let i=0;i<4;i++){
        const angle=(i*1.57+m.frame*.19),rad=radius+4;
        this.stamp('lightning',phase+i,Math.round(cx+Math.cos(angle)*rad),Math.round(cy+Math.sin(angle)*rad));
      }
    }
    const shadow=m.flightShadow;
    if(flight&&shadow){const cx=(shadow.minX+shadow.maxX)/2,cy=(shadow.minY+shadow.maxY)/2;for(let yy=-2;yy<=2;yy++)for(let xx=-8;xx<=8;xx++)if(xx*xx/64+yy*yy/4<=1)this.pixel(cx+xx,cy+yy,this.rgb(40,56,48));}
    m.ceiling?.draw(this);
    m.challenge?.draw(this);m.powerIntro?.draw(this);
    this.blit(pose.sheet,column,row,x,y,size,size,pose.legs??null);
    // Follow original poison/stone/ghost/flash palette changes before the PPU
    // applies its own window, water blend and brightness operations.
    if(ground&&!menuBody)for(let yy=Math.max(0,y);yy<Math.min(256,y+size);yy++)for(let xx=Math.max(0,x);xx<Math.min(256,x+size);xx++){
      const i=yy*256+xx;if(this.surface[i]&&!this.effectMask[i])this.surface[i]=this.tint(this.surface[i],anchor.palette);
    }
    if(ground&&!menuBody)m.hitRecovery?.draw(this,x,y,size);
    if(m.charging&&(m.canAttack||flight)){
      const form=window.GokuAnimationData.forms[superForm?'ssj':'goku'],socket=form.sockets[superForm?18:22][row];
      const strength=m.charge/(superForm?45:90),frame=strength>=1?3+Math.floor(m.frame/4)%2:Math.min(4,Math.floor(strength*5));
      this.behindBody=!flight&&row===3;this.stamp('charge-orb',frame,x+socket[0]*size/32,y+socket[1]*size/32);this.behindBody=false;
    }
    if(flight){m.worldKi?.draw(this);return;}
    if(!m.canAttack)return;
    const state=m.status;
    for(const effect of m.effects){
      this.behindBody=effect.dy<0&&(effect.kind==='beam'||effect.kind==='ki');
      const sx=effect.x-state.cameraX,sy=effect.y-state.cameraY;
      const age=effect.max-effect.life,phase=Math.floor(age/2);
      if(effect.kind==='rubble'){
        for(let i=0;i<6;i++){
          const a=(i*2.39996+effect.seed),px=sx+Math.cos(a)*age*(.7+i%3*.3),py=sy-4-age*(1+i%3*.5)+age*age*.075,size=1+i%2;
          for(let y=-size;y<=size;y++)for(let x=-size;x<=size;x++)if(Math.abs(x)+Math.abs(y)<=size+1)this.pixel(px+x,py+y,1+effect.colors[y<0?2:x<0?1:0],true);
          if(age>6&&age<26)this.pixel(px-2,py+4,1+effect.colors[1],true);
        }
        continue;
      }
      if(effect.kind==='powerBurst'){
        // The whole damage radius lights up on the ignition frame, then
        // dissipates outward using native spell cells at their original size.
        this.behindBody=true;
        const radius=effect.radius+age*1.5,count=age<8?16:8;
        for(let i=0;i<count;i++){
          const angle=i*Math.PI*2/count,dx=Math.cos(angle),dy=Math.sin(angle),turn=Math.round(i*4/count)%4;
          const [ax,ay]=[[1,0],[0,1],[-1,0],[0,-1]][turn];
          this.stamp(age<8?'gold-arc':'gold-spark',phase+i,Math.round(sx+dx*radius),Math.round(sy+dy*radius),ax,ay);
          if(age<5)this.stamp('gold-spark',phase+i,Math.round(sx+dx*radius*.45),Math.round(sy+dy*radius*.45));
        }
        this.behindBody=false;continue;
      }
      if(effect.kind==='punch'){
        // The punch sheets already contain their own white motion arcs. A
        // missed swing must not look like an impact against an invisible wall.
        continue;
      }
      if(effect.kind==='impact'){
        const group=effect.super?'gold-spark':'impact-spark';
        this.stamp(group,Math.min(5,Math.floor(age/2)),sx,sy,effect.dx,effect.dy);
        if(age<5){this.stamp(group,Math.floor(age/2),sx-7,sy+3);this.stamp(group,Math.floor(age/2),sx+7,sy-3);}
        continue;
      }
      if(effect.kind==='ki'){
        const distance=Math.min(effect.range,(age+1)*14),prefix=effect.super?'gold-':'';
        if(effect.life<=0)continue;
        for(let i=2;i>=0;i--)this.stamp(prefix+'charge-orb',Math.max(0,3-i),sx+effect.dx*(distance-i*7),sy+effect.dy*(distance-i*7),effect.dx,effect.dy);
        if(age<2)this.stamp(prefix+'charge-orb',1,sx,sy);
        continue;
      }
      // Super Saiyan amplifies the blue Kamehameha; gold belongs to the aura.
      const {length,halfWidth,taper}=m.beamGeometry(effect);
      if(effect.mega){this.giantBeam(sx,sy,effect.dx,effect.dy,length,halfWidth,phase,{taper});continue;}
      const prefix='',bands=Math.max(1,Math.round(effect.width/4))+(effect.super?2:0);
      // The native beam strip is 16x4. Tile it at original pixel size; the
      // number of parallel strips reflects charge rather than scaling artwork.
      for(let band=0;band<bands;band++){
        const across=Math.round((band-(bands-1)/2)*3);
        for(let d=8;d<length;d+=16)this.stamp(prefix+'beam-body',phase,sx+effect.dx*d-effect.dy*across,sy+effect.dy*d+effect.dx*across,effect.dx,effect.dy);
      }
      this.stamp(prefix+'beam-head',phase,sx+effect.dx*length,sy+effect.dy*length,effect.dx,effect.dy);
      this.stamp(prefix+'charge-orb',4,sx,sy);
    }
    this.behindBody=false;
  }
  inject(ppu,line){
    const a=this.plan.anchor,part=this.plan.parts.find(p=>line>=p.y&&line<p.y+p.size)||a;
    const airborne=this.mod.localFlight||this.mod.localLift>0||this.mod.flightTransition||this.mod.ceiling?.pose;
    for(let x=0;x<256;x++){const i=line*256+x,color=this.surface[i];if(color){
      // Original spell OBJs use palette 0, priority 3 and no OBJ color math,
      // independently of Goku's water palette or background priority.
      ppu.spriteLineBuffer[x]=this.effectMask[i]?0x86:0x81+(airborne?part.palette&3:part.palette)*16;
      ppu.spritePrioBuffer[x]=this.effectMask[i]||airborne?3:part.priority;this.customLine[x]=color;
    }}
  }
  injectPortrait(ppu,line,portrait){
    const row=line-portrait.y;if(row<0||row>=portrait.size)return;
    const atlas=this.atlas[this.mod.options.superSaiyan?'ssj':'goku'];
    for(let col=0;col<portrait.size;col++){
      if(portrait.kind==='senzu'||portrait.kind==='dust'){
        const item=portrait.kind==='senzu'?this.mod.senzu:this.mod.equipment;
        const x=portrait.x+col,color=item.pixel(portrait.flipX?15-col:col,portrait.flipY?15-row:row);
        if(color&&x>=0&&x<256){ppu.spriteLineBuffer[x]=0x81+portrait.palette*16;ppu.spritePrioBuffer[x]=portrait.priority;this.customLine[x]=color;}
        continue;
      }
      if(portrait.kind==='fly'){
        const column=(this.mod.options.superSaiyan?36:40)+Math.floor(this.mod.frame/8)%4,x=portrait.x+col;
        const color=atlas.pixels[(32+row*2)*atlas.width+column*32+col*2];
        if(color&&x>=0&&x<256){ppu.spriteLineBuffer[x]=0x81+portrait.palette*16;ppu.spritePrioBuffer[x]=portrait.priority;this.customLine[x]=color;}
        continue;
      }
      const sx=3+Math.floor(col*26/portrait.size),sy=32+Math.floor(row*21/portrait.size),x=portrait.x+col;
      const raw=atlas.pixels[sy*atlas.width+sx],color=raw?this.tint(raw,portrait.palette):0;
      if(color&&x>=0&&x<256){ppu.spriteLineBuffer[x]=0x81+portrait.palette*16;ppu.spritePrioBuffer[x]=portrait.priority;this.customLine[x]=color;}
    }
  }
  evaluate(p,line){
    this.customLine.fill(0);let spriteCount=0,sliverCount=0;
    let index=p.objPriority?((p.oamAdr&0xfe)-2)&0xff:254;
    for(let i=0;i<128;i++,index=(index-2)&0xff){
      if(index===this.plan.anchor?.index)this.inject(p,line);
      if(this.plan.portraits.has(index))this.injectPortrait(p,line,this.plan.portraits.get(index));
      const hidden=this.plan.hidden.has(index);
      let x=p.oam[index]&255,y=p.oam[index]>>8,tile=p.oam[index+1]&255,ex=p.oam[index+1]>>8;
      x|=((p.highOam[index>>4]>>(index&15))&1)<<8;if(x>255)x-=512;
      const big=(p.highOam[index>>4]>>(index&15))&2,size=p.spriteSizes[p.objSize+(big?8:0)];
      let sprRow=line-y;if(sprRow<0||sprRow>=size*(p.objInterlace?4:8))sprRow=line+256-y;
      if(sprRow<0||sprRow>=size*(p.objInterlace?4:8)||x<=-size*8)continue;
      if(spriteCount===32){p.rangeOver=true;break;}
      sprRow=p.objInterlace?sprRow*2+(p.evenFrame?1:0):sprRow;
      const adr=p.sprAdr1+((ex&1)?p.sprAdr2:0);if(ex&0x80)sprRow=size*8-1-sprRow;
      const tileRow=sprRow>>3;sprRow&=7;
      for(let k=0;k<size;k++)if(x+k*8>-7&&x+k*8<256){
        if(sliverCount===34){sliverCount=35;break;}
        const tileColumn=(ex&0x40)?size-1-k:k,tileNum=(tile+p.spriteTileOffsets[tileRow*8+tileColumn])&255;
        const lo=p.vram[(adr+tileNum*16+sprRow)&0x7fff],hi=p.vram[(adr+tileNum*16+sprRow+8)&0x7fff];
        for(let j=0;j<8;j++){
          const shift=(ex&0x40)?j:7-j,data=((lo>>shift)&1)|(((lo>>(8+shift))&1)<<1)|(((hi>>shift)&1)<<2)|(((hi>>(8+shift))&1)<<3),xx=x+k*8+j;
          if(!hidden&&data&&xx>=0&&xx<256){p.spriteLineBuffer[xx]=0x80+data+16*((ex&14)>>1);p.spritePrioBuffer[xx]=(ex&0x30)>>4;this.customLine[xx]=0;}
        }
        sliverCount++;
      }
      if(sliverCount===35){p.timeOver=true;break;}spriteCount++;
    }
  }
  destroy(){this.snes.ppu.evaluateSprites=this.originalEvaluate;this.snes.ppu.getColor=this.originalColor;}
}
window.ManaSpriteLayer=ManaSpriteLayer;
