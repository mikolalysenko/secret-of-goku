// All orbital scenery uses the same saved camera. Depth is an eighths-of-a-
// layer factor: stars scroll/zoom least, distant bodies next, the globe most.
// Only the final projection rounds; no layer keeps a separate animation clock.
export function projectOrbitBackground(camera,point,depth=2){
 const scale=1+(camera.r-104)*depth/832;
 const x=128+(point.x-128)*scale+((camera.x-95)-(camera.travelX??0)*164/1024)*depth/8;
 const y=112+(point.y-112)*scale+((camera.y-154)-(camera.travelY??0)*82/1024)*depth/8;
 return{x:Math.round(x),y:Math.round(y),r:Math.max(1,Math.round((point.r??1)*scale))};
}
export function wrapOrbitBackground(point,copy){
 // Wrap only beyond the picture, with enough margin for a whole body. A
 // collateral shot keeps its chosen copy until the impact has faded.
 copy??={x:Math.floor((point.x+32)/320),y:Math.floor((point.y+32)/288)};
 return{...point,x:point.x-copy.x*320,y:point.y-copy.y*288,copy};
}
