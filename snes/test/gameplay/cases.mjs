// Shared video-frame input scripts for the cartridge and browser baseline.
export const GAMEPLAY_CASES=[
  ['solo-punch','danger-progress__waterfall','b:180,none:60'],
  ['solo-ki','danger-progress__waterfall','y:180,none:60'],
  ['walk','animation-audit__native__rabite-field-a',Array(15).fill('right:8,left:8').join(',')],
  ['punch','animation-audit__native__rabite-field-a','right:12,b:180,none:48'],
  ['ki','animation-audit__native__rabite-field-a','right:4,y:180,none:56'],
  ['fly','animation-audit__native__rabite-field-a',Array(3).fill('a+right:8,none:32,a+left:8,none:32').join(',')],
  // The imported hero is only 30 px from the east exit. Video-frame input
  // reversals can drift when CPU misses differ; walk into the field first
  // so a faster long run keeps measuring combat instead of a map transition.
  ['fly-ki','animation-audit__native__rabite-field-b',Array(15).fill('a+right+y:8,a+left+y:8').join(','),'left:24'],
  ['fly-punch','animation-audit__native__rabite-field-b',Array(15).fill('a+right+b:8,a+left+b:8').join(','),'left:24'],
  ['water-flight','danger-progress__waterfall','a+right:30,none:20,a+left+y:30,none:20,a+up:30,none:20,a+down:30,none:60'],
  ['teleport','animation-audit__native__rabite-field-b',Array(8).fill('l+b:2,none:28').join(',')],
  ['charge','animation-audit__native__rabite-field-a','right:4,l+y:100,none:136'],
  ['focus-grass','animation-audit__native__rabite-field-b','l:120,none:120','down:2,b:60,none:15,down:24,none:15'],
  ['transform-grass','animation-audit__native__rabite-field-b','l:100,l+a:4,none:136','down:2,b:60,none:15,down:24,none:15'],
];

export const PERF_SCENES=['sword','sandship','battle','beast','fortress','flight'];
export const PERF_SCRIPT=Array.from({length:300},(_,i)=>`${(i+1)%60<30?'left':'right'}:1`).join(',');
