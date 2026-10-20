// Exact retail AI distance classes and pursuit-direction descriptors.
// FastROM tables avoid repeated threshold tests; the distance class keeps
// its 16-bit square-sum wrap, and C1:0404 keeps its own coordinate folding.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function generate({outDir}){
  const data=new Uint8Array(65536);
  const direction=new Uint8Array(65536);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const d=(x*x+y*y)&65535;
    data[(y<<8)|x]=d<=0x100?1:d<=0x400?2:d<=0x900?4:
      d<=0x1000?8:d<=0x2400?16:48;
    const minor=Math.min(x,y),half=(Math.max(x,y)-minor)>>1;
    direction[(y<<8)|x]=(minor&0xF0)|(y>x?1:0)|(half+(half>>1)<minor?2:0);
  }
  writeFileSync(join(outDir,'distance.bin'),data);
  writeFileSync(join(outDir,'direction.bin'),direction);
  writeFileSync(join(outDir,'data.asm'),`; Generated exact AI distance classes.
pushpc
org !DATA_CORE
core_distance_low:
incbin "core-math/distance.bin":0..$8000
org !DATA_CORE_DISTANCE_HIGH
core_distance_high:
incbin "core-math/distance.bin":$8000..$10000
org !DATA_CORE_DIRECTION_LOW
core_direction_low:
incbin "core-math/direction.bin":0..$8000
org !DATA_CORE_DIRECTION_HIGH
core_direction_high:
incbin "core-math/direction.bin":$8000..$10000
pullpc
`);
}
