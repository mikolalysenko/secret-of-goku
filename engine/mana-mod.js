/* Hybrid mod: the SNES executes the original game, JavaScript changes selected
 * WRAM fields and composes replacement artwork at the engine's player position.
 * See README.md for experimentally checked addresses and current limitations. */
class ManaMod {
  constructor(snes,{gokuUrl='../../assets/sprites/goku.png',ssjUrl='../../assets/sprites/ssj.png',onLog=()=>{}}={}) {
    this.snes=snes;this.log=onLog;
    this.options={enabled:false,power:true,superSaiyan:false};
    this.images={goku:new Image(),ssj:new Image()};
    this.images.goku.src=gokuUrl;this.images.ssj.src=ssjUrl;
    this.frame=0;this.facing=0;this.charge=0;this.charging=false;this.attackFrames=0;this.attackCooldown=0;this.attackHeld=0;this.nativeTapFrames=0;this.effects=[];
    this.action=null;this.queuedPunch=false;this.combo=0;this.comboUntil=0;this.blastCooldown=0;this.attackBlocked=false;this.knockbacks=[];this.lastMap=null;this.lastTeleportTarget=-1;
    this.before={x:0,y:0};this.moving=false;this.worldFlight=false;this.nameEditor=false;this.flightTransition=null;this.autoLand=false;this.localFlight=false;this.localLift=0;
    this.hiddenLastFrame=[];this.input=0;this.lastInput=0;this.flightShadow=null;
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
        if(masked){
          const y=snes.yPos;
          if(!self.flightShadow||self.flightShadow.frame!==self.frame)
            self.flightShadow={minX:x,maxX:x,minY:y,maxY:y,frame:self.frame};
          else {
            const b=self.flightShadow;
            b.minX=Math.min(b.minX,x);b.maxX=Math.max(b.maxX,x);
            b.minY=Math.min(b.minY,y);b.maxY=Math.max(b.maxY,y);
          }
        }
        return false;
      }
      return masked;
    };
  }
  read8(address){return this.snes.ram[address&0x1ffff]}
  read16(address){return this.read8(address)|this.read8(address+1)<<8}
  readSigned16(address){return this.read16(address)<<16>>16}
  write8(address,value){this.snes.ram[address&0x1ffff]=value&255}
  write16(address,value){this.write8(address,value);this.write8(address+1,value>>8)}
  configure(options){
    if(options.superSaiyan&&this.poisoned)options={...options,superSaiyan:false};
    const changed=options.superSaiyan!==undefined&&options.superSaiyan!==this.options.superSaiyan;
    Object.assign(this.options,options);
    if(!this.options.enabled){this.cancelCombat();this.localFlight=false;this.localLift=0;}
    else if(changed&&(this.canAttack||this.worldFlight)){
      this.cancelCombat();
      this.action={kind:this.options.superSaiyan?'transform':'revert',age:0,duration:this.options.superSaiyan?32:20,facing:this.facing,super:this.options.superSaiyan};
      this.playSound?.(this.options.superSaiyan?'transform':'revert');
    }
    this.log(`Mod: ${JSON.stringify(this.options)}`);
  }
  cancelCombat(){this.action=null;this.queuedPunch=false;this.attackHeld=0;this.nativeTapFrames=0;this.charging=false;this.charge=0;this.attackFrames=0;this.attackCooldown=0;this.blastCooldown=0;this.effects=[];if(this.sound?.cancelCombat)this.sound.cancelCombat();else this.sound?.clear();this.plants?.clear();}
  cancelInput(){this.attackHeld=0;this.nativeTapFrames=0;this.charging=false;this.charge=0;this.queuedPunch=false;this.attackBlocked=false;this.input=0;this.lastInput=0;if(this.action?.kind==='ready'||this.action?.kind==='charge')this.action=null;}
  reset(){this.frame=0;this.cancelCombat();this.sound?.restore();this.combatSound?.restore();this.ownership?.reset();this.feedback?.restore();this.orbs?.restore();this.story?.restore();this.worldKi?.restore();this.barriers?.restore();this.flight?.restore();this.gapFlight?.restore();this.flightTransition=null;this.autoLand=false;this.localFlight=false;this.localLift=0;this.localFlightHook?.restore();this.teleport?.restore();this.lastTeleportTarget=-1;this.input=0;this.lastInput=0;this.hiddenLastFrame=[];this.flightShadow=null;this.worldFlight=false;this.nameEditor=false;this.spriteLayer.plan=null;this.attackBlocked=false;this.combo=0;this.comboUntil=0;this.knockbacks=[];this.lastMap=null;this.motion?.reset();}
  snapshot(){
    const fields=['frame','facing','worldFlight','charge','charging','attackHeld','nativeTapFrames','action','queuedPunch','combo','comboUntil','blastCooldown','attackBlocked','effects','knockbacks','lastMap','input','lastInput','attackFrames','attackCooldown','autoLand','flightTransition','localFlight','localLift'];
    return JSON.parse(JSON.stringify({version:1,options:this.options,motion:this.motion?.snapshot(),sound:this.sound?.snapshot(),plants:this.plants?.snapshot(),feedback:this.feedback?.snapshot(),ownership:this.ownership?.snapshot(),flight:this.flight?.snapshot(),localFlightState:this.localFlightHook?.snapshot(),teleportState:this.teleport?.snapshot(),gapFlight:this.gapFlight?.snapshot(),orbs:this.orbs?.snapshot(),story:this.story?.snapshot(),worldKi:this.worldKi?.snapshot(),barriers:this.barriers?.snapshot(),lastTeleportTarget:this.lastTeleportTarget,...Object.fromEntries(fields.map(key=>[key,this[key]]))}));
  }
  restore(saved){
    this.reset();this.worldFlight=this.nativeFlight;this.sound?.restore(saved?.sound);this.plants?.restore(saved?.plants);this.feedback?.restore(saved?.feedback);this.ownership?.restore(saved?.ownership);this.lastTeleportTarget=saved?.lastTeleportTarget??-1;if(saved?.version!==1)return;
    this.flight?.restore(saved?.flight);this.localFlightHook?.restore(saved?.localFlightState);this.teleport?.restore(saved?.teleportState);this.gapFlight?.restore(saved?.gapFlight);this.orbs?.restore(saved?.orbs);this.story?.restore(saved?.story);this.worldKi?.restore(saved?.worldKi);this.barriers?.restore(saved?.barriers);
    for(const key of ['frame','facing','worldFlight','charge','charging','attackHeld','nativeTapFrames','action','queuedPunch','combo','comboUntil','blastCooldown','attackBlocked','effects','knockbacks','lastMap','input','lastInput','attackFrames','attackCooldown','autoLand','flightTransition','localFlight','localLift'])if(saved[key]!==undefined)this[key]=JSON.parse(JSON.stringify(saved[key]));
    Object.assign(this.options,saved.options);this.motion?.restore(saved.motion);
  }
  get gokuActive(){return !this.arrival||this.arrival.arrived;}
  get poisoned(){return !!(this.read8(0xe191)&0x20);}
  get nativeFlight(){return this.flight?this.flight.worldActive():this.read8(0xe4)===4&&this.read8(0xe5)===4&&this.read8(0xd0)===0&&(this.read8(0xec)&0x80)!==0;}
  get canAttack(){
    return this.gokuActive&&this.read8(0xe4)===1&&this.read8(0xe5)===1&&(this.read8(0xe000)&1)!==0&&(this.read8(0xe02c)&1)!==0&&(this.read8(0xec)&0xfe)===0&&!(this.read8(0xed)&0x40)&&this.read8(0xd0)===0&&this.read8(0x2c)===0&&!(this.read8(0xe190)&0x70)&&!(this.read8(0xe191)&0xd5);
  }
  get status(){
    const x=this.read16(0xe002),y=this.read16(0xe004),sx=this.readSigned16(0xe020),sy=this.readSigned16(0xe022);
    return {map:this.read16(0xdc),x,y,screenX:sx,screenY:sy,cameraX:x-sx,cameraY:y-sy,
      hp:this.read16(0xe182),maxHp:this.read16(0xe184),attack:this.read16(0xe198),staminaRemaining:this.read8(0xe1ed),
      charge:this.charge,worldFlight:this.worldFlight,localFlight:this.localFlight,canAttack:this.canAttack,action:this.action?.kind||'idle',combo:this.combo,menu:this.read8(0xec),event:this.read8(0xd0),hiddenOamSlots:this.hiddenLastFrame};
  }
  entities(){
    return Array.from({length:12},(_,index)=>{
      const base=0xe000+index*0x200;
      return {index,base,active:!!(this.read8(base)&1),species:this.read8(base+0x180),hp:this.read16(base+0x182),
        maxHp:this.read16(base+0x184),x:this.read16(base+2),y:this.read16(base+4),screenX:this.readSigned16(base+0x20),screenY:this.readSigned16(base+0x22)};
    });
  }
  beforeFrame(input=this.snes.joypad1State) {
    this.feedback?.tick();this.gapFlight?.tick();
    const previousLift=this.localLift;
    this.localLift=Math.max(0,Math.min(12,this.localLift+(this.localFlight?3:-3)));
    if(previousLift>0&&this.localLift===0&&!this.localFlight&&!this.flightTransition&&this.options.enabled&&this.gokuActive)this.playSound?.('landing');
    this.input=input;this.frame++;this.before={x:this.read16(0xe002),y:this.read16(0xe004)};
    this.snes.joypad1State=(input&0xfff)|((input&(1<<16))?1:0);
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
    // Native poison drains the transformation immediately, including while
    // charging. Its own status/palette/timer and cure remain game-owned.
    if(this.poisoned&&this.options.superSaiyan){
      this.options.superSaiyan=false;this.cancelCombat();this.motion?.reset();
      this.playSound?.('revert');
      this.attackBlocked=!!(input&1);this.log('Poison knocked Goku out of Super Saiyan.');
    }
    const map=this.read16(0xdc);
    if(this.lastMap!==null&&map!==this.lastMap){this.cancelCombat();this.knockbacks=[];this.lastTeleportTarget=-1;this.localFlight=false;this.localLift=0;this.attackBlocked=!!(input&1);}
    this.lastMap=map;
    if(this.options.power&&(this.canAttack||this.worldFlight)){
      this.write16(0xe184,999);this.write16(0xe182,999);
      this.write8(0xe188,255);this.write16(0xe198,this.options.superSaiyan?8191:4095);
      this.write8(0xe1ed,0);
    }
    const nativeDirection=this.read8(0xe010);
    this.facing=(nativeDirection&0x7f)===0?3:(nativeDirection&0x7f)===1?0:(nativeDirection&0x80)?2:1;
    if(this.teleport?.pending){this.snes.joypad1State=0;this.advanceAction();return;}
    if((input&(1<<18))&&!(this.lastInput&(1<<18))&&(this.canAttack||this.worldFlight))this.configure({superSaiyan:!this.options.superSaiyan});
    this.worldKi?.tick(input);
    this.barriers?.tick();
    if(this.worldFlight){this.localFlight=false;this.localLift=0;if(!this.worldKi&&this.autoLand)this.snes.joypad1State|=1;this.advanceAction();return;}
    // Native menus, events, character/status locks and stun own their inputs.
    // A held button must be released after a menu before it can charge again.
    if(!this.canAttack||(input&((1<<1)|(1<<9)|(1<<16)))||(!this.options.power&&this.read8(0xe011)===0x8d)){
      const heldCombat=this.attackHeld>0||this.charging||this.attackBlocked;
      this.cancelCombat();this.attackBlocked=heldCombat&&!!(input&1);
      if(this.attackBlocked&&!(input&(1<<16)))this.snes.joypad1State&=~1;
      return;
    }
    this.aim(input);
    const teleport=!!(input&(1<<19))||((input&0x100)!==0&&(input&(1<<17))!==0);
    const wasTeleport=!!(this.lastInput&(1<<19))||((this.lastInput&0x100)!==0&&(this.lastInput&(1<<17))!==0);
    if(teleport)this.snes.joypad1State&=~0x100;
    if(teleport&&!wasTeleport)this.instantTransmission();
    const hovering=this.localFlight;
    this.localFlight=!!this.localFlightHook&&!teleport&&this.action?.kind!=='teleport'&&!!((input&0x100)||(hovering&&!this.localFlightHook.canLand()));
    if(this.localFlight){this.snes.joypad1State&=~0x100;if(!hovering)this.playSound?.('flight');}
    for(const effect of this.effects)effect.life--;
    this.effects=this.effects.filter(effect=>effect.life>0);
    this.advanceAction();
    if(this.blastCooldown>0)this.blastCooldown--;
    this.updateProjectiles();this.updateKnockbacks();
    if(!(input&1))this.attackBlocked=false;
    this.snes.joypad1State&=~1;
    if((input&1)&&!this.attackBlocked){
      this.attackHeld++;
      if(!this.action)this.action={kind:'ready',age:0,duration:0,facing:this.facing,super:this.options.superSaiyan};
      if(this.attackHeld>=12&&!this.charging&&(!this.action||['ready','punch'].includes(this.action.kind)))this.startCharge();
    }else if(this.attackHeld>0){
      if(this.charging)this.releaseCharge();
      else if(this.action?.kind==='ready'||!this.action)this.punch();
      else this.queuedPunch=true;
      this.attackHeld=0;
    }
    if(!this.action&&this.queuedPunch){this.queuedPunch=false;this.punch();}
    if(this.charging){
      const cap=this.options.superSaiyan?45:90;
      this.charge=Math.min(cap,this.charge+1);
      if(this.charge===cap&&this.action&&!this.action.full){this.action.full=true;this.playSound?.('charged');}
      this.action.facing=this.facing;
    }
    if((input&(1<<17))&&!teleport&&!this.blastCooldown&&!this.charging&&(!this.action||this.action.kind==='blast'))this.kiBlast();
    if(this.nativeTapFrames>0){this.snes.joypad1State|=1;this.nativeTapFrames--;}
    // Charging keeps normal movement/collision, including stairs and dashing.
    // Only the brief committed attack/transform poses plant Goku's feet.
    const action=this.action;
    if(action&&(['transform','revert','beam','teleport'].includes(action.kind)||action.kind==='punch'&&action.age<(action.super?3:6)||action.kind==='blast'&&action.age<(action.super?1:2)))this.snes.joypad1State&=~0x1f0;
    if(action&&!['ready','charge'].includes(action.kind))this.write8(0xe010,[1,2,0x82,0][action.facing]);
    this.attackFrames=action&&['punch','beam','blast'].includes(action.kind)?Math.max(0,action.duration-action.age):0;
    this.attackCooldown=action?.kind==='punch'?this.attackFrames:0;
  }
  afterFrame(){
    if(this.options.enabled&&this.gokuActive)this.localFlightHook?.settle();
    this.moving=this.read16(0xe002)!==this.before.x||this.read16(0xe004)!==this.before.y;
    this.lastInput=this.input;
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
    action.age++;
    if(action.kind==='punch'&&!action.hit&&action.age>=action.impact){action.hit=true;this.strike(action);}
    if(action.kind==='blast'&&action.shots<3&&action.age>=(action.super?1:2)*(action.shots+1)){
      this.fireKi(action);action.shots++;
    }
    if(action.kind==='teleport'&&!action.arrived&&action.age>=4)this.finishTeleport(action);
    if(action.kind==='teleport'&&action.arrived){
      if(this.teleport?.pending)action.age=4;
      else if(!action.sounded){action.sounded=true;this.playSound?.('teleportIn');}
    }
    if(action.duration>0&&action.age>=action.duration){this.action=null;return;}
    // Keep fast taps: one queued strike can cancel the visible recovery.
    if(action.kind==='punch'&&this.queuedPunch&&action.age>=(action.super?4:9)){this.queuedPunch=false;this.punch();}
  }
  startCharge(){
    if(this.options.enabled&&(this.canAttack||this.worldFlight)){
      this.charging=true;this.charge=0;this.queuedPunch=false;this.nativeTapFrames=0;
      this.action={kind:'charge',age:0,duration:0,facing:this.facing,super:this.options.superSaiyan};this.playSound?.('charge');
    }
  }
  damageScale(){return this.options.power?(this.options.superSaiyan?8191:4095):Math.max(12,Math.min(200,this.read16(0xe198)));}
  instantTransmission(){
    if(!this.options.enabled||!this.canAttack||this.action?.kind==='teleport')return false;
    const origin={x:this.read16(0xe002),y:this.read16(0xe004)};
    const enemies=this.entities().filter(e=>e.index>=3&&e.active&&e.species<128&&e.species!==0x55&&e.hp&&!(this.read8(e.base+0x191)&0x80));
    // Each press chooses one living foe. Repeated presses cycle away from the
    // previous target, and never inflict damage or return Goku to his origin.
    const reachable=enemies.filter(e=>this.teleportLanding(e,origin));
    const candidates=reachable.filter(e=>e.index!==this.lastTeleportTarget);
    const target=(candidates.length?candidates:reachable).sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y))[0];
    if(!target)return false;
    this.cancelCombat();this.action={kind:'teleport',age:0,duration:12,super:this.options.superSaiyan,facing:this.facing,target:target.index,species:target.species,origin,arrived:false};
    this.playSound?.('teleport');return true;
  }
  finishTeleport(action){
    action.arrived=true;
    const target=this.entities()[action.target];
    if(!target?.active||target.species!==action.species||!target.hp||(this.read8(target.base+0x191)&0x80))return;
    const landing=this.teleportLanding(target,action.origin);if(!landing)return;
    this.write16(0xe002,landing.x);this.write16(0xe004,landing.y);
    this.write8(0xe00b,landing.terrain);
    this.write8(0xe006,0);this.write8(0xe007,0);this.write8(0xe045,0);
    action.facing=landing.facing;this.facing=action.facing;
    this.write8(0xe010,[1,2,0x82,0][this.facing]);this.lastTeleportTarget=target.index;
    this.localFlight=false;this.localLift=0;this.localFlightHook?.restore();
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
      if(enemy.index<3||!enemy.active||enemy.species>=128||!enemy.hp||(this.read8(enemy.base+0x191)&0x80))return false;
      const x=enemy.x-origin.x,y=enemy.y-centerY-origin.y,along=x*dx+y*dy;
      return along>=-behind&&along<=range&&Math.abs(x*dy-y*dx)<=width;
    });
  }
  hit(enemy,damage,dx,dy,launch=false){
    if(enemy.species===0x55)return{index:enemy.index,species:enemy.species,before:enemy.hp,after:enemy.hp,activated:this.orbs?.hit(enemy)||false};
    // Queue damage through C0:4053 so the original game owns impact, numbers,
    // hurt states and defeat events. Its display/queue clamps at 999; apply
    // excess damage first but leave at least 1HP for the native lethal hit.
    const total=Math.min(65535,this.read16(enemy.base+0x1f1)+damage);
    if(total>999)this.write16(enemy.base+0x182,Math.max(1,enemy.hp-(total-999)));
    this.write16(enemy.base+0x1f1,Math.min(999,total));this.write8(enemy.base+0x1f0,0);this.write8(enemy.base+0x1ec,0);
    this.combatSound?.mark(enemy);
    if(launch&&enemy.species<84){
      this.knockbacks=this.knockbacks.filter(hit=>hit.base!==enemy.base);
      this.knockbacks.push({base:enemy.base,species:enemy.species,x:enemy.x,y:enemy.y,dx,dy,age:0,duration:12,distance:this.options.superSaiyan?88:56});
    }
    return {index:enemy.index,species:enemy.species,before:enemy.hp,after:Math.max(0,enemy.hp-damage)};
  }
  punch(){
    if(!this.options.enabled||!this.canAttack)return [];
    this.combo=this.frame<=this.comboUntil?(this.combo+1)%3:0;this.comboUntil=this.frame+40;
    this.action={kind:'punch',age:0,duration:this.options.superSaiyan?7:14,impact:this.options.superSaiyan?1:2,facing:this.facing,super:this.options.superSaiyan,combo:this.combo};
    this.playSound?.('swing');return [];
  }
  strike(action){
    const [dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][action.facing],origin={x:this.read16(0xe002),y:this.read16(0xe004)};
    const targets=this.targets(origin,dx,dy,action.combo===2?54:44,24,10),damage=Math.round(this.damageScale()*(action.combo===2?1.5:1));
    const hits=targets.map(enemy=>this.hit(enemy,damage,dx,dy,true));
    // The native pulse handles talking/chests. The interaction adapter stops
    // its weapon fallback; punching plants uses the same native redraw queue
    // as the beam, so no invisible sword animation is needed.
    if(!hits.length)this.nativeTapFrames=2;
    this.plants?.beam({...origin,dx,dy,length:28,halfWidth:9,policy:'objects'});
    for(const enemy of targets)this.effects.push({kind:'impact',x:enemy.x,y:enemy.y-12,dx,dy,life:10,max:10,super:action.super});
    this.effects.push({...origin,kind:'punch',dx,dy,life:7,max:7,super:action.super,hit:!!hits.length});
    if(hits.length){this.feedback?.pulse(action.super?5:3);this.playSound?.(action.combo===2?'kick':'hit');this.log(`Punch ${damage}: ${JSON.stringify(hits)}`);}
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
    this.action={kind:'blast',age:0,duration:superForm?5:10,facing:this.facing,super:superForm,shots:0};
    this.blastCooldown=superForm?5:12;
  }
  fireKi(action){
    const [dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][action.facing],superForm=action.super;
    const hand=action.shots&1;
    this.effects.push({...this.handOrigin(action.facing,'ki',hand),kind:'ki',dx,dy,life:22,max:22,super:superForm,hand,width:superForm?12:8,damage:Math.round(this.damageScale()*.4),hits:[],range:256});
    this.playSound?.('blast');
  }
  releaseCharge(){
    if(!this.charging)return [];this.charging=false;
    const strength=Math.min(1,this.charge/(this.options.superSaiyan?45:90));
    const damage=Math.round(this.damageScale()*Math.max(.25,strength));
    const [dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][this.facing];
    const origin=this.handOrigin(),width=5+strength*14;
    this.effects.push({...origin,kind:'beam',dx,dy,life:24,max:24,width,strength,super:this.options.superSaiyan,damage,hits:[],range:320});
    this.action={kind:'beam',age:0,duration:28,facing:this.facing,super:this.options.superSaiyan};
    this.attackFrames=28;this.charge=0;this.queuedPunch=false;
    this.feedback?.pulse(this.options.superSaiyan?14:10);this.playSound?.('beam');this.log(`Kamehameha ${damage}`);return [];
  }
  updateProjectiles(){
    for(const effect of [...this.effects]){
      if(!['beam','ki'].includes(effect.kind))continue;
      const age=effect.max-effect.life,speed=effect.kind==='ki'?14:32,length=Math.min(effect.range,(age+1)*speed);
      if(effect.kind==='beam')this.plants?.beam({...effect,length,halfWidth:effect.width,policy:'objects'});
      if(effect.kind==='beam')this.barriers?.beam({...effect,length});
      const width=effect.width+8;
      for(const enemy of this.targets(effect,effect.dx,effect.dy,length,width,8,12)){
        if(effect.hits.includes(enemy.index))continue;
        if(effect.kind==='ki'&&(enemy.x-effect.x)*effect.dx+(enemy.y-12-effect.y)*effect.dy<length-speed-16)continue;
        effect.hits.push(enemy.index);this.hit(enemy,effect.damage,effect.dx,effect.dy,true);
        this.playSound?.('impact');
        this.effects.push({kind:'impact',x:enemy.x,y:enemy.y-12,dx:effect.dx,dy:effect.dy,life:12,max:12,super:effect.super});
        if(effect.kind==='ki'){effect.life=0;break;}
      }
    }
  }
  updateKnockbacks(){
    this.knockbacks=this.knockbacks.filter(hit=>{
      const species=this.read8(hit.base+0x180),dead=!!(this.read8(hit.base+0x191)&0x80);
      // The native kill routine changes the actor into death-effect F9 before
      // its explosion finishes. Carry that same effect along the launch arc.
      if(!(this.read8(hit.base)&1)||(species!==hit.species&&!(species===0xf9&&dead)))return false;
      hit.age++;const t=Math.min(1,hit.age/hit.duration),distance=hit.distance*(1-(1-t)**2);
      this.write16(hit.base+2,Math.round(Math.max(8,Math.min(1016,hit.x+hit.dx*distance))));
      this.write16(hit.base+4,Math.round(Math.max(8,Math.min(1016,hit.y+hit.dy*distance))));
      this.write8(hit.base+0x45,Math.round(Math.sin(t*Math.PI)*20));
      return hit.age<hit.duration;
    });
  }
  // The PPU hook draws replacement OBJ pixels before native layer composition.
  // Kept as a no-op for the wrapper and older inspection scripts.
  draw(){}
  destroy(){this.spriteLayer.destroy();this.snes.ppu.getWindowState=this.originalGetWindowState}
}
window.ManaMod=ManaMod;
