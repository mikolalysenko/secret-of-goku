import { MAPS, NPCS, OBSTACLES, RABITES, TECHNIQUES, LANDINGS, POTOS_WORLD, SAVE_VERSION } from './data.js';
import { clamp, distance, normalize, inPolygon, inRect, distanceToSegment, DIRECTIONS, seededRandom } from './math.js';

const line = (speaker, text) => ({ speaker, text });
const emptyInput = { down: new Set(), pressed: new Set(), released: new Set(), x:0, y:0 };

export class Game {
  constructor() {
    this.random = seededRandom(9001);
    this.romMaps = null;
    this.reset();
    this.mode = 'title';
  }

  reset() {
    this.mode = 'play'; this.map = 'potos'; this.time = 0;
    this.player = { ...MAPS.potos.spawn, facing:'right', hp:9999, ki:100, super:false, charge:0, charging:false, moving:false, attack:0, cooldown:0, blastCooldown:0, invulnerable:0, dash:0 };
    this.flags = { metElder:false, bossDefeated:false, banished:false, gateOpen:false, chest:false, lunch:false, completed:false };
    this.destroyed = new Set(); this.defeated = new Set(); this.breaks = [];
    this.stats = { time:0, kills:0, damage:0, beams:0, punches:0, flights:0, beans:3 };
    this.ring = false; this.ringIndex = 0; this.overlay = null; this.dialogue = null;
    this.effects = []; this.projectiles = []; this.enemies = []; this.sounds = []; this.toastQueue=[];
    this.toast = null; this.banner = null; this.shake = 0; this.flash = 0; this.transition = 0;
    this.pending = null; this.attackHeld = 0; this.spirit = null; this.saveDirty = false;
    this.flight = { ...POTOS_WORLD, angle: -Math.PI/2, speed:0, altitude:34, time:0, landing:0, distance:0 };
    this.populate();
  }

  start(save) {
    this.reset();
    if (save && this.load(save)) {
      this.notify('WELCOME BACK', 'The village has almost finished repairing the lawn.');
    } else {
      this.notify('POTOS VILLAGE', 'Find the Elder in the northeast. Or make your own entrance.', 6);
      this.banner = { title:'Potos Village', subtitle:'CHAPTER 01 · AN UNEXPECTED HERO', life:4.2 };
    }
  }

  get level() { return MAPS[this.map]; }
  get activeNPCs() { return NPCS.filter(n => n.map === this.map); }
  get activeObstacles() { return this.map === 'potos' ? OBSTACLES.filter(o => !this.destroyed.has(o.id) && !(o.id==='gate' && this.flags.gateOpen)) : []; }
  get power() { return this.player.super ? 450050 : 9001; }
  get chargeFraction() { return clamp(this.player.charge / (this.player.super ? .72 : 1.6), 0, 1); }
  get frozen() { return this.mode === 'title' || !!this.overlay || !!this.dialogue || this.ring; }
  get objective() {
    if (this.flags.completed) return 'Potos chapter complete. Explore, experiment, cause problems.';
    if (this.flags.banished) return 'Leave Potos. A lifetime ban should take about eight seconds.';
    if (this.flags.bossDefeated) return 'Tell the Elder his monster problem is extremely solved.';
    if (this.map==='cave') return 'Defeat Mantis Ant. The sword is optional.';
    if (this.flags.metElder) return 'Investigate the glowing crack east of the village square.';
    return 'Find the Elder in the northeast. Or skip the plot.';
  }

  populate() {
    if (this.map==='potos') this.enemies=RABITES.filter(e=>!this.defeated.has(e.id)).map(e=>({...e,home:{x:e.x,y:e.y},type:'rabite',hp:20,maxHp:20,radius:10,cooldown:1,state:'idle',age:this.random()*5}));
    else if (this.map==='cave' && !this.flags.bossDefeated) this.enemies=[{id:'mantis',type:'mantis',x:227,y:171,hp:2500,maxHp:2500,radius:26,cooldown:1.5,state:'idle',age:0}];
    else this.enemies=[];
  }

  notify(title, text, duration=4) {
    const toast={title,text,life:duration};
    if (this.toast) this.toastQueue.push(toast); else this.toast=toast;
    if (this.toastQueue.length>4) this.toastQueue.shift();
  }

  sequence(id,title,text) {
    if (this.breaks.some(b=>b.id===id)) return;
    this.breaks.push({id,title,text,time:this.stats.time});
    this.notify(`SEQUENCE BREAK · ${title}`,text,5.5); this.sounds.push('achievement'); this.saveDirty=true;
  }

  say(lines, after=null) {
    this.cancelCharge(); this.ring=false;
    this.dialogue={lines:lines.map(l=>Array.isArray(l)?line(...l):l),index:0,after};
    this.sounds.push('menu');
  }

  advanceDialogue() {
    if (!this.dialogue) return;
    this.sounds.push('tick');
    if (++this.dialogue.index < this.dialogue.lines.length) return;
    const after=this.dialogue.after;
    this.dialogue=null;
    if (after==='elder') { this.flags.metElder=true; this.saveDirty=true; this.notify('A DISTURBANCE IN THE KI','The ground is shaking east of the square. [E] to investigate.'); }
    if (after==='banish') { this.flags.banished=true; this.flags.gateOpen=true; this.saveDirty=true; this.notify('BANISHED. TECHNICALLY.','The south gate is open. The sky always was.'); }
    if (after==='lunch') { this.flags.lunch=true; this.player.hp=9999; this.player.ki=100; this.saveDirty=true; this.sounds.push('heal'); }
    if (after==='chest'&&!this.flags.chest) { this.flags.chest=true; this.stats.beans+=2; this.saveDirty=true; this.sounds.push('heal'); }
    if (after==='victory') { this.enterMap('potos',488,495); this.notify('MONSTER PROBLEM: SOLVED','The Elder will definitely be pleased about this.'); }
    if (after==='leave') this.finishChapter('gate');
  }

  talk(id) {
    if (id==='elder'||id==='elderInside') {
      if (this.flags.banished) return this.say([['Elder','You are banished from Potos. Forever!'],['Goku','Does forever include lunchtime?'],['Elder','Especially lunchtime.']]);
      if (this.flags.bossDefeated) return this.say([['Elder','You defeated the monster! But you also destroyed three centuries of village insurance.'],['Goku','It was a pretty good warm-up. Got anything stronger?'],['Elder','Yes. A lifetime ban. Leave through the south gate.'],['Goku','Sure! I can just fly back for dinner.'],['Elder','That is not how banishment works.']],'banish');
      if (this.flags.metElder) return this.say([['Elder','The monster is beneath the crack east of the square. Take care!'],['Goku','I promise to use a small Kamehameha.'],['Elder','I do not know what that is, and I am already worried.']]);
      return this.say([['Elder','A stranger! Did you pull the legendary Mana Sword from its stone?'],['Goku','Nope. I lifted the stone. The sword looked a little rusty.'],['Elder','Then why are monsters appearing in our village?'],['Goku','Maybe they sensed my power level. Or the food.'],['Elder','There is something enormous underneath the village square. Our hero will need a sword...'],['Goku','I brought two hands. Is that enough?']],'elder');
    }
    const scripts={
      jema:[['Jema',this.flags.bossDefeated?'That was meant to teach you about attack percentages.':'The Mana Sword grows stronger as you visit all eight palaces.'],['Goku','Eight? Could I just punch the problem now?'],['Jema','I spent twenty years preparing this speech.']],
      elliot:[['Elliot','Hey! You cannot go through here without a sword!'],['Goku','What about a Kamehameha?'],['Elliot','...I should move my house.']],
      timothy:[['Timothy','Are you really stronger than the Mana Beast?'],['Goku','I dunno! Does it want to spar?'],['Timothy','Please do not invite it to the village.']],
      gardener:[['Gardener','Please be careful with my flowers.'],['Goku','Of course!'],['Gardener','And the trees. And the houses. And the concept of a village.']],
      guard:[['Gatekeeper',this.destroyed.has('gate')?'There used to be a gate here.':'This gate stays shut until the Elder says otherwise.'],['Goku','Can I go over it?'],['Gatekeeper','No.'],['Goku','Through it?'],['Gatekeeper','Also no. Why are you smiling?']],
      shopkeeper:[['Shopkeeper','A sword? An axe? A very reasonably priced spear?'],['Goku','Do you sell weighted training clothes?'],['Shopkeeper','Our heaviest armor weighs eight pounds.'],['Goku','Oh! Baby clothes.']],
      resident:[['Villager','I heard you can fly. Why are you walking?'],['Goku','I like the music.'],['Villager','Fair enough.']],
      innkeeper:[['Innkeeper',this.flags.lunch?'You again? We have only just restocked.':'Welcome! All you can eat for ten gold pieces.'],['Goku','All I can eat? You are really nice!'],['Innkeeper','...I have made a terrible mistake.'],['Goku','Thanks for the meal! HP and ki restored.']],
    };
    this.say(scripts[id]||[['Villager','Welcome to Potos!']],id==='innkeeper'?'lunch':null);
  }

  context() {
    if (this.mode==='flight') return {type:'land',label:`Land · ${LANDINGS[this.flight.landing].name}`};
    const p=this.player;
    const options=[];
    for (const n of this.activeNPCs) options.push({type:'npc',id:n.id,label:`Talk to ${n.name}`,distance:distance(p,n),max:n.id==='shopkeeper'?70:35});
    for (const d of this.level.doors||[]) options.push({type:'door',data:d,label:`Enter ${d.name}`,distance:distance(p,d),max:23});
    if (this.level.exit) options.push({type:'exit',label:'Return to Potos',distance:distance(p,this.level.exit),max:27});
    if (this.map==='potos') {
      options.push({type:'pit',label:this.flags.bossDefeated?'Inspect the very empty cave':'Investigate the strange tremor',distance:distance(p,{x:488,y:467}),max:38});
      options.push({type:'sign',label:'Read the village notice',distance:distance(p,{x:296,y:490}),max:25});
    }
    if (this.map==='store') options.push({type:'chest',label:this.flags.chest?'Inspect the empty chest':'Open the chest',distance:distance(p,{x:92,y:141}),max:30});
    return options.filter(o=>o.distance<=o.max).sort((a,b)=>a.distance-b.distance)[0]||null;
  }

  interact() {
    if (this.dialogue) return this.advanceDialogue();
    const c=this.context();
    if (!c) { this.notify('LOOKING FOR SOMETHING?','Stand beside a villager, doorway, sign, or glowing crack.'); return; }
    if (c.type==='npc') this.talk(c.id);
    if (c.type==='door') this.enterMap(c.data.to,...c.data.spawn);
    if (c.type==='exit') this.enterMap('potos',...this.level.exit.to);
    if (c.type==='pit') this.enterCave();
    if (c.type==='land') this.land();
    if (c.type==='sign') this.say([['Village notice','POTOS VILLAGE\nNo weapons. No monsters. No unauthorized flying.'],['Goku','Hey, they spelled "fun" three different ways.']]);
    if (c.type==='chest') this.say(this.flags.chest?[['Goku','Just a few crumbs. Even the beans have beans?']]:[['Goku','Two senzu beans! These will make a great emergency lunch.']],this.flags.chest?null:'chest');
  }

  enterMap(id,x,y) {
    if (!MAPS[id]) return;
    this.map=id; this.mode='play'; this.player.x=x; this.player.y=y;
    this.player.facing='down'; this.cancelCharge(); this.effects=[]; this.projectiles=[]; this.spirit=null;
    this.populate(); this.transition=0.35; this.saveDirty=true;
    this.banner={title:this.level.name,subtitle:this.level.subtitle,life:2.5};
    this.sounds.push('door');
  }

  enterCave() {
    this.enterMap('cave',139,266);
    if (!this.flags.bossDefeated) this.say([['Mantis Ant','SKREEEEEE!'],['Goku','Wow, you are big! Ready when you are.'],['Jema','Remember to let your attack meter reach one hundred...'],['Goku','My what?']]);
  }

  walkable(x,y, radius=4) {
    const m=this.level;
    const decoded=m.romId&&this.romMaps?.maps.find(map=>map.id===m.romId)?.composite;
    for (const [dx,dy] of [[0,0],[-radius,0],[radius,0],[0,-radius/2],[0,radius/2]]) {
      const px=x+dx,py=y+dy;
      if(px<0||py<0||px>=m.width||py>=m.height)return false;
      if(decoded){
        const tx=Math.floor((px+(m.collisionOrigin?.[0]||0))/16),ty=Math.floor((py+(m.collisionOrigin?.[1]||0))/16);
        if(tx<0||ty<0||tx>=decoded.width||ty>=decoded.height||decoded.solid.background[ty*decoded.width+tx])return false;
      }else{
        if (!inPolygon(px,py,m.floor)) return false;
        if (m.solids.some(r=>inRect(px,py,r))) return false;
      }
      if (this.activeObstacles.some(o=>inRect(x+dx,y+dy,o.rect))) return false;
    }
    return true;
  }

  move(actor,dx,dy) {
    const steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/2)||1;
    for(let i=0;i<steps;i++) {
      if(this.walkable(actor.x+dx/steps,actor.y)) actor.x+=dx/steps;
      if(this.walkable(actor.x,actor.y+dy/steps)) actor.y+=dy/steps;
    }
  }

  cancelCharge() { this.player.charging=false; this.player.charge=0; this.attackHeld=0; }

  punch() {
    const p=this.player;
    if(p.cooldown>0) return;
    p.attack=.22; p.cooldown=p.super?.085:.27;
    this.stats.punches++; this.sounds.push('punch');
    const dir=DIRECTIONS[p.facing];
    this.effects.push({type:'punch',x:p.x+dir.x*16,y:p.y+dir.y*16-12,dir:p.facing,life:.2,max:.2,super:p.super});
    const damage=p.super?45005:9001;
    for(const e of this.enemies) {
      const d=distance(p,e), dot=(e.x-p.x)*dir.x+(e.y-p.y)*dir.y;
      if(e.hp>0&&d<e.radius+34&&(dot>-5||d<20)) this.hitEnemy(e,damage,dir,400);
    }
    for(const o of this.activeObstacles) {
      const dot=(o.x-p.x)*dir.x+(o.y-p.y)*dir.y;
      if(distance(p,o)<o.radius+28&&dot>-8) this.breakObstacle(o);
    }
  }

  beam(power=this.chargeFraction, free=false) {
    const p=this.player, cost=free?0:Math.round(14+16*power);
    if(p.ki<cost) { this.notify('CATCH YOUR BREATH','Ki regenerates on its own. A senzu bean restores it instantly.'); this.cancelCharge(); return false; }
    p.ki-=cost; p.attack=.65; p.cooldown=.4;
    const d=DIRECTIONS[p.facing], length=220+power*320, width=9+power*(p.super?32:21);
    const a={x:p.x+d.x*12,y:p.y+d.y*12-10};
    const b={x:a.x+d.x*length,y:a.y+d.y*length};
    this.effects.push({type:'beam',a,b,width,life:.68,max:.68,super:p.super});
    this.shake=power*9+2; this.flash=.16; this.stats.beams++;
    this.sounds.push('beam');
    const damage=Math.round((10000+power*80000)*(p.super?5:1));
    for(const e of this.enemies) if(e.hp>0&&distanceToSegment({x:e.x,y:e.y-8},a,b)<width+e.radius) this.hitEnemy(e,damage,d,700);
    for(const o of this.activeObstacles) if(distanceToSegment({x:o.x,y:o.y-10},a,b)<width+o.radius) this.breakObstacle(o);
    this.cancelCharge(); this.saveDirty=true; return true;
  }

  kiBlast(volley=false) {
    const p=this.player, cost=volley?18:4;
    if(p.ki<cost||p.blastCooldown>0) return false;
    p.ki-=cost; p.blastCooldown=p.super?.09:.23; p.attack=.17; this.sounds.push('ki');
    const dir=DIRECTIONS[p.facing], angle=Math.atan2(dir.y,dir.x);
    for(const offset of volley?[-.15,0,.15]:[0]) {
      this.projectiles.push({x:p.x+dir.x*17,y:p.y-11+dir.y*17,vx:Math.cos(angle+offset)*280,vy:Math.sin(angle+offset)*280,life:1.6,super:p.super,hostile:false});
    }
    return true;
  }

  hitEnemy(e,damage,dir,force) {
    if(e.hp<=0) return;
    e.hp=Math.max(0,e.hp-damage); this.stats.damage+=damage;
    this.effects.push({type:'text',x:e.x,y:e.y-33,text:damage.toLocaleString('en-US'),color:this.player.super?'#ffe587':'#ffffff',life:1.3,max:1.3});
    this.burst(e.x,e.y-15,e.type==='mantis'?45:18,this.player.super?'#ffd76d':'#b8fbff');
    this.shake=Math.max(this.shake,e.type==='mantis'?10:4); this.sounds.push('hit');
    if(e.hp===0) {
      e.state='launched'; e.vx=dir.x*force; e.vy=dir.y*force; e.launched=1.1; e.z=0;
      this.defeated.add(e.id); this.stats.kills++; this.saveDirty=true;
      if(e.type==='mantis') {
        this.flags.bossDefeated=true;
        this.pending={kind:'bossVictory',delay:1.6};
        this.notify('BOSS DEFEATED','Mantis Ant has left the difficulty curve.');
      } else if(this.stats.kills===1) this.notify('9,001 DAMAGE','That Rabite had 20 HP. You may have overdone it.');
    }
  }

  breakObstacle(o) {
    if(this.destroyed.has(o.id)) return;
    this.destroyed.add(o.id); this.burst(o.x,o.y-10,30,o.kind==='rock'?'#b8c3c0':'#d5a968');
    this.effects.push({type:'shockwave',x:o.x,y:o.y,life:.6,max:.6,color:'#f7e7b7',radius:45});
    this.shake=6; this.sounds.push('break'); this.saveDirty=true;
    this.sequence(o.id,o.breakTitle,o.breakText);
  }

  burst(x,y,count,color) {
    for(let i=0;i<count;i++) {
      const angle=this.random()*Math.PI*2, speed=15+this.random()*105;
      this.effects.push({type:'particle',x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-20,life:.4+this.random()*.6,max:1,color,size:1+Math.floor(this.random()*3)});
    }
  }

  transform() {
    const p=this.player;
    p.super=!p.super; this.cancelCharge();
    this.effects.push({type:'shockwave',x:p.x,y:p.y,life:1,max:1,color:p.super?'#ffe27b':'#aeeeff',radius:125});
    this.burst(p.x,p.y-13,45,p.super?'#ffdc67':'#c2f6ff');
    this.shake=9; this.flash=.45; this.sounds.push('transform');
    this.banner={title:p.super?'SUPER SAIYAN':'BACK TO BASE',subtitle:p.super?'POWER × 50 · ATTACK SPEED × 3':'STILL COMPLETELY UNREASONABLE',life:2.5};
    this.saveDirty=true;
  }

  castTechnique(index=this.ringIndex) {
    const t=TECHNIQUES[index]; if(!t) return;
    this.ring=false;
    if(this.mode==='flight'&&['wave','volley','spirit'].includes(t.id))return this.notify('LAND TO FIGHT','Choose a Potos landing spot, then unleash your techniques on the ground.');
    if(t.id==='super') this.transform();
    if(t.id==='wave') this.beam(1);
    if(t.id==='volley') { this.player.blastCooldown=0; this.kiBlast(true); }
    if(t.id==='flight') this.takeOff();
    if(t.id==='senzu') {
      if(this.stats.beans<1) return this.notify('OUT OF SENZU','There may be more in the village storehouse.');
      this.stats.beans--; this.player.hp=9999; this.player.ki=100;
      this.burst(this.player.x,this.player.y-16,20,'#bef296'); this.sounds.push('heal');
      this.notify('SMALL BEAN. BIG LUNCH.','HP and ki fully restored.'); this.saveDirty=true;
    }
    if(t.id==='spirit') {
      if(this.player.ki<60) return this.notify('NEED 60 KI','Give the planet a moment to catch its breath.');
      this.player.ki-=60; this.spirit={x:this.player.x,y:this.player.y-45,life:2,max:2};
      this.sounds.push('spirit');
    }
  }

  takeOff() {
    if(this.mode==='flight') return this.land();
    if(this.map!=='potos'&&this.map!=='cave') return this.notify('MIND THE CEILING','Step outside to take flight. The innkeeper has suffered enough.');
    if(this.map==='cave'&&!this.flags.bossDefeated) this.sequence('bossSkip','BOSS? WHAT BOSS?','Flew straight out of the first boss fight. Jema is still explaining the controls.');
    if(!this.flags.metElder) this.sequence('earlyFlight','FLAMMIE CAN SLEEP IN','Took to the skies before even meeting the Elder.');
    this.cancelCharge(); this.mode='flight'; this.ring=false;
    this.flight={...POTOS_WORLD,angle:-Math.PI/2,speed:0,altitude:34,time:0,landing:0,distance:0};
    this.stats.flights++; this.sounds.push('flight'); this.transition=.55;
    this.banner={title:'THE WORLD IS OPEN',subtitle:'NO DRUM. NO DRAGON. JUST GOKU.',life:3.4};
    this.saveDirty=true;
  }

  land() {
    if(distance(this.flight,POTOS_WORLD)>70) {
      this.notify('POTOS IS YOUR LANDING ZONE','Press H to return to Potos. The rest of the world is open for flying.'); return false;
    }
    const spot=LANDINGS[this.flight.landing];
    this.enterMap('potos',spot.x,spot.y);
    if(this.flight.landing===2&&!this.flags.gateOpen&&!this.destroyed.has('gate')) this.sequence('gateFlight','THE FENCE WAS A SUGGESTION','Landed beyond the locked south gate.');
    if(this.flags.banished) this.sequence('return','LIFETIME BAN: EIGHT SECONDS','Returned to Potos by air. The gatekeeper cannot look up.');
    this.sounds.push('land'); return true;
  }

  finishChapter(route) {
    if(this.flags.completed) return;
    this.flags.completed=true; this.saveDirty=true;
    if(!this.flags.bossDefeated) this.sequence('plotSkip','THE TUTORIAL WAS OPTIONAL','Left Potos without fighting the mandatory first boss.');
    this.notify('POTOS CHAPTER COMPLETE',this.flags.bossDefeated?'Village saved. Property values uncertain.':'Village visited. Prophecy politely declined.',7);
    if(route==='gate') this.overlay='ending';
  }

  step(dt,input=emptyInput) {
    dt=clamp(dt,0,.05); this.time+=dt;
    this.transition=Math.max(0,this.transition-dt); this.flash=Math.max(0,this.flash-dt);
    this.shake=Math.max(0,this.shake-dt*22);
    if(this.banner) { this.banner.life-=dt; if(this.banner.life<=0) this.banner=null; }
    if(this.toast&&!this.frozen) { this.toast.life-=dt; if(this.toast.life<=0) this.toast=this.toastQueue.shift()||null; }
    this.updateEffects(dt);
    if(this.frozen) return;
    this.stats.time+=dt;
    if(this.mode==='flight') return this.updateFlight(dt,input);
    const p=this.player;
    p.cooldown=Math.max(0,p.cooldown-dt); p.blastCooldown=Math.max(0,p.blastCooldown-dt); p.attack=Math.max(0,p.attack-dt);
    p.invulnerable=Math.max(0,p.invulnerable-dt); p.dash=Math.max(0,p.dash-dt);
    p.ki=Math.min(100,p.ki+dt*(p.charging?1:9));
    if(input.pressed.has('attack')) { this.attackHeld=0; p.charging=true; p.charge=0; }
    if(p.charging&&input.down.has('attack')) {
      this.attackHeld+=dt; p.charge=Math.max(0,this.attackHeld-.15);
      if(p.charge>.15&&Math.floor(this.time*20)%2===0) this.effects.push({type:'charge',x:p.x,y:p.y-14,life:.2,max:.2,color:p.super?'#ffe88b':'#8dedff'});
    }
    if(input.released.has('attack')&&p.charging) {
      if(this.attackHeld<.28) { this.cancelCharge(); this.punch(); }
      else this.beam(Math.max(.12,this.chargeFraction));
    }
    // The separate punch button can be held for the Super Saiyan rush.
    if(input.down.has('punch')) this.punch();
    if(input.down.has('ki')&&!p.charging) this.kiBlast();
    if(input.pressed.has('dash')&&p.ki>=5) { p.dash=.2; p.ki-=5; this.sounds.push('dash'); }
    const moving=!!(input.x||input.y);
    p.moving=moving&&!this.spirit;
    if(moving&&!this.spirit) {
      const d=normalize(input.x,input.y);
      if(!p.charging) p.facing=Math.abs(input.x)>Math.abs(input.y)?(input.x>0?'right':'left'):(input.y>0?'down':'up');
      const speed=(p.super?104:79)*(p.charging?.3:1)*(p.dash>0?3.4:1);
      if(p.dash>0) this.effects.push({type:'afterimage',x:p.x,y:p.y,facing:p.facing,super:p.super,life:.22,max:.22});
      this.move(p,d.x*speed*dt,d.y*speed*dt);
    }
    if(this.map==='potos'&&p.y>811&&!this.flags.completed) this.finishChapter('gate');
    if(this.spirit) {
      this.spirit.life-=dt;
      if(this.spirit.life<=0) {
        this.effects.push({type:'shockwave',x:p.x,y:p.y,life:1.1,max:1.1,color:'#b0f5ff',radius:230});
        this.flash=.55; this.shake=14; this.sounds.push('beam');
        for(const e of this.enemies) if(e.hp>0&&distance(p,e)<260) this.hitEnemy(e,p.super?999999:250000,normalize(e.x-p.x,e.y-p.y),800);
        for(const o of this.activeObstacles) if(distance(p,o)<250) this.breakObstacle(o);
        this.spirit=null;
      }
    }
    this.updateEnemies(dt); this.updateProjectiles(dt);
    if(this.pending) {
      this.pending.delay-=dt;
      if(this.pending.delay<=0) {
        const kind=this.pending.kind; this.pending=null;
        if(kind==='bossVictory') this.say([['Jema','That was the Mantis Ant. A fearsome monster with two thousand five hundred hit points.'],['Goku','Oh! Was I supposed to hold back?'],['Jema','It is currently in another postal district.'],['Goku','Good fight! Let us get something to eat.']],'victory');
      }
    }
  }

  updateEnemies(dt) {
    const p=this.player;
    for(const e of this.enemies) {
      e.age+=dt;
      if(e.state==='launched') { e.launched-=dt; e.x+=e.vx*dt; e.y+=e.vy*dt; e.z=Math.sin((1.1-e.launched)/1.1*Math.PI)*65; continue; }
      if(e.hp<=0) continue;
      e.cooldown-=dt;
      const d=distance(e,p), n=normalize(p.x-e.x,p.y-e.y);
      if(d<160&&d>e.radius+13) this.move(e,n.x*(e.type==='mantis'?20:14)*dt,n.y*(e.type==='mantis'?20:14)*dt);
      if(e.cooldown<=0) {
        if(d<e.radius+21&&p.invulnerable<=0) { p.hp=Math.max(1,p.hp-(e.type==='mantis'?3:1));p.invulnerable=.6;this.effects.push({type:'text',x:p.x,y:p.y-34,text:e.type==='mantis'?'3':'1',color:'#ffc2a7',life:.8,max:.8});e.cooldown=1.5; }
        else if(e.type==='mantis') {
          this.projectiles.push({x:e.x,y:e.y-20,vx:n.x*75,vy:n.y*75,life:2.8,hostile:true}); e.cooldown=2;
        }
      }
    }
    this.enemies=this.enemies.filter(e=>e.state!=='launched'||e.launched>0);
  }

  updateProjectiles(dt) {
    for(const shot of this.projectiles) {
      const prev={x:shot.x,y:shot.y}; shot.x+=shot.vx*dt; shot.y+=shot.vy*dt; shot.life-=dt;
      if(shot.hostile) {
        if(distance({x:this.player.x,y:this.player.y-13},shot)<13&&this.player.invulnerable<=0) { this.player.hp=Math.max(1,this.player.hp-2);this.player.invulnerable=.5;shot.life=0; }
        continue;
      }
      for(const e of this.enemies) if(e.hp>0&&distanceToSegment({x:e.x,y:e.y-10},prev,shot)<e.radius+5) { this.hitEnemy(e,shot.super?18000:1800,normalize(shot.vx,shot.vy),320); shot.life=0; break; }
      for(const o of this.activeObstacles) if(distanceToSegment({x:o.x,y:o.y-10},prev,shot)<o.radius) { this.breakObstacle(o);shot.life=0;break; }
    }
    this.projectiles=this.projectiles.filter(s=>s.life>0);
  }

  updateEffects(dt) {
    for(const e of this.effects) {
      e.life-=dt;
      if(e.type==='particle') {e.x+=e.vx*dt;e.y+=e.vy*dt;e.vy+=100*dt;}
      if(e.type==='text') e.y-=15*dt;
    }
    this.effects=this.effects.filter(e=>e.life>0);
  }

  updateFlight(dt,input) {
    const f=this.flight;
    f.time+=dt; f.angle+=input.x*dt*1.6;
    const target=input.y<0?(this.player.super?115:80):input.y>0?0:32;
    f.speed+=(target-f.speed)*Math.min(1,dt*2.5);
    f.x=(f.x+Math.cos(f.angle)*f.speed*dt+1024)%1024;
    f.y=(f.y+Math.sin(f.angle)*f.speed*dt+1024)%1024;
    f.distance+=f.speed*dt;
    if(input.pressed.has('home')) {f.x=POTOS_WORLD.x;f.y=POTOS_WORLD.y;f.speed=0;this.notify('BACK OVER POTOS','[F] to land. [1–3] choose your landing spot.');}
    for(let i=0;i<3;i++) if(input.pressed.has(`slot${i+1}`)) f.landing=i;
    if(f.distance>95) this.finishChapter('flight');
  }

  serialize() {
    return {version:SAVE_VERSION,map:this.map,player:{x:this.player.x,y:this.player.y,facing:this.player.facing,hp:this.player.hp,ki:this.player.ki,super:this.player.super},flags:{...this.flags},destroyed:[...this.destroyed],defeated:[...this.defeated],breaks:this.breaks,stats:{...this.stats}};
  }

  load(save) {
    if(!save||save.version!==SAVE_VERSION||!MAPS[save.map]||!save.player||!Number.isFinite(save.player.x)||!Number.isFinite(save.player.y)) return false;
    this.map=save.map;
    Object.assign(this.player,{x:save.player.x,y:save.player.y,facing:DIRECTIONS[save.player.facing]?save.player.facing:'down',hp:clamp(Number(save.player.hp)||9999,1,9999),ki:clamp(Number(save.player.ki)||0,0,100),super:!!save.player.super});
    for(const key of Object.keys(this.flags)) this.flags[key]=save.flags?.[key]===true;
    this.destroyed=new Set((Array.isArray(save.destroyed)?save.destroyed:[]).filter(id=>OBSTACLES.some(o=>o.id===id)));
    this.defeated=new Set((Array.isArray(save.defeated)?save.defeated:[]).filter(id=>id==='mantis'||RABITES.some(r=>r.id===id)));
    this.breaks=Array.isArray(save.breaks)?save.breaks.filter(b=>b&&typeof b.id==='string'&&typeof b.title==='string'&&typeof b.text==='string').slice(0,20):[];
    for(const key of Object.keys(this.stats)) if(Number.isFinite(save.stats?.[key])) this.stats[key]=clamp(save.stats[key],0,1e12);
    if(!this.walkable(this.player.x,this.player.y)) {this.map='potos';Object.assign(this.player,MAPS.potos.spawn);}
    this.populate(); return true;
  }
}
