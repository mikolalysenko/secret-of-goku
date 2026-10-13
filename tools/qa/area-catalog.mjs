// Diagnostic graphics catalog. All generated game data stays under .local/.
// Factual names are attributed in map-names.json; layouts use tools/rom/NOTICE.md.
import fs from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readMap,decodeMapHeader,decodeDoor,word,normalizeRom,inspectRom} from '../rom/rom.mjs';

export function isMain(url){return process.argv[1]&&url===pathToFileURL(resolve(process.argv[1])).href;}
export function readOptions(argv=process.argv.slice(2)){
 const o={url:'http://127.0.0.1:5173/',out:'.local/graphics-audit/areas',state:'.local/graphics-audit/party.json',rom:'.local/rom/secret-of-mana-us.sfc',workers:3,selected:[],nativeArrival:true,all:false,screenshots:false,retry:false};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(['--url','--out','--state','--rom','--workers'].includes(arg)){if(!argv[i+1])throw Error('Missing value for '+arg);o[arg.slice(2)]=argv[++i];}
  else if(arg==='--all')o.all=true;
  else if(arg==='--native-arrival')o.nativeArrival=true;
  else if(arg==='--fixed-entry')o.nativeArrival=false;
  else if(arg==='--screenshots')o.screenshots=true;
  else if(arg==='--retry')o.retry=true;
  else if(/^\d+$/.test(arg))o.selected.push(Number(arg));
  else if(arg==='--help'){console.log('Options: --url URL --out DIR --state JSON --rom FILE --workers N --all --native-arrival --fixed-entry --screenshots --retry [map IDs]');process.exit(0);}
  else throw Error('Unknown argument: '+arg);
 }
 o.workers=Number(o.workers);if(!Number.isInteger(o.workers)||o.workers<1||o.workers>8)throw Error('--workers must be 1..8');
 for(const key of ['out','state','rom'])o[key]=resolve(o[key]);
 for(const id of o.selected)if(id>511)throw Error('Map ID must be 0..511');
 return o;
}
export async function loadAuditRom(options){
 const file=await fs.readFile(options.rom),info=inspectRom(file);if(!info.knownRevision)throw Error('Graphics audit requires the original Secret of Mana (USA) ROM.');
 return Buffer.from(normalizeRom(file).bytes);
}
export async function openAuditPage(browser,options,rom){
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Supply the caller's local ROM to this private browser only. This also works
 // with a static development server that does not implement /local-rom.
 await page.route('**/local-rom',route=>route.fulfill({status:200,contentType:'application/octet-stream',body:rom}));
 await page.goto(options.url);await page.waitForFunction(()=>window.mana?.bootOriginal,{},{timeout:60000});
 if(await page.evaluate(()=>document.body.dataset.mode!=='original'))await page.evaluate(async()=>mana.bootOriginal(new Uint8Array(await(await fetch('/local-rom')).arrayBuffer())));
 await page.waitForFunction(()=>window.mana?.ready,{},{timeout:60000});await page.evaluate(()=>mana.pause());
 return{page,errors};
}
export async function buildCatalog(options){
 const bytes=new Uint8Array(await loadAuditRom(options));
 const reference=JSON.parse(await fs.readFile(new URL('./map-names.json',import.meta.url),'utf8'));
 const names=new Map(Object.entries(reference.names).map(([id,name])=>[Number(id),name]));
const groups=[
 ['01-potos','Potos and opening',[/POTOS|RUSTYSWORD|RABITEFIELD|^NEKOS?HOUSE|GOBLIN|MANTISANT|INTRO_LOG/]],
 ['02-water-palace','Water Palace and Undine',[/WATERPALACE|UNDINECAVE|^UNDINE$|JABBERWOCKY|^TONPOLE/]],
 ['03-pandora','Pandora and Kippo',[/PANDORA|KIPPO|WALLFACE/]],
 ['04-gaia','Gaia’s Navel and Dwarf Village',[/GAIASNAVEL|DWARFTOWN|^WATTS|MAGICROPE|TROPICALLO|RABITEMAN/]],
 ['05-witch','Haunted Forest and Witch Castle',[/WITCH|GIRL_VS_WEREWOLF|SPIKEY/]],
 ['06-earth','Earth Palace',[/EARTHPALACE|EARTHSEED/]],
 ['07-kilroy','Kilroy’s ship',[/KILROY/]],
 ['08-upperland','Upper Land and Wind Palace',[/UPPERLAND|WINDPALACE|WINDSEED|SPRINGBEAK/]],
 ['09-matango','Matango and Flammie’s cave',[/MATANGO|GREATVIPER/]],
 ['10-ice','Ice Country and Ice Palace',[/ICE|SANTA|PARADISETOWN|^TODO|BOREALFACE|FROSTGIGAS|TRIPLETONPOLE/]],
 ['11-desert','Kakkara and Sandship',[/DESERT|KAKKARA|SANDSHIP|MECHRIDER1/]],
 ['12-fire','Fire Palace',[/FIREPALACE|FIRESEED|MINOTAUR/]],
 ['13-empire','Empire towns and castle',[/EMPIRE|SOUTHTOWN|NORTHTOWN(?:_(?!RUINS)|$)|^NTC_|MECHRIDER2|METALMANTIS/]],
 ['14-ruins','Northtown Ruins',[/^NTR_|DOOMSWALL|VAMPIRE/]],
 ['15-light','Gold City and Light Palace',[/GOLDCITY|^LUMINA|LIGHTSEED|BLUESPIKE|GORGONBULL/]],
 ['16-jehk','Mandala and Jehk',[/MANDALA|JEHK/]],
 ['17-shade','Shade Palace',[/SHADEPALACE|DARKSEED|LIMESLIME/]],
 ['18-luna','Moon Palace and ferry',[/LUNAPALACE|MOONSEED|KARON/]],
 ['19-tasnica','Tasnica',[/TASNICA/]],
 ['20-islands','Turtle Island and Lighthouse',[/TURTLEISLAND|LIGHTHOUSE/]],
 ['21-lost-continent','Lost Continent, subway and Grand Palace',[/SUNKENCONTINENT|UNDERSEA|GRANDPALACE|DOPPEL|KETTLEKIN|MECHRIDER3|WATERMELON|HEXAS|SNAPDRAGON|DRYADSEED|HYDRA|FIREGIGAS/]],
 ['22-purelands','Pure Land and Mana Tree',[/PURELANDS|MANATREE|DRAGONWORM|AXEBEAK|THUNDERGIGAS|SNOWDRAGON|REDDRAGON|BLUEDRAGON/]],
 ['23-fortress','Mana Fortress and final bosses',[/MANAFORT|MANABEAST|BUFFY|DARKLICH|DREADSLIME/]],
];
function region(name){
 if(!name)return{region:'26-unclassified',regionName:'Unused or unclassified slot'};
 if(name.startsWith('CREDITS_'))return{region:'24-credits',regionName:'Credits scenes'};
 if(name.startsWith('INTRO_')&&name!=='INTRO_LOG')return{region:'25-intro',regionName:'Opening lore scenes'};
 if(name==='DEATH_MAP')return{region:'25-intro',regionName:'Opening lore scenes and game over'};
 if(name.startsWith('GAIASNAVEL'))return{region:'04-gaia',regionName:'Gaia’s Navel and Dwarf Village'};
 const g=groups.find(([, ,patterns])=>patterns.some(p=>p.test(name)));
 return g?{region:g[0],regionName:g[1]}:{region:'26-unclassified',regionName:'Unused or unclassified slot'};
}
const doors=Array.from({length:1024},(_,i)=>decodeDoor(bytes,i));
const catalog=[];
for(let id=0;id<512;id++){
 const rawName=names.get(id),headerAt=0x80000+word(bytes,0x87000+id*2),header=decodeMapHeader(bytes.subarray(headerAt,headerAt+8));
 const row={id,name:rawName?.toLowerCase().replaceAll('_',' ')||`Unclassified slot ${id}`,referenceName:rawName||null,documented:!!rawName,...region(rawName),headerAt,header,assemblyAt:0x80000+word(bytes,0x85000+id*2),triggersAt:0x80000+word(bytes,0x84000+id*2)};
 try{
  const m=readMap(bytes,id,row.name,{16:1});
  row.dimensions={width:m.composite.width,height:m.composite.height};row.objects=m.objects.map(({index,x,y,species,event,visibility})=>({index,x,y,species,event,visibility}));
  row.triggers=m.triggers;row.pieces=m.pieces.map(({id,x,y,width,height,layer,visibility})=>({id,x,y,width,height,layer,visibility}));
 }catch(e){row.decodeError=e.message;}
 const inbound=doors.filter(d=>d.map===id&&d.x>0&&d.y>0&&d.x<127&&d.y<127&&(!row.dimensions||d.x<row.dimensions.width&&d.y<row.dimensions.height));
 row.inboundDoors=inbound;
 row.entry=inbound.length?{x:inbound[0].x,y:inbound[0].y,collisionLayer:inbound[0].collisionLayer,sourceDoor:inbound[0].id,selection:'first original inbound door'}:
  row.objects?.length?{x:row.objects[0].x,y:row.objects[0].y+2,collisionLayer:1,sourceDoor:null,selection:'diagnostic position near first map object'}:
  {x:Math.floor((row.dimensions?.width||32)/2),y:Math.floor((row.dimensions?.height||32)/2),collisionLayer:1,sourceDoor:null,selection:'diagnostic map center'};
 const prior=catalog.find(c=>c.headerAt===row.headerAt&&c.assemblyAt===row.assemblyAt&&c.triggersAt===row.triggersAt);
 if(prior)row.exactDataAliasOf=prior.id;
 catalog.push(row);
}
// Some old door records still point at obsolete coordinates. Prefer doors
// actually referenced by a map's native tile triggers over leftover records.
const referencedBy=new Map();
for(const m of catalog)for(const trigger of m.triggers||[])if(trigger.door){const a=referencedBy.get(trigger.door.id)||[];if(!a.includes(m.id))a.push(m.id);referencedBy.set(trigger.door.id,a);}
for(const m of catalog){
 for(const door of m.inboundDoors)door.referencedByMaps=referencedBy.get(door.id)||[];
 const preferred=m.inboundDoors.find(d=>d.referencedByMaps.length);
 if(preferred)m.entry={x:preferred.x,y:preferred.y,collisionLayer:preferred.collisionLayer,sourceDoor:preferred.id,selection:'original inbound door referenced by native map trigger'};
}

 const result={schema:1,rom:'Secret of Mana (USA), supplied local ROM',provenance:{names:reference.source,mapLayout:'https://hackofmana.com/maps/'},maps:catalog};
 await fs.mkdir(options.out,{recursive:true});await fs.writeFile(options.out+'/catalog.json',JSON.stringify(result,null,2));return result;
}
export async function loadCatalog(options){try{return JSON.parse(await fs.readFile(options.out+'/catalog.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;return buildCatalog(options);}}
if(isMain(import.meta.url)){const c=await buildCatalog(readOptions());console.log(JSON.stringify({slots:c.maps.length,documented:c.maps.filter(m=>m.documented).length,decoded:c.maps.filter(m=>!m.decodeError).length}));}
