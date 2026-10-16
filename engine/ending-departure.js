// Leave the village in view while Goku gathers ki and lifts off. The cloud
// whiteout bridges to the distant planet, then a quiet fade reaches Kai.
export const departureTiming={charge:12,launch:56,cloud:114,space:144,clear:174,fade:266,end:300};
const clamp=x=>Math.max(0,Math.min(1,x));
export function departurePose(age,origin={x:128,y:144}){
 const t=Math.max(0,age-departureTiming.launch);
 return{x:Math.round(origin.x),y:Math.round(origin.y-t*t*.055),
  column:age<departureTiming.charge?0:age<departureTiming.launch?54:38,
  row:age<departureTiming.launch?0:3,
  white:clamp((age-departureTiming.cloud)/(departureTiming.space-departureTiming.cloud))};
}
export function departureOrbit(age){
 const t=Math.max(0,age-departureTiming.space),u=clamp(t/106);
 return{x:Math.round(124+148*u*u),y:Math.round(154-198*u*u),
  white:clamp((departureTiming.clear-age)/(departureTiming.clear-departureTiming.space)),
  black:clamp((age-departureTiming.fade)/(departureTiming.end-departureTiming.fade))};
}
