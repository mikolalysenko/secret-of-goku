// Deterministic Voronoi fractures of the actual world picture. Each fragment
// owns an irregular pixel mask, so its silhouette survives rotation instead
// of exposing the square cells of the source texture.
export function fracturePlanet(globe,width=256,height=224){
  let seed=0x6a09e667;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  const pieces=[];
  for(let tries=0;pieces.length<64&&tries<10000;tries++){
    const x=15+random()*145,y=67+random()*147;
    if(!globe[Math.floor(y)*width+Math.floor(x)]||pieces.some(p=>Math.hypot(x-p.x,y-p.y)<10))continue;
    pieces.push({x,y,pixels:[],speed:.32+random()*.7,spin:(random()-.5)*.055,tilt:random()*Math.PI*2});
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const color=globe[y*width+x];if(!color)continue;
    let best=Infinity,owner=null;
    for(const p of pieces){const d=(x-p.x)**2+(y-p.y)**2;if(d<best){best=d;owner=p;}}
    if(owner)owner.pixels.push({x,y,color});
  }
  for(const p of pieces){
    // Rotate about the mass centre, with a separate random drift for chunks
    // at the core. Earth-shaped texture remains attached to every shard.
    p.x=p.pixels.reduce((sum,v)=>sum+v.x,0)/p.pixels.length;
    p.y=p.pixels.reduce((sum,v)=>sum+v.y,0)/p.pixels.length;
    const a=Math.atan2(p.y-140,p.x-87);p.dx=Math.cos(a);p.dy=Math.sin(a);
    const mask=new Set(p.pixels.map(v=>v.y*width+v.x));
    for(const v of p.pixels)v.edge=[-1,1,-width,width].some(d=>!mask.has(v.y*width+v.x+d));
    p.left=Math.min(...p.pixels.map(v=>v.x));p.top=Math.min(...p.pixels.map(v=>v.y));
    p.width=1+Math.max(...p.pixels.map(v=>v.x))-p.left;p.height=1+Math.max(...p.pixels.map(v=>v.y))-p.top;
    p.colors=new Uint16Array(p.width*p.height);p.edges=new Uint8Array(p.colors.length);
    for(const v of p.pixels){const i=(v.y-p.top)*p.width+v.x-p.left;p.colors[i]=v.color;p.edges[i]=Number(v.edge);}
  }
  return pieces;
}

export function fragmentPose(piece,age){
  const distance=age*piece.speed+age*age*.003,angle=age*piece.spin;
  return{x:piece.x+piece.dx*distance,y:piece.y+piece.dy*distance,
    cos:Math.cos(angle),sin:Math.sin(angle),squash:.7+.3*Math.cos(age*.025+piece.tilt),
    fade:Math.max(0,Math.min(1,(115-age)/65)),heat:Math.max(0,1-age/48)};
}
