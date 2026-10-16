// Renders a score through an S-DSP-style voice model: eight monophonic
// voices on the cartridge's BRR samples, 32 kHz output, 4-point gaussian
// interpolation, hardware ADSR rates and an echo buffer with FIR/feedback.
// The driver layer (notes, vibrato, slides, volumes) follows the score data.

// Gaussian interpolation table, from fullsnes via vendor/snes/dsp.js (MIT).
const gauss=new Int16Array([
 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,
 2,2,3,3,3,3,3,4,4,4,4,4,5,5,5,5,6,6,6,6,7,7,7,8,8,8,9,9,9,10,10,10,
 11,11,11,12,12,13,13,14,14,15,15,15,16,16,17,17,18,19,19,20,20,21,21,22,23,23,24,24,25,26,27,27,
 28,29,29,30,31,32,32,33,34,35,36,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,
 58,59,60,61,62,64,65,66,67,69,70,71,73,74,76,77,78,80,81,83,84,86,87,89,90,92,94,95,97,99,100,102,
 104,106,107,109,111,113,115,117,118,120,122,124,126,128,130,132,134,137,139,141,143,145,147,150,152,154,156,159,161,163,166,168,
 171,173,175,178,180,183,186,188,191,193,196,199,201,204,207,210,212,215,218,221,224,227,230,233,236,239,242,245,248,251,254,257,
 260,263,267,270,273,276,280,283,286,290,293,297,300,304,307,311,314,318,321,325,328,332,336,339,343,347,351,354,358,362,366,370,
 374,378,381,385,389,393,397,401,405,410,414,418,422,426,430,434,439,443,447,451,456,460,464,469,473,477,482,486,491,495,499,504,
 508,513,517,522,527,531,536,540,545,550,554,559,563,568,573,577,582,587,592,596,601,606,611,615,620,625,630,635,640,644,649,654,
 659,664,669,674,678,683,688,693,698,703,708,713,718,723,728,732,737,742,747,752,757,762,767,772,777,782,787,792,797,802,806,811,
 816,821,826,831,836,841,846,851,855,860,865,870,875,880,884,889,894,899,904,908,913,918,923,927,932,937,941,946,951,955,960,965,
 969,974,978,983,988,992,997,1001,1005,1010,1014,1019,1023,1027,1032,1036,1040,1045,1049,1053,1057,1061,1066,1070,1074,1078,1082,1086,1090,1094,1098,1102,
 1106,1109,1113,1117,1121,1125,1128,1132,1136,1139,1143,1146,1150,1153,1157,1160,1164,1167,1170,1174,1177,1180,1183,1186,1190,1193,1196,1199,1202,1205,1207,1210,
 1213,1216,1219,1221,1224,1227,1229,1232,1234,1237,1239,1241,1244,1246,1248,1251,1253,1255,1257,1259,1261,1263,1265,1267,1269,1270,1272,1274,1275,1277,1279,1280,
 1282,1283,1284,1286,1287,1288,1290,1291,1292,1293,1294,1295,1296,1297,1297,1298,1299,1300,1300,1301,1302,1302,1303,1303,1303,1304,1304,1304,1304,1304,1305,1305]);
const rates=[0,2048,1536,1280,1024,768,640,512,384,320,256,192,160,128,96,80,64,48,40,32,24,20,16,12,10,8,6,5,4,3,2,1];
export const spcRate=32000;

export function scoreLength(score,rate=spcRate){return Math.round(score.bars*4*60/score.bpm*rate);}

function renderVoice(bank,score,events,count,spb,outL,outR,sendL,sendR,echo,stats){
 events=[...events].sort((a,b)=>a.at-b.at);
 for(let j=0;j<events.length;j++){
  const e=events[j],patch=score.patches[e.patch];if(!patch)throw Error(`Unknown patch: ${e.patch}`);
  const s=bank[patch.sample];if(!s)throw Error(`Missing instrument ${patch.sample}`);
  const start=Math.round(e.at*spb),next=j+1<events.length?Math.round(events[j+1].at*spb):Math.round(events[0].at*spb)+count;
  const length=next-start,off=Math.round(e.len*spb),pcm=s.pcm,size=pcm.length,loop=s.loopStart,span=size-loop;
  const [a1,a2]=patch.adsr??s.adsr,adsr=(a1&0x80)!==0,attack=(a1&15)*2+1,decay=(a1>>4&7)*2+16,level=a2>>5,sustain=a2&31;
  const note=(e.note??60)+(patch.transpose??0),base=patch.pitch?patch.pitch*2**((note-60)/12):(patch.unity??s.unity)*2**((note-57)/12);
  const vib=e.vibrato??patch.vibrato,slide=e.slide,vol=(e.vol??100)*(patch.vol??1)/128,pan=e.pan??patch.pan??0;
  const gl=vol*Math.min(1,1-pan),gr=vol*Math.min(1,1+pan),send=echo&&patch.echo!==false;
  let env=adsr?0:0x7ff,state=adsr?0:2,counter=0,pos=0;
  const get=i=>i<0?0:i<size?pcm[i]:loop<0?0:pcm[loop+(i-loop)%span];
  for(let k=0;k<length;k++){
   if(k===off)state=3;
   // Envelope, at the S-DSP's counter rates.
   if(state===3){env-=8;if(env<=0){env=0;break;}}
   else if(adsr){
    const r=state===0?attack:state===1?decay:sustain;
    if(r&&++counter>=rates[r]){counter=0;
     if(state===0){env+=r===31?1024:32;if(env>=0x7e0){env=Math.min(env,0x7ff);state=1;}}
     else{env-=(env-1>>8)+1;if(env<0)env=0;if(state===1&&env>>8<=level)state=2;}
    }
   }
   const index=pos|0;if(loop<0&&index>=size)break;
   const o=(pos-index)*256|0;
   const v=(gauss[255-o]*get(index-3)+gauss[511-o]*get(index-2)+gauss[256+o]*get(index-1)+gauss[o]*get(index))/2048*env/2048;
   // Driver pitch effects: delayed vibrato and an initial slide into the note.
   const t=k/spcRate;let p=base;
   if(vib&&t>vib.delay)p*=2**(vib.depth*Math.min(1,(t-vib.delay)/.25)*Math.sin(2*Math.PI*vib.rate*(t-vib.delay))/12);
   if(slide&&t<slide.time)p*=2**(slide.from*(1-t/slide.time)/12);
   pos+=Math.min(p,0x3fff)/0x1000;
   const ix=(start+k)%count,l=v*gl,r=v*gr;
   outL[ix]+=l;outR[ix]+=r;if(send){sendL[ix]+=l;sendR[ix]+=r;}
  }
  if(off>length)stats.truncated++;
 }
}

// A generator so the browser can render in time slices between frames.
export function* renderSpcScore(bank,score,{rate=spcRate}={}){
 if(rate!==spcRate)throw Error('The S-DSP renders at 32 kHz');
 const count=scoreLength(score),spb=60/score.bpm*spcRate;
 const dryL=new Float32Array(count),dryR=new Float32Array(count),sendL=new Float32Array(count),sendR=new Float32Array(count),voices=[];
 for(const voice of score.voices){
  const l=new Float32Array(count),r=new Float32Array(count),stats={truncated:0};
  renderVoice(bank,score,voice.events,count,spb,l,r,sendL,sendR,voice.echo!==false,stats);
  let energy=0;for(let i=0;i<count;i++){dryL[i]+=l[i];dryR[i]+=r[i];energy+=l[i]*l[i]+r[i]*r[i];}
  voices.push({role:voice.role,notes:voice.events.length,patches:[...new Set(voice.events.map(e=>e.patch))],rms:Math.sqrt(energy/count/2),truncated:stats.truncated});
  yield voices.length/(score.voices.length+1);
 }
 // Echo ring at EDL×16 ms. Two laps prime the buffer so the loop is seamless.
 const {delay=4,feedback=30,volume=64,fir=[127,0,0,0,0,0,0,0]}=score.echo??{};
 const size=Math.max(1,delay*512),ringL=new Float32Array(size),ringR=new Float32Array(size),histL=new Float32Array(8),histR=new Float32Array(8);
 const left=new Float32Array(count),right=new Float32Array(count);let head=0,h=0;
 for(let lap=0;lap<2;lap++)for(let i=0;i<count;i++){
  histL[h]=ringL[head];histR[h]=ringR[head];
  let fl=0,fr=0;for(let k=0;k<8;k++){const ix=(h+1+k)&7;fl+=fir[k]*histL[ix];fr+=fir[k]*histR[ix];}
  fl/=128;fr/=128;h=(h+1)&7;
  ringL[head]=sendL[i]+fl*feedback/128;ringR[head]=sendR[i]+fr*feedback/128;head=(head+1)%size;
  if(lap){left[i]=dryL[i]+fl*volume/128;right[i]=dryR[i]+fr*volume/128;}
 }
 let peak=0;for(let i=0;i<count;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
 const gain=(score.peak??.8)/Math.max(peak,1);
 for(let i=0;i<count;i++){left[i]*=gain;right[i]*=gain;}
 for(const v of voices)v.rms*=gain;
 return {left,right,rate:spcRate,duration:count/spcRate,voices,gain};
}

export function renderSpcScoreSync(bank,score,options){const it=renderSpcScore(bank,score,options);for(;;){const r=it.next();if(r.done)return r.value;}}
