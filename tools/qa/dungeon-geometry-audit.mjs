// All-room/variant geometric audit against native-loaded grids. No ROM art,
// layouts or snapshots are published. Controller traversal is a separate stage.
import fs from 'node:fs/promises';
import {createDungeonGeometry,dungeonGroups,dungeonFor,dungeonSpecialScenes} from '../../engine/dungeon-geometry.js';
import {readOptions,loadAuditRom,loadCatalog} from './area-catalog.mjs';
const argv=process.argv.slice(2),index=argv.indexOf('--source'),source=index<0?'.local/barrier-audit':argv.splice(index,2)[1];
const options=readOptions(argv),rom=await loadAuditRom(options),catalog=await loadCatalog(options);
const files=[];for(const dir of['runtime','variants'])for(const file of await fs.readdir(`${source}/${dir}`))if(file.endsWith('.json'))files.push(`${source}/${dir}/${file}`);
const rows=[],violations=[];
for(const file of files){
 const native=JSON.parse(await fs.readFile(file)),group=dungeonFor(native.id);
 if(!group||options.selected.length&&!options.selected.includes(native.id))continue;
 const ram=new Uint8Array(0x20000),word=(a,v)=>{ram[a]=v&255;ram[a+1]=v>>8;};
 word(0xdc,native.id);word(0xc0,native.width);word(0xc2,native.height);ram.set(native.flags,0xcf00);
 ram.set(native.grids[0],0x10000);ram.set(native.grids[1],0x14000);ram.set(native.descriptors,0x1b800);
 const g=createDungeonGeometry({ram,cart:{data:rom},frames:1}),context=g.context();
 if(!context){const protectedScene=dungeonSpecialScenes.get(native.id);if(!protectedScene)violations.push({file,kind:'unsupported-profile'});rows.push({id:native.id,key:native.key,group:group.id,flightRoutes:0,wallRoutes:0,wallCells:0,protected:protectedScene??'unsupported profile'});continue;}
 const flight=new Map(),walls=new Map(),protectedTiles=[];
 const key=path=>path.ends.map(t=>`${t.layer}:${t.tx},${t.ty}`).sort().join('/');
 for(let layer=0;layer<2;layer++)for(let y=1;y<context.height-1;y++)for(let x=1;x<context.width-1;x++){
  const t=g.tile(x,y,layer);if(!t)continue;
  if(t.flags&8||t.behavior&0xd0||t.code>=0x80)protectedTiles.push(t.address);
  const air=g.airRoute(t),wall=g.breach(t);
  for(const[path,kind,collection]of[[air,'air',flight],[wall,'wall',walls]])if(path){
   collection.set(key(path),path);
   if(path.ends.some(t=>!g.floor(t,context))||path.cells.some(t=>t.tx<=0||t.ty<=0||t.tx>=context.width-1||t.ty>=context.height-1||t.flags&8||t.behavior&0xd0))violations.push({file,kind,path});
  }
 }
 const edits=new Map();for(const path of walls.values())for(const e of path.edits)edits.set(e.address,e);
 if([...edits.keys()].some(a=>protectedTiles.includes(a)))violations.push({file,kind:'protected-edit'});
 // Record the most substantial route in every room, not just one tileset.
 const serialize=path=>path?{ends:path.ends,cells:path.cells,edits:path.edits}:null;
 const longest=paths=>[...paths.values()].sort((a,b)=>b.cells.length-a.cells.length)[0];
 rows.push({id:native.id,key:native.key??String(native.id),file,name:native.name,group:group.id,flags:native.requestedFlags??{},entry:catalog.maps[native.id].entry,
  flightRoutes:flight.size,wallRoutes:walls.size,wallCells:edits.size,protectedTiles:protectedTiles.length,flight:serialize(longest(flight)),wall:serialize(longest(walls))});
}
const groups=dungeonGroups.map(g=>({id:g.id,name:g.name,rooms:g.maps.length,audited:new Set(rows.filter(r=>r.group===g.id).map(r=>r.id)).size,
 variants:rows.filter(r=>r.group===g.id).length,flightRoutes:rows.filter(r=>r.group===g.id).reduce((s,r)=>s+r.flightRoutes,0),wallRoutes:rows.filter(r=>r.group===g.id).reduce((s,r)=>s+r.wallRoutes,0)}));
const expected=dungeonGroups.flatMap(g=>g.maps).filter(id=>!options.selected.length||options.selected.includes(id));
for(const id of expected)if(!rows.some(r=>r.id===id))violations.push({id,kind:'missing-native-grid'});
const result={coverage:'Every named dungeon native grid and cached conditional layout. Real opposing floors, placed map pieces, script exclusions, and paired-layer wall replacements. Controller validation is separate.',groups,violations,rows};
await fs.mkdir(options.out,{recursive:true});await fs.writeFile(`${options.out}/geometry.json`,JSON.stringify(result));console.log(JSON.stringify({groups,layouts:rows.length,violations:violations.length}));
if(violations.length)process.exitCode=1;
