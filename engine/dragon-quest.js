export const dragonBallPalaces=['Water','Earth','Wind','Fire','Light','Dark','Moon'];
// Only real collection writes count. Breaking a seal (2), theft (14/15),
// Tree magic and map preparation must not invent or remove collected balls.
export function dragonBallGrant(at,op){
  if(op!==0x30)return null;
  const sources=new Map([[0x98f6f,0],[0xa7276,0],[0xa72dc,1],[0xa73ee,1],[0xa72b8,2],[0xa7297,3],[0xa72fd,4],[0xa731e,5],[0xa733f,6]]);
  return sources.get(at)??null;
}
export function createDragonQuest(mod){
  let mask=0,delivered=0,wished=false;
  const count=()=>Array.from({length:7},(_,i)=>mask>>i&1).reduce((a,b)=>a+b,0);
  return{
    collect(index){if(index<0||index>6||mask&(1<<index))return false;mask|=1<<index;mod.radio?.say(`DRAGON BALLS: ${count()} / 7\n${dragonBallPalaces[index]} Ball in the pouch.\nGOKU:Definitely not food.`,{kind:'quest'});return true;},
    deliver(){delivered=7-count();mask=127;return delivered;},
    wish(){if(mask===127){wished=true;mod.ceiling?.repair();}},
    get status(){return{mask,count:count(),delivered,wished,missing:dragonBallPalaces.filter((_,i)=>!(mask>>i&1))};},
    snapshot(){return{mask,delivered,wished};},
    restore(s){mask=s?.mask??dragonBallPalaces.reduce((bits,_,i)=>bits|(mod.read8(0xcf90+i)===1?1<<i:0),0);delivered=s?.delivered??0;wished=!!s?.wished;},
  };
}
