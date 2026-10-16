/* Pose selection is independent of the renderer. Action clocks start at zero;
 * locomotion advances with distance travelled, never the wall clock. Native
 * airborne height remains the game's responsibility. */
class GokuAnimation {
  constructor(mod){this.mod=mod;this.reset();}
  reset(){this.state={frame:-1,map:-1,x:0,y:0,distance:0,kind:'idle',age:0,native:0,stationary:0,falling:false};}
  snapshot(){return {...this.state};}
  restore(saved){if(saved)this.state={...saved};}
  track(sheet,name,age,row){
    const data=window.GokuAnimationData.forms[sheet],clip=data.clips[name]||data.clips.idle;
    const frames=clip.frames,total=frames.reduce((sum,frame)=>sum+frame.ticks,0);
    let time=clip.loop?age%total:Math.min(age,total-1),frame=frames.at(-1);
    for(const candidate of frames){frame=candidate;if(time<candidate.ticks)break;time-=candidate.ticks;}
    return {...frame,sheet:frame.sheet||sheet,row:frame.row??row};
  }
  nativePose(entry,sheet,row,frame,age){
    const mapped=entry.phases?.find(phase=>phase.frames.includes(frame))?.source[sheet];
    if(mapped){const columns=mapped.columns;return{sheet,row:mapped.row==='side'?(this.mod.facing===1?2:1):mapped.row??row,column:columns[Math.min(columns.length-1,Math.floor(age/6))]};}
    if(entry.fixed){const columns=entry.fixed.columns[sheet];return{sheet,row:entry.fixed.row==='side'?(this.mod.facing===1?2:1):entry.fixed.row??row,column:columns[Math.min(columns.length-1,Math.floor(age/8))]};}
    if(['fall','sleep','dead'].includes(entry.clip))row=this.mod.facing===1?2:1;
    // The game owns invisible/disappear frames; this only chooses the cells
    // while its actor is present. Do not loop a vanish or a reaction forever.
    return this.track(sheet,entry.clip,age,row);
  }
  pose({flight=false,menu=false,displayed=null}={}){
    const m=this.mod,s=this.state,map=displayed?.map??m.read16(0xdc),x=displayed?.x??m.read16(0xe002),y=displayed?.y??m.read16(0xe004),native=displayed?.animation??m.read8(0xe011);
    const sheet=m.options.superSaiyan?'ssj':'goku',row=[0,2,1,3][m.facing];
    const lift=displayed?.lift??m.read8(0xe045),nativeFrame=displayed?.graphicFrame??m.read16(0xe026),status=displayed?.status1??m.read8(0xe190),status2=displayed?.status2??m.read8(0xe191);
    const action=m.action,reaction=m.hitRecovery?.reaction;
    const candidate=window.GokuNativeActions?.[(displayed?.latchedAnimation??native)&0x7f];
    const nativeAction=displayed&&candidate?.pointers.includes(displayed.sequence)?candidate:null;
    let kind='idle',distance=0,useNative=false;
    if(s.frame!==m.frame&&s.map===map)distance=Math.hypot(x-s.x,y-s.y);
    if(distance>12)distance=0; // doors/teleports do not race through walk frames
    if(s.frame!==m.frame)s.stationary=distance>0?0:(s.stationary||0)+1;
    if(flight)kind='flight';
    else if(menu)kind='idle';
    else if(m.ceiling?.pose)kind='ceilingEscape';
    else if(m.flightTransition)kind=m.flightTransition.kind;
    else if(status2&0x80)kind='dead';
    else if(status&0x10)kind='sleep';
    else if(status&0x40)kind='idle';
    else if(m.gapFlight?.active)kind='gapFlight';
    else if(reaction&&!action)kind=reaction.kind;
    else if(m.story?.status.lastEvent===0x10c&&m.read8(0xcf10)===6&&[131,260].includes(map)&&[0xa0,0xae,0xa2].includes(native))kind='rescueDive';
    else if((native===0x8c||native===0x8d)&&!(m.options.power&&action)){kind='hurt';useNative=!!nativeAction;}
    else if(action)kind=action.kind;
    else if(m.frieza?.approachingAltar&&(distance>0||s.stationary<3))kind='run';
    else if((m.localFlight||m.localLift>0)&&m.canAttack)kind='hover';
    else if(nativeAction){
      useNative=true;kind=nativeAction.key;
      if(['walk','run'].includes(nativeAction.clip)&&!nativeAction.phases&&!nativeAction.fixed)kind=distance>0||s.stationary<3?nativeAction.clip:nativeAction.key==='guardStep'?'guard':'idle';
    }
    else if(native===0xa0||native===0xae)kind='fall';
    else if(native===0x8f||native===0xa2)kind='recover';
    else if(native===0x88)kind='celebrate';
    else if(lift>0||native===0xa1)kind='jump';
    else if(native===0xad)kind='swordPull';
    else if(native===0xaf)kind='dead';
    else if(distance>0||((native===1||native===2)&&s.stationary<3))kind=native===2?'run':'walk';
    if(s.frame!==m.frame){
      if(kind!==s.kind||map!==s.map){s.age=0;if(kind==='walk'||kind==='run')s.distance=0;}
      else s.age++;
      s.distance+=distance;s.frame=m.frame;s.map=map;s.x=x;s.y=y;s.kind=kind;s.native=native;
    }
    let result,age=s.age,poseRow=menu?0:row;
    if(useNative&&nativeAction&&!['walk','run','idle','guard'].includes(kind))result=this.nativePose(nativeAction,sheet,poseRow,nativeFrame,age);
    else if(kind==='walk'||kind==='run'){
      // Six native pixels per footfall; a blocked walk settles to idle after
      // three stationary frames rather than skating through a running loop.
      result={sheet,row:poseRow,column:(kind==='run'?6:2)+Math.floor(s.distance/6)%4};
    }else if(kind==='focus'){
      // Held L is a composed fighting guard, in the direction he is facing.
      // Straining/flaring cells belong only to the actual form changes.
      result=this.track(sheet,'guard',0,poseRow);
    }
    else if(kind==='deflect')result=this.track(sheet,'guard',0,[0,2,1,3][reaction.facing]);
    else if(kind==='resist')result=this.track(sheet,'brace',0,poseRow);
    else if(kind==='ready')result=this.track(sheet,'chargeWindup',Math.min(action.age,5),poseRow);
    else if(kind==='punch'){
      const columns=action.super?(action.combo===2?14:10):[10,14,18][action.combo];
      const phase=action.super?(action.age<1?0:action.age<2?1:action.age<4?2:3):(action.age<2?0:action.age<4?1:action.age<7?2:3);
      result={sheet,row:[0,2,1,3][action.facing],column:columns+phase,
        phase:action.age<action.impact?'anticipation':action.age===action.impact?'contact':phase<3?'followThrough':'recover'};
    }else if(kind==='charge')result=this.track(sheet,'charge',action.age,poseRow);
    else if(kind==='beam')result={sheet,row:[0,2,1,3][action.facing],column:(action.super?18:22)+(action.age<2?1:action.age<action.duration-4?2:3)};
    else if(kind==='blast'){
      const phase=Math.floor(action.age/(action.super?1:2));
      result={sheet,row:[0,2,1,3][action.facing],column:(action.super?24:28)+(phase===0?0:phase>=4?3:1+(action.hand??0))};
    }
    else if(kind==='teleport'){
      // Reverse the original streak cells around a fully absent frame. The
      // native camera may hold age four until its tile uploads have finished.
      const t=action.age,streak=action.super?22:26;
      result={sheet,row:[0,2,1,3][action.facing],column:t<2||t>=9?(action.super?21:25):t===2||t===7||t===8?streak:streak+1,
        hidden:t>=4&&t<6,phase:t<2?'locate':t<4?'vanish':t<6?'absent':t<9?'appear':'settle'};
    }
    else if(kind==='transform'||kind==='revert'){
      const clip=window.GokuAnimationData.forms[sheet].clips[kind];
      const duration=clip.frames.reduce((sum,frame)=>sum+frame.ticks,0);
      result=this.track(sheet,kind,Math.floor(action.age*duration/action.duration),0);
    }else if(kind==='hover'||kind==='gapFlight'||kind==='rescueDive'){
      result=kind==='hover'&&(!m.localFlight||m.localLift<12||s.stationary>=3)?{sheet,row:poseRow,column:sheet==='ssj'?34:38}:this.track(sheet,'flight',age,poseRow);
      // The original crossing supplies horizontal travel and a jump arc.
      // Cancel only its visual arc for a steady twelve-pixel hover.
      if(kind==='gapFlight')result.extraLift=12-lift;
    }
    else if(kind==='ceilingEscape'){
      const age=m.ceiling.pose.age;
      result=age<18?{sheet,row:3,column:(sheet==='ssj'?14:18)+Math.min(3,Math.floor(age/5))}:{sheet,row:3,column:sheet==='ssj'?34:38};
      result.extraLift=age<18?Math.floor(age/3):Math.min(220,(age-18)*6+6);
    }
    else if(kind==='takeoff'||kind==='landing'){
      const t=m.flightTransition.age,knee=sheet==='ssj'?34:38,crouch=knee-1;
      // Keep the torso upright, one knee tucked and the other boot down.
      // A quadratic descent brakes before touchdown, then the knees absorb
      // the landing. Prone cruise cells are only for forward aerial travel.
      result={sheet,row:kind==='takeoff'?3:poseRow,column:kind==='takeoff'?t<4?crouch:knee:t<24?knee:t<29?crouch:0};
      result.extraLift=kind==='takeoff'?Math.min(160,Math.round(Math.max(0,t-4)**2*.22)):Math.ceil(72*Math.max(0,1-t/24)**2)-lift;
    }else if(kind==='flight'){
      // The Mode 7 camera looks along Goku's direction of travel. Banking uses
      // only the verified four-way art in both forms; never unrelated cells.
      const visibleSheet=action?.kind==='transform'&&action.age<Math.ceil(action.duration*14/40)?'goku':action?.kind==='revert'&&action.age<8?'ssj':sheet;
      result=this.track(visibleSheet,'flight',age,3);
      if(m.charging)result=this.track(visibleSheet,'charge',age,3);
      else if(action?.kind==='airBeam')result={sheet:visibleSheet,row:3,column:visibleSheet==='ssj'?20:24};
      const turn=(m.input&0x40)?-1:(m.input&0x80)?1:0;
      result.bank=turn;result.bob=Math.floor(age/8)%4===1?-1:Math.floor(age/8)%4===3?1:0;
    }else if(kind==='fall'){
      // A0/AE are a long airborne flail, not the source's knockdown-to-prone
      // strip. Follow the native pose changes and let the game move the body.
      result={sheet,row:poseRow,column:(sheet==='ssj'?34:38)+([62,66].includes(nativeFrame)?1:0)};
    }else if(kind==='recover'){
      // A2 falls, bounces, rests and gets up; 8F starts at the resting phase.
      // These native frame IDs are shared by all four entry directions. Their
      // timing is owned by the original script, including pauses and jumps.
      const side=m.facing===1?2:1,base=sheet==='ssj'?40:48;
      if(nativeFrame>=276&&nativeFrame<=282||nativeFrame===58)result={sheet,row:poseRow,column:sheet==='ssj'?29:33};
      else if(nativeFrame===110||nativeFrame===112)result={sheet,row:side,column:base+(nativeFrame===110?2:3)};
      else if(nativeFrame===274)result={sheet,row:side,column:base+2};
      else if(nativeFrame===134||nativeFrame===132)result={sheet,row:side,column:base+1};
      else if(nativeFrame===130)result={sheet,row:side,column:base};
      else result=this.track(sheet,'hurt',0,poseRow);
    }else if(kind==='dead'||kind==='sleep'){
      // These strips only exist in the physical left/right rows. The front
      // row at the same columns contains unrelated transformation artwork.
      result=this.track(sheet,kind,age,m.facing===1?2:1);
    }else if(kind==='jump')result=this.track(sheet,'jump',age,poseRow);
    else if(kind==='hurt')result=lift>0?{sheet,row:poseRow,column:sheet==='ssj'?29:33}:this.track(sheet,'hurt',age,poseRow);
    else if(kind==='idle'&&poseRow!==3&&age%180>=150&&age%180<155)result=this.track(sheet,'blink',0,poseRow);
    else result=this.track(sheet,kind,age,poseRow);
    // The source's side-on impact/rest cells actually lose their gold hair.
    // Keep SSJ in a low, gold-haired brace instead of showing a false revert.
    if(result.sheet==='ssj'&&[1,2].includes(result.row)&&[42,43].includes(result.column))result.column=33;
    if(result.row===3&&result.column===1)result.column=0;
    const cell=window.GokuAnimationData.forms[result.sheet].cells[result.column*4+result.row];
    if(!cell?.opaque)throw Error(`Empty Goku animation cell: ${kind} ${result.sheet} ${result.column},${result.row}`);
    // Keep the cupped hands while the original four-step legs walk underneath.
    // Lower-leg pixels are assembled in the OBJ layer at the same fixed pivot.
    if((kind==='charge'||kind==='ready')&&!m.localFlight&&(distance>0||s.stationary<3))result.legs=2+Math.floor(s.distance/6)%4;
    if(!flight&&!menu&&m.localLift)result.extraLift=(result.extraLift||0)+Math.round(m.localLift);
    return {...result,kind,age,lift:flight||menu?0:lift,origin:flight?[16,16]:[16,31],bounds:cell.bounds};
  }
}
window.GokuAnimation=GokuAnimation;
