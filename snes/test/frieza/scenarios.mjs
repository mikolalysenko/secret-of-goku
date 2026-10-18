// Scenes set up on a preset for capture.mjs (browser) and run.mjs `effects`
// (cartridge). `edit(frieza, status, challenge)` runs inside the browser
// page on the snapshot's goku.frieza; status = {x, y, map, cameraX,
// cameraY} of the preset. Keep the functions self-contained (they are sent
// to the page as source).
export const scenarios={
  'core-charge':{preset:'late',frames:[20,60,100,140],music:1,
    edit:(f,s)=>{f.stage='theft';f.scene={kind:'core-charge',age:0,clock:0,map:s.map,x:s.x,y:s.y};}},
  'core-shot':{preset:'late',frames:[4,30,60,90],music:1,
    edit:(f,s)=>{f.stage='theft';f.scene={kind:'core-shot',age:0,clock:0,map:s.map,x:s.x,y:s.y};}},
  'core-impact':{preset:'late',frames:[52,64,80,110,140],music:1,
    edit:(f,s)=>{f.stage='theft';f.scene={kind:'core-impact',age:0,clock:0,map:s.map,x:s.x,y:s.y};}},
  'fanha':{preset:'late',frames:[6,16,30,60],music:0,
    edit:(f,s)=>{f.scene={kind:'fanha-finish',age:0,clock:0,map:s.map,x:s.x,y:s.y,target:{x:s.x-40,y:s.y-10}};}},
  'explode':{preset:'late',frames:[8,24,48],music:1,
    edit:(f,s)=>{f.stage='showdown';f.scene={kind:'explode',age:0,clock:0,map:s.map,x:s.x,y:s.y,target:{x:s.x-30,y:s.y-40}};}},
  'empower':{preset:'late',frames:[20,50,80,120],music:1,
    edit:(f,s)=>{f.stage='trial';f.scene={kind:'empower',age:0,clock:0,map:s.map,x:s.x,y:s.y,target:{x:s.x-60,y:s.y-20}};}},
};
