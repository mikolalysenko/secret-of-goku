// Browser-clip references with ki-sound.js gain/compressor/loop automation.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {wav} from './apu.mjs';
const root=resolve('.local/snes-test/audio/compare7');mkdirSync(root,{recursive:true});
const clips=['beam','charge','aura','air','charged','transform','power-burst','revert','teleport','flight','landing','blast','impact'];
const source=Object.fromEntries(clips.map(n=>[n,readFileSync('assets/audio/dbz/'+n+'.wav').toString('base64')]));
const shots={beam:['beam',.80], 'beam-full':['beam',.80,.86],charged:['charged',.42],transform:['transform',.78],'power-burst':['power-burst',.92],revert:['revert',.50],flight:['flight',.48],landing:['landing',.36],'teleport-out':['teleport',.74],'teleport-in':['teleport',.46],blast:['blast',.38],impact:['impact',.48]};
const jobs=[...Object.keys(shots).map(name=>({name,mode:'shot'})),...['charge','aura','focus','charge-beam','focus-transform','flight-context','teleport-context','ki-volley'].map(name=>({name,mode:name}))];
const browser=await chromium.launch({channel:'chrome',headless:true}).catch(()=>chromium.launch({headless:true}));
const page=await browser.newPage(),files=[];
try{for(const job of jobs){
 const result=await page.evaluate(async({job,source,shots})=>{
  const duration=job.mode==='shot'?3.5:job.mode==='focus-transform'?9:job.mode==='focus'?6:6;
  const ctx=new OfflineAudioContext(2,Math.ceil(duration*32000),32000),master=ctx.createGain(),comp=ctx.createDynamicsCompressor();
  master.gain.value=.55;comp.threshold.value=-10;comp.knee.value=12;comp.ratio.value=6;comp.attack.value=.003;comp.release.value=.16;
  master.connect(comp);comp.connect(ctx.destination);
  const buffers={};for(const [n,s] of Object.entries(source)){const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));buffers[n]=await ctx.decodeAudioData(b.buffer);}
  function shot(name,time=0){const [clip,gain,rate=1]=shots[name],s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffers[clip];s.playbackRate.value=rate;g.gain.value=gain;s.connect(g);g.connect(master);s.start(time);}
  function bed(name,from,to,fn){
   const base={charge:.55,aura:.30,air:.25}[name],s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffers[name];s.loop=true;g.gain.value=0;s.connect(g);g.connect(master);s.start(from);
   let gain=0,rate=1,last=from;
   for(let t=from;t<to;t+=1/60){const [l,r]=fn(t-from);g.gain.setTargetAtTime(base*l,t,.055);s.playbackRate.setTargetAtTime(r,t,.08);gain=base*l+(gain-base*l)*Math.exp(-1/60/.055);rate=r+(rate-r)*Math.exp(-1/60/.08);last=t;}
   g.gain.cancelScheduledValues(to);g.gain.setValueAtTime(gain,to);g.gain.linearRampToValueAtTime(0,to+.065);s.stop(to+.07);
  }
  const charge=(superSaiyan=false)=>bed('charge',0,3,t=>{const f=Math.min(1,t/(superSaiyan?.75:1.5));return [.48+.52*f,.94+.12*f];});
  const focus=(to=4)=>{bed('charge',0,to,t=>{const f=Math.min(1,t/1.6);return [.22+.85*f,.72+.30*f];});bed('aura',.65,to,t=>{const f=Math.min(1,(t+.65)/1.6);return [f,.8+.2*f];});};
  switch(job.mode){
   case 'shot':shot(job.name);break;
   case 'charge':charge();break;
   case 'aura':bed('aura',0,3,t=>{const f=Math.min(1,t/1.6);return [f,.8+.2*f];});break;
   case 'focus':focus();break;
   case 'charge-beam':charge(true);bed('aura',.2667,3,t=>[Math.min(1,(t+.2667)/.75),1]);shot('charged',.75);shot('beam-full',3);break;
   case 'focus-transform':focus(2);bed('charge',2,4.55,()=>[.85,1.06]);bed('aura',2,4.55,()=>[1,1]);shot('transform',2);shot('power-burst',2.9);shot('revert',6);break;
   case 'flight-context':shot('flight');bed('air',0,3,()=>[1,1]);shot('landing',3);break;
   case 'teleport-context':shot('teleport-out');shot('teleport-in',.13);break;
   case 'ki-volley':for(let i=0;i<14;i++){shot('blast',i*.21);shot('impact',i*.21+.13);}break;
  }
  const rendered=await ctx.startRendering();return [Array.from(rendered.getChannelData(0)),Array.from(rendered.getChannelData(1))];
 },{job,source,shots});
 let clipped=0,peak=0,sum=0;for(const a of result)for(const x of a){peak=Math.max(peak,Math.abs(x));sum+=x*x;if(Math.abs(x)>=1)clipped++;}
 const ints=result.map(a=>Int16Array.from(a,x=>Math.max(-32768,Math.min(32767,Math.round(x*32767))))),data=wav(...ints),file='pc-'+job.name+'.wav';writeFileSync(join(root,file),data);
 files.push({file,variant:'PC',description:job.mode==='shot'?'Original 16 kHz browser clip with cue gain and master/compressor.':'Browser loop gain/rate model, 60 Hz automation, 55/80 ms targets and 65 ms release. No music.',sampleRate:32000,channels:2,seconds:result[0].length/32000,sha256:createHash('sha256').update(data).digest('hex'),peakDbFS:20*Math.log10(peak),rmsDbFS:10*Math.log10(sum/(2*result[0].length)),clipped});
 }
}finally{await browser.close();}
writeFileSync(join(root,'manifest-pc.json'),JSON.stringify({renderer:'Chromium OfflineAudioContext; source assets/audio/dbz/*.wav; master .55, compressor -10 dB / knee 12 / ratio 6 / attack .003 / release .16; no normalization.',note:'Full-power beam rate .86 follows the maintainer reference. Browser sampled voice() currently defaults beam rate to 1; .86 is explicit here. Contexts isolate the sound model without browser music or game-state timing.',files},null,2));
console.log(`PC: ${files.length} references, ${files.reduce((n,f)=>n+f.clipped,0)} clipped samples`);
