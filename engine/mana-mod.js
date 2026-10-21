/* Hybrid mod: the SNES executes the original game, JavaScript changes selected
 * WRAM fields and composes replacement artwork at the engine's player position.
 * See README.md for experimentally checked addresses and current limitations. */
class ManaMod {
  // Hit stop after a connected jab / cross / kick, base form and Super Saiyan.
  static HIT_STOP=[[5,6,10],[4,5,9]];
  // Push-back of a jab or cross that does not kill: pixels (base, Super
  // Saiyan) over SLIDE_FRAMES, eased like the launch arc but without lift.
  static SLIDE=[10,14];
  static SLIDE_FRAMES=6;
  constructor(snes,{gokuUrl='../../assets/sprites/goku.png',ssjUrl='../../assets/sprites/ssj.png',onLog=()=>{}}={}) {
    this.snes=snes;this.log=onLog;
    this.options={enabled:false,power:true,superSaiyan:false};
    this.images={goku:new Image(),ssj:new Image()};
    this.images.goku.src=gokuUrl;this.images.ssj.src=ssjUrl;
    this.frame=0;this.facing=0;this.charge=0;this.charging=false;this.attackFrames=0;this.attackCooldown=0;this.attackHeld=0;this.nativeTapFrames=0;this.effects=[];
    this.action=null;this.queuedPunch=false;this.combo=0;this.comboUntil=0;this.blastCooldown=0;this.attackBlocked=false;this.knockbacks=[];this.lastMap=null;this.lastTeleportTarget=-1;
    this.before={x:0,y:0};this.moving=false;this.worldFlight=false;this.nameEditor=false;this.flightTransition=null;this.autoLand=false;this.localFlight=false;this.localLift=0;
    this.hiddenLastFrame=[];this.input=0;this.lastInput=0;this.padInput=0;this.lastPadInput=0;this.flightShadow=null;
    this.powerCharge=0;this.powerBlocked=false;this.kiBlocked=false;this.kiHand=0;this.statusRecovery=null;
    this.menuTransition=false;this.menuInputHeld=0;
    this.motion=window.GokuAnimation?new window.GokuAnimation(this):null;
    this.spriteLayer=new window.ManaSpriteLayer(snes,this);
    this.ready=Promise.all(Object.values(this.images).map(image=>image.decode())).then(()=>this.spriteLayer.load(this.images));
    const self=this;
    // Flammie's terrain shadow is an HDMA window mask, not an OAM sprite.
    // Suppress only that Mode 7 background mask and retain its native moving
    // bounds for the much smaller Goku shadow drawn below.
    this.originalGetWindowState=snes.ppu.getWindowState;
    snes.ppu.getWindowState=function(x,layer){
      const masked=self.originalGetWindowState.call(this,x,layer);
      if(self.options.enabled&&self.worldFlight&&this.mode===7&&layer<2){
        if(masked)recordShadow(x);
        return false;
      }
      return masked;
    };
    function recordShadow(x){
      const y=snes.yPos;
      if(!self.flightShadow||self.flightShadow.frame!==self.frame)
        self.flightShadow={minX:x,maxX:x,minY:y,maxY:y,frame:self.frame};
      else {
        const b=self.flightShadow;
        b.minX=Math.min(b.minX,x);b.maxX=Math.max(b.maxX,x);
        b.minY=Math.min(b.minY,y);b.maxY=Math.max(b.maxY,y);
      }
    }
    snes.ppu.registerLineHook?.('getWindowState',snes.ppu.getWindowState,this.originalGetWindowState,
      ppu=>!(self.options.enabled&&self.worldFlight&&ppu.mode===7),
      (ppu,line,plan)=>{if(plan.windowSuppress)return false;plan.windowSuppress=3;plan.onWindowMasked=recordShadow;return true;});
  }
  read8(address){return this.snes.ram[address&0x1ffff]}
  read16(address){return this.read8(address)|this.read8(address+1)<<8}
  readSigned16(address){return this.read16(address)<<16>>16}
  write8(address,value){this.snes.ram[address&0x1ffff]=value&255}
  write16(address,value){this.write8(address,value);this.write8(address+1,value>>8)}
  configure(options){
    if(this.frieza?.permanent)options={...options,superSaiyan:true};
    if(!this.frieza?.permanent&&options.superSaiyan&&(this.poisoned||this.sleeping))options={...options,superSaiyan:false};
    const changed=options.superSaiyan!==undefined&&options.superSaiyan!==this.options.superSaiyan;
    Object.assign(this.options,options);
    if(!this.options.enabled){this.cancelCombat();this.localFlight=false;this.localLift=0;}
    else if(changed&&(this.canAttack||this.worldFlight)){
      this.cancelCombat();
      this.action={kind:this.options.superSaiyan?'transform':'revert',age:0,duration:this.options.superSaiyan?32:20,facing:this.facing,super:this.options.superSaiyan};
      this.playSound?.(this.options.superSaiyan?'transform':'revert');
      if(this.options.superSaiyan)this.powerIntro?.transform();
    }
    this.log(`Mod: ${JSON.stringify(this.options)}`);
  }
  cancelCombat(){this.action=null;this.queuedPunch=false;this.attackHeld=0;this.nativeTapFrames=0;this.charging=false;this.charge=0;this.powerCharge=0;this.attackFrames=0;this.attackCooldown=0;this.blastCooldown=0;this.effects=[];this.feedback?.clearFlash?.();if(this.sound?.cancelCombat)this.sound.cancelCombat();else this.sound?.clear();this.plants?.clear();}
  cancelInput(){this.panelBack=false;this.attackHeld=0;this.nativeTapFrames=0;this.charging=false;this.charge=0;this.powerCharge=0;this.queuedPunch=false;this.attackBlocked=false;this.kiBlocked=false;this.powerBlocked=false;this.input=0;this.lastInput=0;this.padInput=0;this.lastPadInput=0;if(['ready','charge','focus'].includes(this.action?.kind))this.action=null;}
  requestFlight(){
    if(!this.options.enabled||!this.gokuActive||this.worldFlight||!this.canAttack||this.ceiling?.busy||this.ceiling?.bossActive)return false;
    // Taking off from an unfinished Sandship blows it up instead.
    if(this.sandship?.takeoff())return true;
    this.cancelCombat();return this.flight?.request()||this.ceiling?.request()||false;
  }
  recoverStatus(input){
    const map=this.read16(0xdc);
    if(this.statusRecovery&&(this.statusRecovery.map!==map||this.frame>=this.statusRecovery.until))this.statusRecovery=null;
    // Petrification removes the native controller assignment. A solo Goku
    // still needs to hear Focus; never take another party member's controls.
    const owner=(this.read8(0xe02c)&1)||![0xe200,0xe400].some(a=>this.read8(a)&1);
    const field=this.nativeField&&!this.nativeFlight&&!this.ending?.active&&!this.frieza?.inputLocked&&
      this.read8(0xe4)===1&&this.read8(0xe5)===1&&!this.read8(0xd0)&&!(this.read8(0xec)&0xfe)&&!(this.read8(0xed)&0x40)&&
      (this.read8(0xe000)&1)&&this.read16(0xe182)>0&&!(this.read8(0xe191)&0x80);
    if(!field||!owner)return false;
    const status=this.read16(0xe190)&0x4170;
    const focus=(input&0x400)&&!(input&(1|2|0x800|0x200|(1<<16)|(1<<17)));
    if(status&&focus&&!this.statusRecovery){
      this.cancelCombat();this.motion?.reset();
      if((status&0x10)&&this.options.superSaiyan&&!this.frieza?.permanent){this.options.superSaiyan=false;this.playSound?.('revert');}
      this.statusRecovery={map,until:this.frame+180,pending:true,status};
      this.powerBlocked=true;
    }
    const recovery=this.statusRecovery;if(!recovery)return false;
    // Cure stone, sleep, Frosty, Balloon and Engulf through native flags. The
    // cartridge removes the shared body/overlay and restores control; other
    // ailments, companions and HP are untouched.
    if(status)this.write16(0xe190,this.read16(0xe190)&~0x4170);
    if(recovery.pending){
      this.snes.joypad1State=0;
      if(!this.canAttack)return true;
      recovery.pending=false;recovery.until=this.frame+120;
      const shell=recovery.status&0x4000?'fire':recovery.status&0x20?'ice':recovery.status&0x100?'balloon':null,life=shell?28:14;
      this.effects.push({kind:'statusBurst',shell,x:this.read16(0xe002),y:this.read16(0xe004)-16-this.read8(0xe045)-this.localLift,radius:16,life,max:life,super:this.options.superSaiyan});
      if(shell)this.playSound?.(shell==='fire'?'impact':shell==='ice'?'iceBreak':'balloonPop');
      this.playSound?.('powerBurst');this.feedback?.pulse(6);
      // Holding Focus resumes the aura. A held transform chord must be
      // released, so waking up does not silently turn him gold again.
      this.powerBlocked=!!(input&0x100);
    }
    return false;
  }
  // L holds focus. L+A commits to a transformation at full power; L alone
  // never changes form. Other L chords take priority over this stance.
  focus(input){
    const held=!!(input&0x400),transform=held&&!!(input&0x100);
    const wasTransform=!!(this.lastInput&0x400)&&!!(this.lastInput&0x100);
    if(!held){this.powerBlocked=false;this.powerCharge=0;if(this.action?.kind==='focus')this.action=null;return false;}
    if(transform&&!wasTransform&&this.options.superSaiyan&&!this.frieza?.permanent){this.configure({superSaiyan:false});this.action.duration=10;this.powerBlocked=true;return true;}
    if(this.powerBlocked)return true;
    if(this.action&&!['focus','ready'].includes(this.action.kind))return true;
    if(!this.action||this.action.kind!=='focus')this.action={kind:'focus',age:0,duration:0,facing:this.facing,super:this.options.superSaiyan};
    this.powerCharge=Math.min(96,this.powerCharge+1);
    if(transform&&this.powerCharge===96&&!this.poisoned&&!this.sleeping){this.configure({superSaiyan:true});this.powerBlocked=true;}
    return true;
  }
  reset(){this.menuTransition=false;this.menuInputHeld=0;this.trial?.restore();this.equipment?.restore();this.statusRecovery=null;this.scouter?.restore();this.panelBack=false;this.padInput=0;this.lastPadInput=0;this.powerCharge=0;this.powerBlocked=false;this.kiBlocked=false;this.kiHand=0;this.frame=0;this.hitRecovery?.restore();this.cancelCombat();this.sound?.restore();this.combatSound?.restore();this.ownership?.reset();this.feedback?.restore();this.orbs?.restore();this.story?.restore();this.worldKi?.restore();this.barriers?.restore();this.potosGatekeeper?.restore();this.sandship?.restore();this.flight?.restore();this.gapFlight?.restore();this.radio?.restore();this.quest?.restore();this.ceiling?.restore();this.challenge?.restore();this.powerIntro?.restore();this.ending?.restore();this.frieza?.restore();this.flightTransition=null;this.autoLand=false;this.localFlight=false;this.localLift=0;this.localFlightHook?.restore();this.teleport?.restore();this.lastTeleportTarget=-1;this.input=0;this.lastInput=0;this.hiddenLastFrame=[];this.flightShadow=null;this.worldFlight=false;this.nameEditor=false;this.spriteLayer.plan=null;this.attackBlocked=false;this.combo=0;this.comboUntil=0;this.knockbacks=[];this.lastMap=null;this.motion?.reset();}
  snapshot(){
    const fields=['menuTransition','menuInputHeld','statusRecovery','panelBack','padInput','lastPadInput','powerCharge','powerBlocked','kiBlocked','kiHand','frame','facing','nameEditor','worldFlight','flightShadow','charge','charging','attackHeld','nativeTapFrames','action','queuedPunch','combo','comboUntil','blastCooldown','attackBlocked','effects','knockbacks','lastMap','input','lastInput','attackFrames','attackCooldown','autoLand','flightTransition','localFlight','localLift'];
    return JSON.parse(JSON.stringify({version:1,options:this.options,trial:this.trial?.snapshot(),equipment:this.equipment?.snapshot(),scouter:this.scouter?.snapshot(),hitRecovery:this.hitRecovery?.snapshot(),motion:this.motion?.snapshot(),sound:this.sound?.snapshot(),plants:this.plants?.snapshot(),feedback:this.feedback?.snapshot(),ownership:this.ownership?.snapshot(),flight:this.flight?.snapshot(),localFlightState:this.localFlightHook?.snapshot(),teleportState:this.teleport?.snapshot(),gapFlight:this.gapFlight?.snapshot(),orbs:this.orbs?.snapshot(),story:this.story?.snapshot(),worldKi:this.worldKi?.snapshot(),barriers:this.barriers?.snapshot(),potosGatekeeper:this.potosGatekeeper?.snapshot(),sandship:this.sandship?.snapshot(),radio:this.radio?.snapshot(),quest:this.quest?.snapshot(),ceiling:this.ceiling?.snapshot(),challenge:this.challenge?.snapshot(),powerIntro:this.powerIntro?.snapshot(),ending:this.ending?.snapshot(),frieza:this.frieza?.snapshot(),lastTeleportTarget:this.lastTeleportTarget,...Object.fromEntries(fields.map(key=>[key,this[key]]))}));
  }
  restore(saved){
    this.reset();this.equipment?.restore(saved?.equipment);this.hitRecovery?.restore(saved?.hitRecovery);this.worldFlight=this.nativeFlight;this.sound?.restore(saved?.sound);this.plants?.restore(saved?.plants);this.feedback?.restore(saved?.feedback);this.ownership?.restore(saved?.ownership);this.lastTeleportTarget=saved?.lastTeleportTarget??-1;if(saved?.version!==1)return;
    this.flight?.restore(saved?.flight);this.localFlightHook?.restore(saved?.localFlightState);this.teleport?.restore(saved?.teleportState);this.gapFlight?.restore(saved?.gapFlight);this.orbs?.restore(saved?.orbs);this.story?.restore(saved?.story);this.worldKi?.restore(saved?.worldKi);this.barriers?.restore(saved?.barriers);this.potosGatekeeper?.restore(saved?.potosGatekeeper);this.sandship?.restore(saved?.sandship);this.radio?.restore(saved?.radio);this.quest?.restore(saved?.quest);this.ceiling?.restore(saved?.ceiling);
    for(const key of ['menuTransition','menuInputHeld','statusRecovery','panelBack','padInput','lastPadInput','powerCharge','powerBlocked','kiBlocked','kiHand','frame','facing','nameEditor','worldFlight','flightShadow','charge','charging','attackHeld','nativeTapFrames','action','queuedPunch','combo','comboUntil','blastCooldown','attackBlocked','effects','knockbacks','lastMap','input','lastInput','attackFrames','attackCooldown','autoLand','flightTransition','localFlight','localLift'])if(saved[key]!==undefined)this[key]=JSON.parse(JSON.stringify(saved[key]));
    Object.assign(this.options,saved.options);this.motion?.restore(saved.motion);
    this.trial?.restore(saved.trial);this.challenge?.restore(saved.challenge);this.scouter?.restore(saved.scouter);this.powerIntro?.restore(saved.powerIntro);this.ending?.restore(saved.ending);this.frieza?.restore(saved.frieza);
  }
  get gokuActive(){return !this.arrival||this.arrival.arrived;}
  get poisoned(){return !!(this.read8(0xe191)&0x20);}
  get sleeping(){return !!(this.read8(0xe190)&0x10);}
  get nativeFlight(){return this.flight?this.flight.worldActive():this.read8(0xe4)===4&&this.read8(0xe5)===4&&this.read8(0xd0)===0&&(this.read8(0xec)&0x80)!==0;}
  get nativeField(){return [0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0].every((v,i)=>this.read8(0x100+i)===v);}
  get nativeHurt(){const pose=this.read8(0xe011);return pose>=0x8c&&pose<=0x8f;}
  get menuActive(){return this.menuTransition||!!(this.read8(0xec)&12)||!!(this.read8(0xed)&0x40)||this.snes.ppu.mode===5;}
  updateMenu(){
    if(this.read8(0xec)&12||this.read8(0xed)&0x40||this.snes.ppu.mode===5)this.menuTransition=true;
    // The ring clears EC before the options page installs its vectors.
    // Keep ownership across that fade; battle-name banners alone never
    // begin a menu session. Releasing the native window ends the session.
    else if(this.nativeField&&!this.read8(0x2c)&&!(this.read8(0xec)&0xfe))this.menuTransition=false;
  }
  get canAttack(){
    // $2C is the transient battle-message window (level ups / spell names),
    // not a modal menu. The native menu/event and actor locks remain owners.
    return this.gokuActive&&!this.ending?.active&&!this.nativeHurt&&!this.menuActive&&this.nativeField&&this.read8(0xe4)===1&&this.read8(0xe5)===1&&(this.read8(0xe000)&1)!==0&&(this.read8(0xe02c)&1)!==0&&(this.read8(0xec)&0xfe)===0&&!(this.read8(0xed)&0x40)&&this.read8(0xd0)===0&&!(this.read8(0xe190)&0x70)&&!(this.read8(0xe191)&0xd5);
  }
  get status(){
    const x=this.read16(0xe002),y=this.read16(0xe004),sx=this.readSigned16(0xe020),sy=this.readSigned16(0xe022);
    return {map:this.read16(0xdc),x,y,screenX:sx,screenY:sy,cameraX:x-sx,cameraY:y-sy,
      hp:this.read16(0xe182),maxHp:this.read16(0xe184),attack:this.options.enabled&&this.options.power&&this.gokuActive?this.damageScale():this.read8(0xe198),staminaRemaining:this.read8(0xe1ed),
      charge:this.charge,worldFlight:this.worldFlight,localFlight:this.localFlight,canAttack:this.canAttack,action:this.action?.kind||'idle',combo:this.combo,menu:this.read8(0xec),event:this.read8(0xd0),hiddenOamSlots:this.hiddenLastFrame};
  }
  entities(){
    const entities=Array.from({length:12},(_,index)=>{
      const base=0xe000+index*0x200;
      return {index,base,active:!!(this.read8(base)&1),species:this.read8(base+0x180),hp:this.read16(base+0x182),
        maxHp:this.read16(base+0x184),x:this.read16(base+2),y:this.read16(base+4),screenX:this.readSigned16(base+0x20),screenY:this.readSigned16(base+0x22)};
    });
    const frieza=this.frieza?.entity();if(frieza)entities.push(frieza);
    const vegeta=this.trial?.entity();if(vegeta)entities[3]=vegeta;
    return entities;
  }
  beforeFrame(input=this.snes.joypad1State) {
    this.updateMenu();
    this.equipment?.tick();this.ending?.tick();this.frieza?.tick();this.scouter?.tick();this.hitRecovery?.tick();this.potosGatekeeper?.tick();this.sandship?.tick();
    // If a blast removes the floor under him, catch himself in a hover.
    // Releasing speed cannot land on the hole; fly to intact deck first.
    if(this.canAttack&&(this.frieza?.floorHole(this.read16(0xe002),this.read16(0xe004),this.read8(0xe00b)&128?1:0)||this.sandship?.floorHole(this.read16(0xe002),this.read16(0xe004))))this.localFlight=true;
    this.feedback?.tick();this.gapFlight?.tick();
    const previousLift=this.localLift;
    this.localLift=Math.max(0,Math.min(12,this.localLift+(this.localFlight?3:-3)));
    if(previousLift>0&&this.localLift===0&&!this.localFlight&&!this.flightTransition&&this.options.enabled&&this.gokuActive)this.playSound?.('landing');
    // Optional keyboard/touch shortcuts expand to ordinary SNES chords.
    if(input&(1<<18))input|=0x500;
    if(input&(1<<21))input|=0xc00;
    if(input&(1<<22))input|=0x402;
    if(input&(1<<23))input|=0x401;
    if(this.sandship)input=this.sandship.input(input);
    // Confirmation/ki/focus held in a menu must be released before they
    // can become combat input, including the frame the ring closes.
    const combatButtons=0x503|(1<<17)|(1<<19);
    if(this.menuActive)this.menuInputHeld=input&combatButtons;
    else{this.menuInputHeld&=input;input&=~this.menuInputHeld;}
    this.padInput=input;
    const gokuControls=this.options.enabled&&this.gokuActive&&((this.read8(0xe02c)&1)!==0||this.nativeFlight);
    const controlled=gokuControls&&(this.canAttack||this.nativeFlight);
    this.snes.joypad1State=(input&0xfff)|((input&(1<<16))?1:0);
    // On foot A is a speed modifier, never the cartridge's latched dash.
    // Keep it out of native movement even during hurt/recovery. Menus and
    // Mode 7 still receive their normal A confirmation/altitude input.
    if(this.options.enabled&&this.gokuActive&&this.nativeField&&!this.nativeFlight&&!(this.read8(0xec)&0xfe)&&!this.read8(0xd0))this.snes.joypad1State&=~0x100;
    // X is always ring/back. Y stays ki even while a spell/status/menu locks
    // attacks; it must never fall through to the cartridge's Y ring command.
    if(gokuControls){input=(input&~2)|((input&2)?1<<17:0);this.snes.joypad1State&=~2;}
    if(controlled)this.snes.joypad1State&=~0xe00;
    // The cartridge's window/controller editors finish with Start; ordinary
    // Status/Level/Action pages and rings cancel with Y. Keep X/back usable
    // everywhere, latching the route until release if the panel closes.
    // $1876 is the open option; $180A is only the cursor relative to the
    // option the ring last opened at, so Status could read as an editor.
    if(!(input&0x200))this.panelBack=false;
    else if(!(this.lastPadInput&0x200))this.panelBack=this.read8(0xe4)===1&&this.read8(0xe5)===1&&!this.read8(0xd0)&&this.snes.ppu.mode===5&&this.read8(0x1809)===2&&[5,6].includes(this.read8(0x1876))&&[0x5c,0xa7,0x20,0xc0,0x5c,0xcf,0xc1,0].every((v,i)=>this.read8(0x100+i)===v)?8:2;
    if(input&0x200)this.snes.joypad1State=(this.snes.joypad1State&~0x200)|(this.panelBack||2);
    if(input&0x200)input=(input&~0x200)|2;
    if(this.ending?.complete)this.snes.joypad1State=0;
    this.input=input;this.frame++;this.before={x:this.read16(0xe002),y:this.read16(0xe004)};
    if(this.read8(0xe4)!==0||this.read8(0xe5)!==0)this.nameEditor=false;
    // Native interrupt vectors identify the Mode 7 world even during fades;
    // $E4/$E5 are only brightness timers and also occur at ordinary doors.
    const wasFlight=this.worldFlight;this.worldFlight=this.nativeFlight;
    if(wasFlight&&!this.worldFlight){this.flightTransition??={kind:'landing',age:0};this.autoLand=false;}
    if(this.flightTransition){
      const visible=!this.snes.ppu.forcedBlank&&this.snes.ppu.brightness>0&&this.ownership?.ppuOwners.some(o=>o?.base===0xe000&&o.kind==='body');
      if(this.worldFlight)this.flightTransition=null;
      else if(this.flightTransition.kind!=='landing'||visible){
        const transition=this.flightTransition;transition.age++;
        if(transition.kind==='landing'&&transition.age===24&&this.options.enabled&&this.gokuActive)this.playSound?.('landing');
        if(transition.age>32)this.flightTransition=null;
      }
    }
    if(!this.options.enabled||!this.gokuActive)return;
    const recovering=this.recoverStatus(input);
    // Poison and sleep break the transformation, including while charging.
    // Focus can clear sleep; the native get-up and palette cleanup still run.
    if((this.poisoned||this.sleeping)&&this.options.superSaiyan&&!this.frieza?.permanent){
      this.options.superSaiyan=false;this.cancelCombat();this.motion?.reset();
      this.playSound?.('revert');
      this.attackBlocked=!!(input&(1|(1<<17)));this.powerBlocked=!!(input&0x400);this.log(`${this.sleeping?'Sleep':'Poison'} knocked Goku out of Super Saiyan.`);
    }
    const map=this.read16(0xdc);
    if(this.lastMap!==null&&map!==this.lastMap){this.cancelCombat();this.knockbacks=[];this.lastTeleportTarget=-1;this.localFlight=false;this.localLift=0;this.attackBlocked=!!(input&(1|(1<<17)));this.powerBlocked=!!(input&0x400);}
    this.lastMap=map;
    this.challenge?.tick();
    this.trial?.tick();
    if(this.options.power&&(this.canAttack||this.worldFlight)){
      // The retail level cap is stored zero-based. Weapon proficiency packs
      // two level-8 skills per byte; 99 is their maximum fractional EXP.
      // Set these directly, without running the level-up announcement loop.
      this.write8(0xe181,98);
      for(let i=0;i<4;i++)this.write8(0xe1c0+i,0x88);
      for(let i=0;i<8;i++)this.write8(0xe1d0+i,99);
      this.write8(0xe19c,8);
      // Grant the larger health pool once; later battle damage stays until
      // a real heal/rest/item. Preserve any existing missing HP on conversion.
      const maxHp=this.read16(0xe184),hp=this.read16(0xe182);
      if(maxHp!==999){this.write16(0xe184,999);if(hp>0)this.write16(0xe182,Math.min(999,hp+Math.max(0,999-maxHp)));}
      this.updatePowerStats();
      this.write8(0xe1ed,0);
    }
    const nativeDirection=this.read8(0xe010);
    this.facing=(nativeDirection&0x7f)===0?3:(nativeDirection&0x7f)===1?0:(nativeDirection&0x80)?2:1;
    if(this.ceiling?.tick()){this.localFlight=false;this.localLift=0;return;}
    if(this.frieza?.inputLocked){this.snes.joypad1State=0;this.input=0;this.padInput=0;return;}
    if(this.trial?.clashInput(input)){this.snes.joypad1State=0;this.input=0;this.padInput=0;return;}
    if(this.trial?.inputLocked){
      this.snes.joypad1State=0;this.input=0;this.padInput=0;
      // The last sparring wave finishes before the draw dialogue. Blocking
      // new input must not freeze the already-fired beam's lifetime.
      if(this.canAttack){for(const e of this.effects)e.life--;this.effects=this.effects.filter(e=>e.life>0);this.advanceAction();this.updateProjectiles();}
      return;
    }
    if(recovering)return;
    if(this.frieza?.spaceInput(input)){this.snes.joypad1State=0;return;}
    if(this.teleport?.pending){
      if(this.action?.kind==='teleport'&&((input&0x401)===0x401&&(this.lastInput&0x401)!==0x401||input&(1<<19)&&!(this.lastInput&(1<<19))))this.action.queued=true;
      this.snes.joypad1State=0;this.advanceAction();return;
    }
    const takeoff=(this.padInput&0xc00)===0xc00;
    if(takeoff&&(this.lastPadInput&0xc00)!==0xc00&&this.requestFlight()){this.snes.joypad1State=0;return;}
    if(!((input&0x400)&&(input&((1<<17)|1|0x800)))){
      if((this.canAttack||this.nativeFlight)&&!(input&(2|(1<<16))))this.focus(input);
    }else if(this.action?.kind==='focus'){this.action=null;this.powerCharge=0;}
    this.worldKi?.tick(input);
    this.barriers?.tick();
    if(this.worldFlight){this.localFlight=false;this.localLift=0;if(!this.worldKi&&this.autoLand)this.snes.joypad1State|=1;this.advanceAction();return;}
    // Native menus, events, character/status locks and stun own their inputs.
    // A held button must be released after a menu before it can charge again.
    if(!this.canAttack||(input&((1<<1)|(1<<16)))){
      if(this.read8(0xd0)||this.read8(0xec)&0xfe){this.localFlight=false;this.localLift=0;}
      const heldCombat=this.attackHeld>0||this.charging||this.attackBlocked;
      this.cancelCombat();this.attackBlocked=heldCombat&&!!((this.padInput&3)|(input&(1<<17)));this.powerBlocked=!!(input&0x400);
      if(this.attackBlocked&&!(input&(1<<16))){this.snes.joypad1State&=~3;if(this.padInput&0x200)this.snes.joypad1State|=this.panelBack||2;}
      return;
    }
    this.aim(input);
    const teleport=!!(input&(1<<19))||((input&0x400)!==0&&(input&1)!==0);
    const wasTeleport=!!(this.lastInput&(1<<19))||((this.lastInput&0x400)!==0&&(this.lastInput&1)!==0);
    const wave=!!(input&0x400)&&!!(input&(1<<17))&&!teleport;
    if(teleport)this.snes.joypad1State&=~0x100;
    if(teleport&&!wasTeleport)this.instantTransmission();
    const hovering=this.localFlight;
    this.localFlight=!!this.localFlightHook&&!teleport&&this.action?.kind!=='teleport'&&!!(((input&0x100)&&(input&0xf0)&&(!(input&0x400)||wave))||(hovering&&!this.localFlightHook.canLand()));
    if(this.localFlight){this.snes.joypad1State&=~0x100;if(!hovering)this.playSound?.('flight');}
    for(const effect of this.effects){if(effect.hold>0)effect.hold--;else effect.life--;}
    this.effects=this.effects.filter(effect=>effect.life>0);
    this.advanceAction();
    if(this.blastCooldown>0)this.blastCooldown--;
    this.updateProjectiles();this.updateKnockbacks();
    if(!(input&(1|(1<<17))))this.attackBlocked=false;
    if(!(input&(1<<17)))this.kiBlocked=false;
    this.snes.joypad1State&=~1;
    if(wave&&!this.attackBlocked&&!this.kiBlocked&&!this.charging&&(!this.action||['ready','focus','punch','blast'].includes(this.action.kind)))this.startCharge();
    if(this.charging&&!wave){this.releaseCharge();this.kiBlocked=!!(input&(1<<17));}
    if((input&1)&&!(input&0x400)&&!teleport&&!this.attackBlocked&&!this.charging){
      this.attackHeld++;
      if(!this.action)this.punch();
      else if(this.action.kind==='punch'&&(!(this.lastInput&1)||this.attackHeld>=12))this.queuedPunch=true;
    }else this.attackHeld=0;
    if(!this.action&&this.queuedPunch){this.queuedPunch=false;this.punch();}
    if(this.charging){
      const cap=this.options.superSaiyan?45:90;
      this.charge=Math.min(cap,this.charge+1);
      if(this.charge===cap&&this.action&&!this.action.full){this.action.full=true;this.playSound?.('charged');}
      this.action.facing=this.facing;
    }
    if((input&(1<<17))&&!(input&0x400)&&!teleport&&!this.kiBlocked&&!this.attackBlocked&&!this.blastCooldown&&!this.charging&&(!this.action||this.action.kind==='blast'))this.kiBlast();
    if(this.nativeTapFrames>0){this.snes.joypad1State|=1;this.nativeTapFrames--;}
    // Charge and power-up keep native walking/collision. Strikes and the
    // released beam stay planted through their committed recovery.
    const action=this.action;
    if(action&&['focus','transform','revert'].includes(action.kind))action.facing=this.facing;
    if(action&&['beam','teleport','punch','blast'].includes(action.kind))this.snes.joypad1State&=~0x1f0;
    if(action&&!['ready','charge'].includes(action.kind))this.write8(0xe010,[1,2,0x82,0][action.facing]);
    this.attackFrames=action&&['punch','beam','blast'].includes(action.kind)?Math.max(0,action.duration-action.age):0;
    this.attackCooldown=action?.kind==='punch'?this.attackFrames:0;
  }
  afterFrame(){
    this.updateMenu();
    if(this.options.enabled&&this.gokuActive){
      if(!this.worldFlight&&(this.read8(0xd0)||this.read8(0xec)&0xfe)){this.localFlight=false;this.localLift=0;}
      // Native input sampling can finish one movement step after release.
      // Keep hovering if that last step carries the feet off a narrow shore.
      if(!this.worldFlight&&this.canAttack&&this.localLift>0&&this.localFlightHook&&!this.localFlightHook.canLand()&&this.localFlightHook.canFly(this.read16(0xe002),this.read16(0xe004)))this.localFlight=true;
      const recovered=this.frieza?.orbit?null:this.localFlightHook?.settle();
      if(recovered)this.teleport?.follow(recovered);
    }
    this.moving=this.read16(0xe002)!==this.before.x||this.read16(0xe004)!==this.before.y;
    this.lastInput=this.input;
    this.lastPadInput=this.padInput;
    this.powerIntro?.tick();
    this.radio?.tick();
  }
  aim(input){
    const vertical=(input&(1<<4))?3:(input&(1<<5))?0:null,horizontal=(input&(1<<6))?2:(input&(1<<7))?1:null;
    const pressed=input&~this.lastInput;
    if(pressed&0xc0)this.facing=horizontal??this.facing;
    else if(pressed&0x30)this.facing=vertical??this.facing;
    else if(horizontal!==null&&vertical===null)this.facing=horizontal;
    else if(vertical!==null&&horizontal===null)this.facing=vertical;
    if(this.action?.kind==='charge'||this.action?.kind==='ready'||input&0x100)this.write8(0xe010,[1,2,0x82,0][this.facing]);
  }
  advanceAction(){
    const action=this.action;if(!action)return;
    // Hold only the connected pose and its contact sparks, not the SNES
    // simulation/audio. Misses retain their immediate recovery and inputs
    // still buffer while the fist is planted in the target.
    if(action.kind==='punch'&&action.hitPause>0){action.hitPause--;return;}
    action.age++;
    // Match the first gold cell, including the slower first-time reveal.
    if(action.kind==='transform'&&!action.burst&&action.age>=Math.ceil(action.duration*14/40)){
      action.burst=true;this.playSound?.('powerBurst');this.feedback?.burst?.();this.transformBurst();
    }
    if(action.kind==='punch'&&!action.hit&&action.age>=action.impact){action.hit=true;this.strike(action);}
    if(action.kind==='blast'&&action.shots===0&&action.age>=(action.super?1:2)){
      this.fireKi(action);action.shots++;
    }
    if(action.kind==='teleport'&&!action.arrived&&action.age>=4)this.finishTeleport(action);
    if(action.kind==='teleport'&&action.arrived){
      if(this.teleport?.pending)action.age=4;
      else if(action.age>=6&&!action.sounded){action.sounded=true;this.playSound?.('teleportIn');}
    }
    if(action.duration>0&&action.age>=action.duration){
      this.action=null;
      if(action.kind==='teleport'&&action.queued)this.instantTransmission();
      return;
    }
    // Keep fast taps: one queued strike can cancel the visible recovery.
    if(action.kind==='punch'&&this.queuedPunch&&action.age>=(action.super?4:9)){this.queuedPunch=false;this.punch();}
  }
  startCharge(){
    if(this.options.enabled&&(this.canAttack||this.worldFlight)){
      this.charging=true;this.charge=0;this.powerCharge=0;this.queuedPunch=false;this.nativeTapFrames=0;
      this.action={kind:'charge',age:0,duration:0,facing:this.facing,super:this.options.superSaiyan};this.playSound?.('charge');
    }
  }
  updatePowerStats(){
    this.write8(0xe188,Math.round(255*(this.equipment?.powerScale??1)));
    // Retail attack is ONE byte. E199/E19A contain weapon status effects,
    // not the high bits of attack. Wrapper combat and the status page use
    // damageScale directly, so large Saiyan values never spill into them.
    this.write8(0xe198,Math.min(255,this.damageScale()));
  }
  damageScale(){return this.options.power?Math.round((this.options.superSaiyan?8191:4095)*(this.equipment?.powerScale??1)):Math.max(12,Math.min(200,this.read8(0xe198)));}
  instantTransmission(){
    if(!this.options.enabled||!this.canAttack)return false;
    if(this.action?.kind==='teleport'){this.action.queued=true;return true;}
    const origin={x:this.read16(0xe002),y:this.read16(0xe004)};
    const enemies=this.entities().filter(e=>e.index>=3&&e.active&&e.species<128&&e.species!==0x55&&e.hp&&(e.custom||!(this.read8(e.base+0x191)&0x80)));
    // Start at the nearest foe, then visit every reachable actor in stable
    // slot order. Merely excluding the last foe ping-pongs between two and
    // can starve the rest of the group forever.
    const reachable=enemies.filter(e=>this.teleportLanding(e,origin));
    const ordered=reachable.sort((a,b)=>a.index-b.index);
    const target=this.lastTeleportTarget<0?reachable.sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y))[0]:ordered.find(e=>e.index>this.lastTeleportTarget)||ordered[0];
    if(!target)return false;
    this.cancelCombat();this.action={kind:'teleport',age:0,duration:12,super:this.options.superSaiyan,facing:this.facing,target:target.index,species:target.species,origin,arrived:false};
    this.playSound?.('teleport');return true;
  }
  finishTeleport(action){
    action.arrived=true;
    const target=this.entities()[action.target];
    if(!target?.active||target.species!==action.species||!target.hp||(!target.custom&&(this.read8(target.base+0x191)&0x80)))return;
    const landing=this.teleportLanding(target,action.origin);if(!landing)return;
    this.write16(0xe002,landing.x);this.write16(0xe004,landing.y);
    this.write8(0xe00b,landing.terrain);
    this.write8(0xe006,0);this.write8(0xe007,0);this.write8(0xe045,0);
    action.facing=landing.facing;this.facing=action.facing;
    this.write8(0xe010,[1,2,0x82,0][this.facing]);this.lastTeleportTarget=target.index;
    this.localFlight=!!landing.air;this.localLift=landing.air?12:0;this.localFlightHook?.restore();
    this.motion?.reset();this.teleport?.follow(landing);
  }
  teleportLanding(target,origin){
    if(this.teleport)return this.teleport.findLanding(target,origin);
    const ox=origin.x-target.x,oy=origin.y-target.y,horizontal=Math.abs(ox)>=Math.abs(oy);
    const dx=horizontal?(ox<0?-1:1):0,dy=horizontal?0:(oy<0?-1:1);
    return{x:Math.max(16,Math.min((this.read16(0xc0)||2048)-16,target.x+dx*26)),
      y:Math.max(16,Math.min((this.read16(0xc2)||2048)-16,target.y+dy*26)),terrain:this.read8(target.base+11),facing:dx<0?1:dx>0?2:dy<0?0:3};
  }
  targets(origin,dx,dy,range,width,behind=0,centerY=0){
    return this.entities().filter(enemy=>{
      if(enemy.index<3||!enemy.active||enemy.species>=128||!enemy.hp||(!enemy.custom&&(this.read8(enemy.base+0x191)&0x80)))return false;
      const x=enemy.x-origin.x,y=enemy.y-centerY-origin.y,along=x*dx+y*dy;
      return along>=-behind&&along<=range&&Math.abs(x*dy-y*dx)<=width;
    });
  }
  hit(enemy,damage,dx,dy,launch=false){
    if(enemy.custom==='frieza')return this.frieza.hit(enemy,damage);
    if(enemy.custom==='vegeta')return this.trial.hit(enemy,damage);
    if(enemy.species===0x55)return{index:enemy.index,species:enemy.species,before:enemy.hp,after:enemy.hp,activated:this.orbs?.hit(enemy)||false};
    damage=this.challenge?.damage(enemy,damage)??damage;
    // Queue damage through C0:4053 so the original game owns impact, numbers,
    // hurt states and defeat events. Its display/queue clamps at 999; apply
    // excess damage first but leave at least 1HP for the native lethal hit.
    const total=Math.min(65535,this.read16(enemy.base+0x1f1)+damage);
    if(total>999)this.write16(enemy.base+0x182,Math.max(1,enemy.hp-(total-999)));
    this.write16(enemy.base+0x1f1,Math.min(999,total));this.write8(enemy.base+0x1f0,0);this.write8(enemy.base+0x1ec,0);
    this.combatSound?.mark(enemy);
    if(launch&&enemy.species<84){
      this.knockbacks=this.knockbacks.filter(hit=>hit.base!==enemy.base);
      const slide=launch==='punch'&&enemy.hp>damage,ssj=this.options.superSaiyan?1:0;
      this.knockbacks.push({base:enemy.base,species:enemy.species,x:enemy.x,y:enemy.y,dx,dy,age:0,
        duration:slide?ManaMod.SLIDE_FRAMES:12,distance:slide?ManaMod.SLIDE[ssj]:ssj?88:56,...(slide?{slide:true}:{})});
    }
    return {index:enemy.index,species:enemy.species,before:enemy.hp,after:Math.max(0,enemy.hp-damage)};
  }
  transformBurst(){
    if(!this.options.enabled||!this.canAttack||this.worldFlight)return [];
    const origin={x:this.read16(0xe002),y:this.read16(0xe004)},radius=56,damage=Math.round(this.damageScale()*.75),hits=[];
    this.effects.push({kind:'powerBurst',x:origin.x,y:origin.y-16-this.read8(0xe045)-this.localLift,radius,life:14,max:14,super:true});
    for(const enemy of this.targets(origin,1,0,radius,radius,radius)){
      const x=enemy.x-origin.x,y=enemy.y-origin.y,distance=Math.hypot(x,y),pending=enemy.custom?0:this.read16(enemy.base+0x1f1);
      // One radial hit at ignition. Puzzle orbs need an aimed attack, and an
      // already-lethal native queue must finish its own defeat/reward event.
      if(distance>radius||enemy.species===0x55||pending>0&&pending>=enemy.hp)continue;
      const [dx,dy]=distance?[x/distance,y/distance]:[[0,1],[1,0],[-1,0],[0,-1]][this.facing];
      hits.push(this.hit(enemy,damage,dx,dy,true));
      const horizontal=Math.abs(dx)>=Math.abs(dy);
      this.effects.push({kind:'impact',x:enemy.x,y:enemy.y-12,dx:horizontal?Math.sign(dx):0,dy:horizontal?0:Math.sign(dy),life:10,max:10,super:true});
    }
    return hits;
  }
  punch(){
    if(!this.options.enabled||!this.canAttack)return [];
    this.combo=this.frame<=this.comboUntil?(this.combo+1)%3:0;this.comboUntil=this.frame+40;
    this.action={kind:'punch',age:0,duration:this.options.superSaiyan?7:14,impact:this.options.superSaiyan?1:2,facing:this.facing,super:this.options.superSaiyan,combo:this.combo};
    this.playSound?.(this.combo===2?'kickSwing':'swing');return [];
  }
  strike(action){
    const [dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][action.facing],origin={x:this.read16(0xe002),y:this.read16(0xe004)};
    const targets=this.targets(origin,dx,dy,action.combo===2?54:44,24,10),damage=Math.round(this.damageScale()*(action.combo===2?1.5:1));
    // The kick always launches; a jab or cross launches only a killing blow
    // and otherwise pushes the target back, keeping it in reach of the next.
    const hits=targets.map(enemy=>this.hit(enemy,damage,dx,dy,action.combo===2?true:'punch'));
    const contacts=targets.filter((enemy,i)=>enemy.species!==0x55&&hits[i]?.after<hits[i]?.before);
    // Graded hit stop: the connected pose, the struck targets and the spark
    // freeze 5 / 6 / 10 frames for jab / cross / kick (one less as a Super
    // Saiyan, whose strikes are twice as fast).
    action.hitPause=contacts.length?ManaMod.HIT_STOP[action.super?1:0][action.combo]:0;
    for(const hit of this.knockbacks)if(contacts.some(enemy=>enemy.base===hit.base))hit.hold=action.hitPause+1;
    // The native pulse handles talking/chests. The interaction adapter stops
    // its weapon fallback; punching plants uses the same native redraw queue
    // as the beam, so no invisible sword animation is needed.
    if(!hits.length)this.nativeTapFrames=2;
    this.plants?.beam({...origin,dx,dy,length:28,halfWidth:9,policy:'objects'});
    if(this.barriers?.punch({...origin,dx,dy}))this.nativeTapFrames=0;
    for(const enemy of contacts){
      this.effects.push({kind:'impact',x:enemy.x,y:enemy.y-12,dx,dy,life:10,max:10,hold:action.hitPause,super:action.super});
      // A two-frame white "impact frame" sized by the blow, and the struck
      // actor drawn white for those frames, jittering along the hit through
      // the hit stop (the native renderer's timed shake, $E00D).
      this.effects.push({kind:'star',x:enemy.x,y:enemy.y-12,size:action.combo+1,life:2,max:2,super:action.super});
      if(!enemy.custom){
        this.effects.push({kind:'flash',base:enemy.base,life:2,max:2});
        this.write8(enemy.base+0x0d,(action.hitPause<<4)|(dx?1:2));
      }
    }
    // The finishing kick's shockwave and speed lines leave its first contact
    // a frame after the burst (impact-art.js: frames 1-6 of its life of 7).
    if(action.combo===2&&contacts.length)this.effects.push({kind:'shock',x:contacts[0].x,y:contacts[0].y-12,life:7,max:7,super:action.super});
    this.effects.push({...origin,kind:'punch',dx,dy,life:7,max:7,super:action.super,hit:!!hits.length});
    if(contacts.length){
      // The camera kicks along the blow and springs back; the kick also
      // shakes the ground and briefly brightens the screen (three fading steps).
      this.feedback?.kick?.(action.facing,action.combo);
      if(action.combo===2){this.feedback?.pulse(action.super?5:3);this.feedback?.flash?.(3);}
      this.playSound?.(action.combo===2?'kick':'hit');this.log(`Punch ${damage}: ${JSON.stringify(hits)}`);
    }
    return hits;
  }
  handOrigin(facing=this.facing,technique='beam',hand=0){
    const form=this.options.superSaiyan?'ssj':'goku',column=technique==='ki'?(this.options.superSaiyan?25:29)+(hand&1):(this.options.superSaiyan?19:23),row=[0,2,1,3][facing];
    const local=window.GokuAnimationData?.forms[form].sockets[column][row]||[[16,23],[26,17],[5,17],[16,6]][facing],scale=this.read8(0xe180)===0xf6?.5:1;
    return{x:this.read16(0xe002)+Math.round((local[0]-16)*scale),y:this.read16(0xe004)+Math.round((local[1]-31)*scale)-this.read8(0xe045)-this.localLift};
  }
  kiBlast(){
    if(!this.canAttack||!this.options.enabled)return;
    const superForm=this.options.superSaiyan;
    this.action={kind:'blast',age:0,duration:superForm?5:10,facing:this.facing,super:superForm,shots:0,hand:this.kiHand++&1};
    this.blastCooldown=superForm?5:12;
  }
  fireKi(action){
    const [dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][action.facing],superForm=action.super;
    const hand=action.hand??0;
    this.effects.push({...this.handOrigin(action.facing,'ki',hand),kind:'ki',dx,dy,life:22,max:22,super:superForm,hand,width:superForm?12:8,damage:Math.round(this.damageScale()*.4),hits:[],range:256});
    this.playSound?.('blast');
  }
  releaseCharge(){
    if(!this.charging)return [];this.charging=false;
    const strength=Math.min(1,this.charge/(this.options.superSaiyan?45:90));
    const damage=Math.round(this.damageScale()*Math.max(.25,strength));
    const [dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][this.facing];
    const origin=this.handOrigin(),profile=this.beamProfile(strength);
    // At point-blank range the palms can already extend through a solid
    // tile. Include the short body-to-palm span so that obstacle is hit too.
    this.plants?.beam({x:this.read16(0xe002),y:this.read16(0xe004),dx,dy,length:28,halfWidth:9,policy:profile.mega?'super-beam':'beam'});
    this.effects.push({...origin,...profile,kind:'beam',dx,dy,life:profile.max,strength,super:this.options.superSaiyan,damage,hits:[],pulses:{}});
    this.action={kind:'beam',age:0,duration:profile.max+4,facing:this.facing,super:this.options.superSaiyan};
    this.attackFrames=this.action.duration;this.charge=0;this.queuedPunch=false;
    this.feedback?.pulse(profile.mega?36:this.options.superSaiyan?14:10);this.playSound?.('beam');this.log(`Kamehameha ${damage}`);return [];
  }
  beamProfile(strength){
    const mega=this.options.superSaiyan&&strength>=1;
    return{mega,width:mega?80:5+strength*14,range:mega?640:320,max:mega?64:24,speed:mega?48:32};
  }
  beamGeometry(effect){
    const age=effect.max-effect.life,speed=effect.speed||32;
    return{length:Math.min(effect.range,(age+1)*speed),speed,taper:effect.mega?44:0,
      halfWidth:effect.width*(effect.mega?Math.min(1,(age+1)/6,effect.life/10):1)};
  }
  updateProjectiles(){
    for(const effect of [...this.effects]){
      if(!['beam','ki'].includes(effect.kind))continue;
      const age=effect.max-effect.life,geometry=effect.kind==='beam'?this.beamGeometry(effect):{speed:14,length:Math.min(effect.range,(age+1)*14),halfWidth:effect.width,taper:0};
      const {speed,length,halfWidth,taper}=geometry;
      if(effect.kind==='beam')this.plants?.beam({...effect,...geometry,policy:effect.mega?'super-beam':'beam'});
      if(effect.kind==='beam'&&!effect.barrierHit){const hit={...effect,length,width:halfWidth};if(this.barriers?.beam(hit))effect.barrierHit=true;}
      const width=halfWidth+8;
      for(const enemy of this.targets(effect,effect.dx,effect.dy,length,width,8,12)){
        const beam=effect.kind==='beam',pulse=effect.pulses?.[enemy.index];
        // A beam keeps hammering whatever remains inside its visible body.
        // Ki projectiles and puzzle orbs still receive just one contact.
        if((!beam||enemy.species===0x55)&&effect.hits.includes(enemy.index))continue;
        if(beam&&pulse?.species===enemy.species&&age-pulse.age<(effect.mega?6:8))continue;
        // Let an already-lethal queued hit finish through the original game.
        // Repeated calls must not restart death, rewards or boss scripts.
        const pending=enemy.custom?0:this.read16(enemy.base+0x1f1);
        if(enemy.species!==0x55&&pending>0&&enemy.hp<=pending)continue;
        const along=(enemy.x-effect.x)*effect.dx+(enemy.y-12-effect.y)*effect.dy;
        const across=Math.abs((enemy.x-effect.x)*effect.dy-(enemy.y-12-effect.y)*effect.dx);
        if(taper&&across>halfWidth*Math.min(1,(Math.max(0,along)+8)/taper)+8)continue;
        if(effect.kind==='ki'&&(enemy.x-effect.x)*effect.dx+(enemy.y-12-effect.y)*effect.dy<length-speed-16)continue;
        if(!effect.hits.includes(enemy.index))effect.hits.push(enemy.index);
        if(beam){effect.pulses??={};effect.pulses[enemy.index]={species:enemy.species,age,count:(pulse?.species===enemy.species?pulse.count:0)+1};}
        this.hit(enemy,effect.damage,effect.dx,effect.dy,true);
        this.playSound?.('impact');
        this.effects.push({kind:'impact',x:enemy.x,y:enemy.y-12,dx:effect.dx,dy:effect.dy,life:12,max:12,super:effect.super});
        // A ki shot pops with the smallest impact frame.
        if(effect.kind==='ki'){this.effects.push({kind:'star',x:enemy.x,y:enemy.y-12,size:0,life:2,max:2,super:effect.super});effect.life=0;break;}
      }
    }
  }
  updateKnockbacks(){
    this.knockbacks=this.knockbacks.filter(hit=>{
      const species=this.read8(hit.base+0x180),dead=!!(this.read8(hit.base+0x191)&0x80);
      // The native kill routine changes the actor into death-effect F9 before
      // its explosion finishes. Carry that same effect along the launch arc.
      if(!(this.read8(hit.base)&1)||(species!==hit.species&&!(species===0xf9&&dead)))return false;
      // The hit stop pins the struck target where the blow found it, against
      // its own recoil, until the push-back or launch begins.
      if(hit.hold>0){hit.hold--;this.write16(hit.base+2,hit.x);this.write16(hit.base+4,hit.y);return true;}
      hit.age++;const t=Math.min(1,hit.age/hit.duration),distance=hit.distance*(1-(1-t)**2);
      this.write16(hit.base+2,Math.round(Math.max(8,Math.min(1016,hit.x+hit.dx*distance))));
      this.write16(hit.base+4,Math.round(Math.max(8,Math.min(1016,hit.y+hit.dy*distance))));
      // A push-back slides along the ground; only a launch lifts the target.
      if(!hit.slide)this.write8(hit.base+0x45,Math.round(Math.sin(t*Math.PI)*20));
      return hit.age<hit.duration;
    });
  }
  // The PPU hook draws replacement OBJ pixels before native layer composition.
  // Kept as a no-op for the wrapper and older inspection scripts.
  draw(){}
  destroy(){this.spriteLayer.destroy();this.snes.ppu.getWindowState=this.originalGetWindowState}
}
window.ManaMod=ManaMod;
