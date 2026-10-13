// Deterministic charge bolts. Endpoints follow the loaded map's actual solid
// tiles / low objects and nearby actors. Rendering uses Thunderbolt's palette
// and original spell cells at native pixel resolution.
export function createChargeLightning(mod){
  return function arcs(origin){
    const phase=Math.floor(mod.frame/3),seed=phase+mod.read16(0xdc)*71;
    const noise=n=>{let v=Math.imul(n^seed,0x45d9f3b);v=Math.imul(v^(v>>>16),0x45d9f3b);return(v^(v>>>16))>>>0;};
    const hash=(n,range)=>noise(n)%range,anchors=[];
    const tileAt=mod.localFlightHook?.tileAt;
    if(tileAt&&!mod.worldFlight)for(let ty=-4;ty<=4;ty++)for(let tx=-4;tx<=4;tx++){
      const tile=tileAt(origin.x+tx*16,origin.y+ty*16);
      if(!tile||(!(tile.flags&1)&&!mod.localFlightHook.lowObstacle(tile)))continue;
      const left=tile.tx*16,top=tile.ty*16;
      const x=Math.max(left,Math.min(left+15,origin.x)),y=Math.max(top,Math.min(top+15,origin.y));
      const distance=Math.hypot(x-origin.x,y-origin.y);
      if(distance<18||distance>56)continue;
      // First surface along the ray, not a point behind a nearer wall.
      let hidden=false;
      for(let d=8;d<distance-8;d+=8){const t=tileAt(origin.x+(x-origin.x)*d/distance,origin.y+(y-origin.y)*d/distance);if(t&&((t.flags&1)||mod.localFlightHook.lowObstacle(t))){hidden=true;break;}}
      if(!hidden)anchors.push({x,y,kind:'surface',tx:tile.tx,ty:tile.ty});
    }
    for(const actor of mod.worldFlight?[]:mod.entities())if(actor.index>=3&&actor.active){
      const distance=Math.hypot(actor.x-origin.x,actor.y-12-origin.y);
      if(distance>=18&&distance<=56)anchors.push({x:actor.x,y:actor.y-12,kind:'actor',index:actor.index});
    }
    const result=[],count=mod.charge>=45?3:2;
    for(let i=0;i<count;i++){
      const angle=(hash(i*11+1,64)/32)*Math.PI;
      const from={x:Math.round(origin.x+Math.cos(angle)*8),y:Math.round(origin.y+Math.sin(angle)*10)};
      const target=i===count-1&&anchors.length?anchors[hash(71,anchors.length)]:{
        x:Math.round(origin.x+Math.cos(angle+.7)*(21+hash(i*11+2,13))),
        y:Math.round(origin.y+Math.sin(angle+.7)*(21+hash(i*11+3,13))),kind:'air',
      };
      const dx=target.x-from.x,dy=target.y-from.y,length=Math.hypot(dx,dy)||1,steps=Math.max(2,Math.ceil(length/7));
      const points=[from];
      for(let n=1;n<steps;n++){
        const jag=hash(i*101+n,9)-4;
        points.push({x:Math.round(from.x+dx*n/steps-dy/length*jag),y:Math.round(from.y+dy*n/steps+dx/length*jag)});
      }
      points.push({x:target.x,y:target.y});result.push({points,target,phase:phase+i});
    }
    return result;
  };
}
