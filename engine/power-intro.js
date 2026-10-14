export const powerIntroMessages={
  flight:[
    'GOKU:The ghost said walk.\nKING KAI:Your feet are\nsix feet off the ground!',
    'GOKU:I am walking on air.\nKING KAI:THAT IS NOT\nA LEGAL LOOPHOLE.',
  ],
  super:[
    'GOKU:I feel something HUGE\nup there. Better warm up.\n...HAAAAAAAA!',
    'KING KAI:Your hair is gold.\nGOKU:My serious hair.\nKAI:TRY A SERIOUS PLAN.',
    'SUPER SAIYAN\nFaster attacks and charging.\nPoison cancels the form.',
  ],
};
export function createPowerIntro(mod){
  let flight=false,superShown=false;
  const say=kind=>{for(const text of powerIntroMessages[kind])mod.radio?.say(text,{frames:185,kind:'power-intro'});};
  return{
    transform(){
      if(superShown||!mod.options.superSaiyan)return;
      superShown=true;say('super');
      // The first reveal lingers in the existing gold transformation pose.
      if(mod.action?.kind==='transform'){mod.action.duration=72;mod.action.reveal=true;}
    },
    tick(){
      if(!flight&&mod.options.enabled&&mod.gokuActive&&mod.canAttack&&mod.localFlight){flight=true;say('flight');mod.feedback?.pulse(8);}
    },
    draw(layer){
      const a=mod.action;if(!a?.reveal||a.age>60||!mod.canAttack)return;
      const s=mod.status;
      for(let i=0;i<8;i++){
        const angle=i*Math.PI/4+a.age/25,radius=14+a.age*.6;
        layer.stamp(i&1?'gold-spark':'lightning',a.age/3|0,Math.round(s.screenX+Math.cos(angle)*radius),Math.round(s.screenY-16+Math.sin(angle)*radius));
      }
    },
    snapshot(){return{flight,superShown};},
    restore(s){flight=!!s?.flight;superShown=!!s?.superShown;},
  };
}
