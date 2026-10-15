// Broken floor is a persistent set of whole native map cells. Drawing and
// walking collision share this set; flight can cross it. Source map/event
// buffers stay untouched, so leaving the arena cannot corrupt another room.
export function newFriezaArena(){return{revision:0,scars:[],bursts:[],holes:[]};}
const holeCache=new WeakMap();
export function arenaHoles(arena){
 if(!arena.holes){
  const cells=new Set();
  for(const s of arena.scars??[])for(const cell of s.tiles)if(Math.hypot((cell%256)*16+8-s.x,(Math.floor(cell/256)*16+8-s.y)*1.5)<s.radius)cells.add(cell);
  arena.holes=[...cells];
 }
 let cache=holeCache.get(arena);
 if(!cache||cache.revision!==arena.revision){cache={revision:arena.revision,cells:new Set(arena.holes)};holeCache.set(arena,cache);}
 return cache.cells;
}
export const floorHole=(arena,x,y)=>arenaHoles(arena).has(Math.floor(y/16)*256+Math.floor(x/16));
export function fractureFortress(arena,x,y,radius,canLand){
  const tiles=[],holes=new Set(arenaHoles(arena));
  for(let ty=Math.floor((y-radius)/16);ty<=Math.floor((y+radius)/16);ty++)
    for(let tx=Math.floor((x-radius)/16);tx<=Math.floor((x+radius)/16);tx++){
      const px=tx*16+8,py=ty*16+8,key=ty*256+tx;
      if(Math.hypot(px-x,(py-y)*1.5)<=radius&&(holes.has(key)||canLand(px,py))){tiles.push(key);holes.add(key);}
    }
  arena.holes=[...holes];
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
  const pixels=new Uint8Array(256*224),holes=arenaHoles(arena);
  const inside=(x,y)=>holes.has(Math.floor(y/16)*256+Math.floor(x/16));
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){
    const wx=x+cameraX,wy=y+cameraY;if(!inside(wx,wy))continue;
    // Outline the UNION, never each blast. Shared edges disappear when two
    // holes meet. A chipped highlight sits above the dark exposed wall.
    let edge=6;
    for(let n=1;n<6;n++)if(!inside(wx-n,wy)||!inside(wx+n,wy)||!inside(wx,wy-n)||!inside(wx,wy+n)){edge=n;break;}
    const chip=((wx*13+wy*7)&7)===0?1:0;
    pixels[y*256+x]=edge<=1+chip?3:edge<=4?2:1;
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
