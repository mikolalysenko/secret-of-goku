// Private, reproducible whole-cartridge barrier inventory. Generated map
// layouts and event text stay under .local; the ROM is read only.
import fs from 'node:fs/promises';
import {readOptions,loadAuditRom,buildCatalog,isMain} from './area-catalog.mjs';
import {readMap,readTileset,readCollisionTypes} from '../rom/rom.mjs';
import {parseEvent} from '../../engine/event-codec.js';

export async function inventoryBarriers(options){
 const rom=await loadAuditRom(options),catalog=await buildCatalog(options),types=readCollisionTypes(rom);
 const events=Array.from({length:0x800},(_,id)=>parseEvent(rom,id));
 const writes=new Map();
 for(const event of events)for(const op of event.ops){
  const flag=[0x29,0x2a,0x30].includes(op.op)?op.bytes[1]:null;
  if(flag===null)continue;const list=writes.get(flag)||[];
  list.push({event:event.id,op:op.op,value:op.op===0x30?op.bytes[2]:null});writes.set(flag,list);
 }
 const maps=[];
 for(const source of catalog.maps){
  const scene=/^(24|25)-/.test(source.region),row={id:source.id,name:source.name,region:source.region,entry:source.entry,
   classification:scene?'scene':source.documented?'gameplay':source.decodeError?'unused-slot':'unclassified-layout'};
  if(source.decodeError){row.error=source.decodeError;maps.push(row);continue;}
  const map=readMap(rom,source.id,source.name),tileset=readTileset(rom,map.header.tileset16),hitTiles=new Map(),destructibles=new Map();
  for(const piece of map.pieces){
   const base=(piece.layer==='background'?map.header.layer1UsesForegroundTiles:map.header.layer2UsesForegroundTiles)?192:0;
   for(let i=0;i<piece.tiles.length;i++){
    const tile=piece.tiles[i],d=types[tileset.collision[tile+base]].raw,code=d[2];
    if((code&0xf0)!==0xf0&&(code&0xf0)!==0xc0)continue;
    const target=(code&0xf0)===0xf0?hitTiles:destructibles,id=(code&0xf0)===0xf0?d[3]*16+(code&15):code;
    const group=target.get(id)||{id,tiles:[]};
    group.tiles.push({x:piece.x+i%piece.width,y:piece.y+Math.floor(i/piece.width),layer:piece.layer,visibility:piece.visibility,tile,replacement:d[3]});target.set(id,group);
   }
  }
  const flags=[...new Set(map.pieces.filter(p=>p.visibility.flag&&(p.visibility.min>0||p.visibility.max<15)).map(p=>p.visibility.flag))];
  row.conditional=flags.map(flag=>({flag,writers:writes.get(flag)||[],pieces:map.pieces.filter(p=>p.visibility.flag===flag).map(p=>({id:p.id,layer:p.layer,x:p.x,y:p.y,width:p.width,height:p.height,min:p.visibility.min,max:p.visibility.max}))}));
  row.hitTiles=[...hitTiles.values()];row.destructibles=[...destructibles.values()];
  row.orbs=map.objects.filter(o=>o.species===0x55);
  row.npcs=map.objects.filter(o=>o.species>=0x80);
  row.triggers=map.triggers;row.header=map.header;row.dimensions={width:map.composite.width,height:map.composite.height};
  maps.push(row);
 }
 const obstacleText=/\b(?:lock(?:ed)?|key|barrier|switch|blocked|can't (?:pass|enter|go)|cannot (?:pass|enter|go)|sealed|won't (?:open|let)|door|axe|whip|password|orb|stairs|bridge)\b/i;
 const scripts=events.filter(e=>e.ops.some(op=>op.op==='text'&&obstacleText.test(op.text))).map(e=>({id:e.id,text:e.ops.filter(o=>o.op==='text').map(o=>o.text).join('\n'),ops:e.ops.filter(o=>o.op!=='text').map(o=>o.bytes)}));
 const summary={slots:maps.length,gameplay:maps.filter(m=>m.classification==='gameplay').length,scenes:maps.filter(m=>m.classification==='scene').length,
  gameplayDecodeErrors:maps.filter(m=>m.classification==='gameplay'&&m.error).length,conditionalMaps:maps.filter(m=>m.classification==='gameplay'&&m.conditional?.length).length,
  hitEvents:[...new Set(maps.flatMap(m=>m.hitTiles?.map(h=>h.id)||[]))].sort((a,b)=>a-b),orbMaps:maps.filter(m=>m.orbs?.length).length,obstacleScripts:scripts.length};
 const inventory={generated:new Date().toISOString(),coverage:'All 512 map slots and every placed map piece, including hidden story variants. Inventory only; runtime traversal remains separately verified.',summary,maps,scripts};
 await fs.writeFile(options.out+'/barriers.json',JSON.stringify(inventory,null,2));return inventory;
}
if(isMain(import.meta.url)){const options=readOptions();console.log(JSON.stringify((await inventoryBarriers(options)).summary));}
