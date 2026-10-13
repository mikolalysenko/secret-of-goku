// W3C standard layout, independent of the labels printed on the controller.
// Fresh snapshots are polled every animation frame, including while paused.
const bindings=new Map([[0,0],[1,1],[2,17],[3,16],[4,8],[5,18],[6,19],[8,2],[9,3],[12,4],[13,5],[14,6],[15,7]]);
const pressed=(pad,index)=>!!pad.buttons[index]?.pressed||(pad.buttons[index]?.value??0)>.5;
export class GamepadInput{
 constructor(input,{fly=()=>{},pause=()=>{},start=()=>{},disconnect=()=>{},status=()=>{}}={}){
  this.input=input;this.actions={fly,pause,start,disconnect,status};this.pads=new Map();this.label='';
 }
 suspend(){for(const state of this.pads.values())state.blocked=true;this.input.releasePrefix('gamepad:');}
 poll(pads,{enabled=true,focused=true}={}){
  const seen=new Set(),names=[];
  for(const pad of pads||[]){
   if(!pad||pad.connected===false)continue;
   if(pad.mapping!=='standard'){names.push('Controller needs a standard browser mapping');continue;}
   const id=pad.index,prefix=`gamepad:${id}:`;seen.add(id);names.push('Controller connected');
   let state=this.pads.get(id);
   if(!state){state={blocked:false,previous:new Set(),axes:[0,0],id:pad.id};this.pads.set(id,state);}
   if(state.id!==pad.id){this.input.releasePrefix(prefix);state.blocked=true;state.id=pad.id;}
   const down=new Set();for(let i=0;i<pad.buttons.length;i++)if(pressed(pad,i))down.add(i);
   // Hysteresis keeps slight stick drift from repeatedly changing direction.
   const axes=[0,1].map(i=>{const v=pad.axes[i]||0,threshold=state.axes[i]===Math.sign(v)?.2:.3;return Math.abs(v)>threshold?Math.sign(v):0;});
   if(!focused||!enabled)state.blocked=true;
   if(state.blocked){
    this.input.releasePrefix(prefix);state.previous=down;state.axes=axes;
    if(focused&&enabled&&down.size===0&&axes.every(v=>v===0))state.blocked=false;
    continue;
   }
   const wanted=new Map();
   for(const [button,bit]of bindings)if(down.has(button))wanted.set(prefix+'button:'+button,bit);
   if(axes[0])wanted.set(prefix+'axis:0',axes[0]<0?6:7);
   if(axes[1])wanted.set(prefix+'axis:1',axes[1]<0?4:5);
   for(const source of this.input.held.keys())if(source.startsWith(prefix)&&!wanted.has(source))this.input.release(source);
   for(const [source,bit]of wanted)this.input.press(source,bit);
   const edges=[...down].filter(button=>!state.previous.has(button));state.previous=down;state.axes=axes;
   if(edges.includes(9))this.actions.start();
   if(edges.includes(7))this.actions.fly();
   if(edges.includes(11))this.actions.pause();
  }
  for(const [id]of this.pads)if(!seen.has(id)){
   const hadAttack=this.input.has(0);this.input.releasePrefix(`gamepad:${id}:`);this.pads.delete(id);
   if(hadAttack&&!this.input.has(0))this.actions.disconnect();
  }
  const label=names.join(' · ');
  if(label!==this.label){this.label=label;this.actions.status(label);}
 }
}
