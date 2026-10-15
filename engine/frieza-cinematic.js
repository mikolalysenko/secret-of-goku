// Each shot has an establishment, a warning, a single impact and an aftermath.
// The viewer sees the ordinary place FIRST. Time is deterministic/saveable.
export const collateralShots=[
 {name:'POTOS',map:131,x:256,y:240,duration:300,hit:160,blast:[140,96],radius:48,people:[[[46,164],[46,194],[86,204],[112,220],[112,248]],[[202,181],[270,181]],[[86,203],[112,220],[112,248]]],text:'VILLAGER:The sky...\nEveryone! Away from the house!'},
 {name:'PANDORA',map:144,x:328,y:440,duration:300,hit:160,blast:[143,156],radius:54,people:[[[40,118],[220,118],[236,128],[236,242]],[[180,116],[220,116],[236,128],[236,242]],[[103,119],[220,119],[236,128],[236,242]]],text:'GUARD:Get inside!\nNo--not THAT building!'},
 {name:'NORTHTOWN',map:115,x:464,y:288,duration:300,hit:160,blast:[83,83],radius:62,people:[[[42,211],[102,211],[172,211],[172,244]],[[184,184],[184,244]],[[216,174],[252,174],[274,174]]],text:'LUKA:These are CITIES!\nGoku! Take this fight AWAY!'},
 {name:'SOUTH OF POTOS',map:129,x:176,y:472,duration:260,hit:150,blast:[125,136],radius:27,rabite:true,people:[],text:'KING KAI:Even the wildlife!\nUP! Get off the surface!'},
];
export const collateralStart=72;
export const pullbackStart=collateralStart+collateralShots.reduce((n,s)=>n+s.duration,0);
export const cosmicDuration=pullbackStart+240;
export function collateralBeat(age){let t=age-collateralStart;for(let i=0;i<collateralShots.length;i++){const shot=collateralShots[i];if(t<shot.duration)return t>=0?{shot,index:i,age:t}:null;t-=shot.duration;}return null;}
// Authored street routes, in the shot's map coordinates. Unlike an arbitrary
// escape vector, these cannot carry a pedestrian through the featured house.
export function civilianPose(route,age,index=0){
 let distance=Math.max(0,age-112-index*6)*1.25;
 for(let i=1;i<route.length;i++){
  const [x,y]=route[i-1],[xx,yy]=route[i],dx=xx-x,dy=yy-y,n=Math.hypot(dx,dy);
  if(distance<=n||i===route.length-1){const t=Math.min(1,distance/(n||1));return{x:Math.round(x+dx*t),y:Math.round(y+dy*t),direction:Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down',walking:age>112+index*6};}
  distance-=n;
 }
}
export const orbitIntroFrames=240;
export const orbitIntroLines=[
 'GOKU:Away from everyone.\nNow we can stop\nholding back!',
 'FRIEZA:You think distance\nwill save your little world?\nWatch closely.',
];
