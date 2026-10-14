// Project-authored 48px Saiyan capsule. Three discrete, 15-color frames enter
// the native PPU at 1:1 resolution, including the fold-down hatch/ramp.
const rgb=(r,g,b)=>1+(r>>3)+((g>>3)<<5)+((b>>3)<<10);
const palette=[0,...[
  [24,24,32],[72,80,96],[120,136,152],[176,192,200],
  [224,232,224],[248,248,232],[96,56,32],[176,112,48],
  [240,192,104],[248,224,152],[72,16,32],[160,32,48],
  [232,64,72],[248,144,136],[56,48,72],
].map(c=>rgb(...c))];
const width=48,height=48;

function makeFrame(open,grounded=true){
  const pixels=new Uint16Array(width*height);
  const dot=(x,y,c)=>{if(x>=0&&x<width&&y>=0&&y<height)pixels[y*width+x]=palette[c];};
  // Hand-sized pixels and stepped shading, never antialiasing or gradients.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(grounded&&((x-24)/18)**2+((y-42)/3)**2<=1)dot(x,y,1);
    const dx=x-23.5,dy=y-22,edge=(dx/20)**2+(dy/21)**2;
    if(edge>1)continue;
    let c=edge>.91?1:dx+dy>22?2:dx+dy>11?3:dx+dy>-2?4:dx+dy>-19?5:6;
    // Recessed shell seams and two small side vents.
    if(y>7&&y<36&&Math.abs(dx)>14&&Math.abs(dx)<16)c=3;
    if(y>=19&&y<=28&&[6,7,39,40].includes(x))c=y%3===1?4:1;
    dot(x,y,c);
    const door=((x-24)/13)**2+((y-25)/16)**2;
    if(door>1)continue;
    dot(x,y,door>.86?1:door>.68?(x<24?9:7):15);
    if(door<.62){
      // Empty, padded pilot seat becomes visible behind the opening hatch.
      if(y>26&&x>16&&x<31)dot(x,y,y===30||y===35?1:2);
      if(y===35&&x>18&&x<29)dot(x,y,3);
    }
  }
  // Same door pixels in each frame; just the three authored hinge positions.
  const doorHeight=[31,20,9][open],doorTop=[10,27,38][open];
  for(let y=0;y<doorHeight;y++)for(let x=0;x<27;x++){
    const sx=x-13,sy=(y+.5)*32/doorHeight-16;
    const edge=(sx/13)**2+(sy/16)**2;if(edge>1)continue;
    let c=edge>.88?1:edge>.68?(sx<0?10:8):sy>6?4:5;
    const glass=(sx/9.5)**2+((sy+3)/10.5)**2;
    if(glass<1)c=glass>.8?11:sx+sy>3?12:13;
    if(glass<.7&&sx<-3&&sy<-4)c=14;
    if(sy>7&&Math.abs(sx)<5)c=sy>11?2:3;
    dot(11+x,doorTop+y,c);
  }
  return Object.freeze({width,height,pixels,open});
}

export const saiyanPodFrames=Object.freeze([0,1,2].map(open=>makeFrame(open)));
const airbornePod=makeFrame(0,false);

export function drawSaiyanPod(layer,x,y,open=0,airborne=false){
  const frame=airborne?airbornePod:saiyanPodFrames[open];
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const color=frame.pixels[py*width+px];if(color)layer.pixel(x+px,y+py,color,true);
  }
  layer.plan.pod={x,y,width,height,open,airborne};
}
