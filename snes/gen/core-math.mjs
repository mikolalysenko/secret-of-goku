// Exact retail AI distance classes, including the 16-bit square-sum wrap.
// Two unused FastROM data halves avoid hardware multiplication and repeated
// threshold tests in C1:0358. Inputs outside a byte still take its class 8.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function generate({outDir}){
  const data=new Uint8Array(65536);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const d=(x*x+y*y)&65535;
    data[(y<<8)|x]=d<=0x100?1:d<=0x400?2:d<=0x900?4:
      d<=0x1000?8:d<=0x2400?16:48;
  }
  writeFileSync(join(outDir,'distance.bin'),data);
  writeFileSync(join(outDir,'data.asm'),`; Generated exact AI distance classes.
pushpc
org !DATA_CORE
core_distance_low:
incbin "core-math/distance.bin":0..$8000
org !DATA_CORE_DISTANCE_HIGH
core_distance_high:
incbin "core-math/distance.bin":$8000..$10000
pullpc
`);
}
