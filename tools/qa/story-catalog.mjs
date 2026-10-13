import fs from 'node:fs/promises';
import {parseEvent} from '../../engine/event-codec.js';
const rom=await fs.readFile('.local/rom/secret-of-mana-us.sfc'),events=[];
for(let id=0;id<0x800;id++){
  const event=parseEvent(rom,id);if(event.ops.some(op=>op.op==='text'))events.push(event);
}
await fs.mkdir('.local/story-research',{recursive:true});
await fs.writeFile('.local/story-research/events.json',JSON.stringify(events,null,2));
await fs.writeFile('.local/story-research/dialogue.txt',events.map(e=>`EVENT ${e.id.toString(16)}\n`+e.ops.filter(o=>o.op==='text').map(o=>`${o.at.toString(16)} ${JSON.stringify(o.text)}`).join('\n')).join('\n\n'));
console.log(`${events.length} events catalogued privately.`);
