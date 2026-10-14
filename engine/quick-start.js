// Built locally from the user's ROM. No cartridge bytes or savestates ship
// with the site. Bump the revision when native virtual script layouts change.
export const quickStartRevision='thanatos-flight-8';
export const quickStartLabels={title:'After title',sword:'After sword / pod crash'};
export async function buildQuickStart(kind,{fresh,pump,mod,arrival,capture,cache,progress}){
  if(!(kind in quickStartLabels))throw Error('Unknown quick checkpoint');
  await fresh();progress('Running the original title…');
  for(const[frames,buttons]of[[960],[2,[3]],[180],[2,[0]],[180]])await pump(frames,buttons);
  if(!mod.nameEditor)throw Error('The original name menu did not open.');
  await cache('title',capture());if(kind==='title')return;
  progress('Running the bridge and waterfall…');
  await pump(2,[3]);await pump(300);
  for(let i=0;i<6;i++)await pump(600);
  for(let i=0;i<30&&!(mod.read16(0xdc)===128&&mod.read8(0xd0)===0);i++){await pump(2,[16]);await pump(240);}
  if(mod.read16(0xdc)!==128||mod.read8(0xd0)!==0||mod.read8(0xcf10)!==0)throw Error('The opening did not reach the waterfall.');
  progress('Pulling the Mana Sword and landing the pod…');
  // This explicit testing shortcut skips the river walk. Use the verified
  // sword approach point and stream every crossed camera row through the
  // native camera adapter. The real interaction and arrival events follow.
  mod.write16(0xe002,500);mod.write16(0xe004,932);
  mod.teleport.follow({x:500,y:932,terrain:mod.read8(0xe00b),layer:0});
  await pump(120);await pump(2,[5]);
  for(let i=0;i<65&&!(arrival.phase==='complete'&&mod.canAttack);i++){await pump(2,[16]);await pump(150);}
  if(arrival.phase!=='complete'||!mod.canAttack||mod.read8(0xcf10)!==1)throw Error('The sword scene did not return control.');
  mod.cancelInput();await pump(60);await cache('sword',capture());
}
