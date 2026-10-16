import {endingResult} from './ending-rules.js';
export const dragonBallPalaces=['Water','Earth','Wind','Fire','Light','Dark','Moon'];
// Only real collection writes count. Breaking a seal (2), theft (14/15),
// Tree magic and map preparation must not invent or remove collected balls.
export function dragonBallGrant(at,op){
  if(op!==0x30)return null;
  const sources=new Map([[0x98f6f,0],[0xa7276,0],[0xa72dc,1],[0xa73ee,1],[0xa72b8,2],[0xa7297,3],[0xa72fd,4],[0xa731e,5],[0xa733f,6]]);
  return sources.get(at)??null;
}
export function createDragonQuest(mod){
  let mask=0,seedMask=0,delivered=0,wished=false;
  const popcount=n=>{let bits=0;for(let i=0;i<7;i++)bits+=n>>i&1;return bits;};
  const count=()=>popcount(mask);
  return{
    collect(index){if(index<0||index>6||seedMask&(1<<index))return false;seedMask|=1<<index;if(mask&(1<<index))delivered=Math.max(0,delivered-1);mask|=1<<index;mod.radio?.say(`DRAGON BALLS: ${count()} / 7\n${dragonBallPalaces[index]} Ball found.\nOne step closer to the wish.`,{kind:'quest'});return true;},
    recover(){mask|=seedMask;}, // Frieza cannot award Balls the player never collected.
    wish(){if(mask===127&&seedMask===127&&endingResult(mod).outcome==='good'){wished=true;mod.ceiling?.repair();mod.worldScars?.restore();}},
    get status(){return{mask,count:count(),held:popcount(mask&~(mod.frieza?.unresolved?(mod.frieza.stolenMask??mask):0)),stolen:!!mod.frieza?.unresolved,eighth:!!mod.frieza?.eighth,seedMask,seedCount:popcount(seedMask),canFeed:seedMask===127,earned:popcount(seedMask),delivered,wished,missing:dragonBallPalaces.filter((_,i)=>!(mask>>i&1))};},
    snapshot(){return{mask,seedMask,delivered,wished};},
    restore(s){mask=s?.mask??dragonBallPalaces.reduce((bits,_,i)=>bits|(mod.read8(0xcf90+i)===1?1<<i:0),0);delivered=s?.delivered??0;seedMask=s?.seedMask??(delivered?dragonBallPalaces.reduce((bits,_,i)=>bits|(mod.read8(0xcf90+i)===1?1<<i:0),0):mask);wished=!!s?.wished;},
  };
}
