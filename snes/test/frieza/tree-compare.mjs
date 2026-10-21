import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createManaTreeVista} from '../../../engine/mana-tree-vista.js';
import {blank,readPng,writePng,to555,from555} from '../../tools/gfx.mjs';

// The browser paints its cliff over the native HUD. Compare every pixel
// in the three HUD rows directly with that source, without a HUD mask.
// Native BG scroll zero starts at source line 1 (Mesen screenshot row 0).
export function compareTreeCliff(out){
  const vista=createManaTreeVista(readFileSync(new URL('../../../rom/secret-of-mana-us.sfc',import.meta.url)));
  const surface=new Uint16Array(256*224),put=(x,y,c)=>surface[y*256+x]=c-1;
  vista(put);vista(put,{foreground:true,x:0,y:184});
  const failures=[];let shots=0,pixels=0;
  for(const name of ['k13-a048','k13-a096','k13-a110','k14-a020','k14-a060','k14-a120',
    'k15-a008','k15-a024','k15-a038','k16-a080','k17-a030','k17-a090','k17-a119']){
    const path=join(out,name+'.png');if(!existsSync(path))continue;
    const actual=readPng(path),pair=blank(512,24);let bad=0;
    for(let y=200;y<224;y++)for(let x=0;x<256;x++){
      const at=((y-1)*actual.width+x)*4,want=surface[y*256+x];
      const got=to555(actual.data[at],actual.data[at+1],actual.data[at+2]);
      if(got!==want)bad++;
      pair.data.set([...from555(want),255],((y-200)*512+x)*4);
      pair.data.set(actual.data.subarray(at,at+4),((y-200)*512+x+256)*4);
    }
    writeFileSync(join(out,'cliff-'+name+'.png'),writePng(pair));
    if(bad)failures.push(`${name}: ${bad}/6144 cliff pixels differ from the browser`);
    shots++;pixels+=6144;
  }
  if(shots<8)failures.push(`only ${shots} cliff comparisons`);
  return {failures,shots,pixels};
}
