// Factual gate rectangles come from the original map-piece placements and
// tile triggers. Progress is applied by native events and the map rebuild;
// no collision holes are drawn into walls or persisted as arbitrary tiles.
export const kiBarriers=[
  {id:'witch-castle',map:300,rect:[128,240,48,80],flag:0x17,min:2,event:0x8c},
  {id:'northtown-castle',map:82,rect:[304,528,32,32],flag:0x34,min:4,event:0x8d},
  {id:'gold-tower',map:116,rect:[240,392,32,24],flag:0x37,min:1,event:0x8e},
];
export function beamTouchesBarrier(beam,barrier){
  if((beam.strength??0)<.85)return false;
  const[x,y,w,h]=barrier.rect,cx=x+w/2,cy=y+h/2,ox=cx-beam.x,oy=cy-beam.y;
  const along=ox*beam.dx+oy*beam.dy,across=Math.abs(ox*beam.dy-oy*beam.dx);
  const forward=Math.abs(beam.dx)*w/2+Math.abs(beam.dy)*h/2,side=Math.abs(beam.dy)*w/2+Math.abs(beam.dx)*h/2;
  return along>=0&&along<=Math.min(192,beam.length)+forward&&across<=beam.width+side;
}
export function createNativeBarriers(mod){
  let pending=null,completed=[];
  return{
    beam(beam){
      if(pending||!mod.canAttack)return;
      const map=mod.read16(0xdc),barrier=kiBarriers.find(b=>b.map===map&&mod.read8(0xcf00+b.flag)<b.min&&beamTouchesBarrier(beam,b));
      if(!barrier)return;
      pending={id:barrier.id,map,event:barrier.event,frame:mod.frame};mod.playSound('hit');mod.feedback?.pulse(12);
      const[x,y,w,h]=barrier.rect;for(let i=0;i<6;i++)mod.effects.push({kind:'impact',x:x+(i%3+.5)*w/3,y:y+(Math.floor(i/3)+.5)*h/2,dx:1,dy:0,life:20,max:20,super:false});
    },
    tick(){
      if(!pending)return;
      const barrier=kiBarriers.find(b=>b.id===pending.id);
      if(!barrier||mod.read8(0xcf00+barrier.flag)>=barrier.min){pending=null;return;}
      if(pending.map!==mod.read16(0xdc)){pending=null;return;}
      if(mod.frame-pending.frame>=26&&mod.story.request(pending.event)){completed.push(pending.id);pending=null;}
    },
    get status(){return{pending,completed:[...completed]};},
    snapshot(){return structuredClone({pending,completed});},
    restore(s){pending=s?.pending??null;completed=s?.completed?.slice()||[];},
  };
}
