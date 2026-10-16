// Renders the Mana-instrument arrangements from your local ROM for mix review.
// Output stays in .local/ (never commit it): it contains cartridge samples.
//   node scripts/render-mana-score.mjs [--stems] [rom path]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {readManaInstruments} from '../engine/mana-instruments.js';
import {renderSpcScoreSync} from '../engine/spc-score.js';
import {arrangements} from '../engine/mana-arrangements.js';
const args=process.argv.slice(2),stems=args.includes('--stems'),romPath=args.find(a=>!a.startsWith('--'))??'.local/rom/secret-of-mana-us.sfc';
const bank=readManaInstruments(new Uint8Array(readFileSync(romPath)));
if(!bank)throw Error('This ROM does not contain the US Secret of Mana instrument table');
const out='.local/mana-score';mkdirSync(out,{recursive:true});
function wav(path,left,right){
 const b=Buffer.alloc(44+left.length*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(32000,24);b.writeUInt32LE(128000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(left.length*4,40);
 for(let i=0;i<left.length;i++){b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]))*32767),44+i*4);b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]))*32767),46+i*4);}
 writeFileSync(path,b);
}
for(const[key,build]of Object.entries(arrangements)){
 const score=build(),t=performance.now(),r=renderSpcScoreSync(bank,score);
 wav(`${out}/${key}.wav`,r.left,r.right);
 if(stems)score.voices.forEach((v,i)=>{const solo={...score,peak:undefined,voices:score.voices.map((w,j)=>j===i?w:{...w,events:[]})};const s=renderSpcScoreSync(bank,{...solo,peak:.8*Math.max(.05,v.events.length?1:0)});wav(`${out}/${key}-${i+1}.wav`,s.left,s.right);});
 console.log(key,`${r.duration.toFixed(1)}s`,`${(performance.now()-t).toFixed(0)}ms`,'gain',r.gain.toExponential(2));
 for(const[i,v]of r.voices.entries())console.log(`  ${i+1} ${v.role.padEnd(44)} notes ${String(v.notes).padStart(4)} rms ${v.rms.toFixed(4)} trunc ${v.truncated} ${v.patches.join(',')}`);
}
