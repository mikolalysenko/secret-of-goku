// Battle damage is drawn on the native floor only. Collision, map tiles,
// doors, BG2 boss graphics and the event interpreter are never rewritten.
export function newFriezaArena(){return{revision:0,scars:[],bursts:[]};}
export function fractureFortress(arena,x,y,radius,canLand){
  const tiles=[];
  for(let ty=Math.floor((y-radius-30)/16);ty<=Math.floor((y+radius+30)/16);ty++)
    for(let tx=Math.floor((x-radius-30)/16);tx<=Math.floor((x+radius+30)/16);tx++)
      if(canLand(tx*16+8,ty*16+8))tiles.push(ty*256+tx);
  const seed=++arena.revision,scar={x,y,radius,seed,tiles};
  arena.scars.push(scar);if(arena.scars.length>20)arena.scars.shift();
  arena.bursts.push({x,y,age:0,radius,seed});if(arena.bursts.length>12)arena.bursts.shift();
  return scar;
}
export function tickFriezaArena(arena){
  for(const b of arena.bursts)b.age++;
  arena.bursts=arena.bursts.filter(b=>b.age<64);
}
export function ruinMask(arena,cameraX,cameraY){
  const pixels=new Uint8Array(256*224);
  for(const s of arena.scars){
    const tiles=new Set(s.tiles),cx=s.x-cameraX,cy=s.y-cameraY,r=s.radius;
    for(let y=Math.max(0,Math.floor(cy-r-29));y<Math.min(224,cy+r+29);y++)
      for(let x=Math.max(0,Math.floor(cx-r-29));x<Math.min(256,cx+r+29);x++){
        if(!tiles.has(Math.floor((y+cameraY)/16)*256+Math.floor((x+cameraX)/16)))continue;
        const dx=x-cx,dy=(y-cy)*1.5,d=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
        const sector=Math.floor((angle+Math.PI)*12/Math.PI),noise=(Math.imul(sector+s.seed*19,1103515245)>>>16)&255;
        const edge=r*(.79+noise*.0008);
        let value=0;
        if(d<edge)value=d<edge-5?1:d<edge-2?2:3;
        else if(d<edge+28&&Math.abs(Math.sin(angle*3+s.seed*.37))*d<1.3)value=2;
        if(value)pixels[y*256+x]=value;
      }
  }
  return pixels;
}
export function drawFriezaDebris(arena,layer,cameraX,cameraY){
  const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10),colors=[rgb(4,8,9),rgb(10,17,16),rgb(22,23,16)];
  for(const b of arena.bursts){
    const t=b.age;
    for(let i=0;i<14;i++){
      const a=i*2.39996+b.seed,speed=.5+(i%5)*.35;
      const x=b.x-cameraX+Math.cos(a)*t*speed,y=b.y-cameraY+Math.sin(a)*t*.4-t*(2.7+i%3*.4)+t*t*.065;
      if(t>44&&i%3===0)continue;
      const size=i%4===0?4:2,turn=(t>>3)+i;
      for(let dy=-size;dy<=size;dy++)for(let dx=-size;dx<=size;dx++){
        if(Math.abs(dx)+Math.abs(dy)>size+1)continue;
        layer.pixel(x+dx,y+dy,colors[dy===-size||dx===-size?2:(dx+dy+turn)%3===0?1:0],true);
      }
      if(t<36&&i%3===0)layer.stamp('impact-spark',t>>2,x,y);
    }
    if(t<22)for(let i=0;i<52;i++){
      const a=i*Math.PI/26,r=4+t*1.7;
      layer.pixel(b.x-cameraX+Math.cos(a)*r,b.y-cameraY+Math.sin(a)*r*.45,rgb(22,16,26),true);
    }
    if(t>10&&t<55)for(let i=0;i<5;i++)layer.stamp('impact-spark',(t>>3)+i,b.x-cameraX+(i-2)*(6+t*.2),b.y-cameraY-t*.3);
  }
}
