// BRR codec for the S-DSP, plus resampling helpers for the audio generator.
//
// Block: header (shift<<4 | filter<<2 | loop<<1 | end) + 8 bytes = 16 nibbles,
// high nibble first. Samples are 15-bit (the hardware keeps them doubled);
// the decoder below is bit-exact with the S-DSP, including the 16-bit clamp
// and 15-bit wrap after the filter, so the encoder can search against it.
export const BRR_BLOCK=9,BRR_SAMPLES=16;

export function brrDecodeSample(nibble,shift,filter,p1,p2){
 let s=nibble>7?nibble-16:nibble;
 s=shift<=12?(s<<shift)>>1:(s<0?-2048:0);
 if(filter===1)s+=p1+((-p1)>>4);
 else if(filter===2)s+=2*p1+((-p1*3)>>5)-p2+(p2>>4);
 else if(filter===3)s+=2*p1+((-p1*13)>>6)-p2+((p2*3)>>4);
 s=s<-32768?-32768:s>32767?32767:s;
 return (s<<17)>>16>>1;
}

// Decode BRR bytes to 15-bit samples. Stops after a block with the END flag
// unless {all:true}. Returns {pcm, loopFlag}.
export function brrDecode(bytes,{start=0,all=false,p1=0,p2=0}={}){
 const out=[];let loop=false;
 for(let b=start;b+BRR_BLOCK<=bytes.length;b+=BRR_BLOCK){
  const h=bytes[b],shift=h>>4,filter=(h>>2)&3;
  for(let i=0;i<16;i++){
   const nib=(bytes[b+1+(i>>1)]>>(i&1?0:4))&15;
   const s=brrDecodeSample(nib,shift,filter,p1,p2);out.push(s);p2=p1;p1=s;
  }
  if(h&1){loop=(h&2)!==0;if(!all)break;}
 }
 return {pcm:Int16Array.from(out),loop};
}

// Encode one 16-sample block (targets in the 15-bit domain) with history.
// Searches every filter/shift and both nearest nibbles per sample.
function encodeBlock(target,p1,p2,filters){
 let best=null;
 for(const filter of filters){
  for(let shift=0;shift<=12;shift++){
   let q1=p1,q2=p2,err=0;const nib=new Array(16);
   const step=shift===0?0.5:(1<<shift)/2;
   for(let i=0;i<16;i++){
    // prediction with nibble 0
    const pred=brrDecodeSample(0,shift,filter,q1,q2);
    let n=Math.round((target[i]-pred)/step);
    n=n<-8?-8:n>7?7:n;
    let bestN=n,bestS=brrDecodeSample(n&15,shift,filter,q1,q2),bestE=(bestS-target[i])**2;
    for(const m of [n-1,n+1]){
     if(m<-8||m>7)continue;
     const s=brrDecodeSample(m&15,shift,filter,q1,q2),e=(s-target[i])**2;
     if(e<bestE){bestE=e;bestN=m;bestS=s;}
    }
    err+=bestE;nib[i]=bestN&15;q2=q1;q1=bestS;
    if(best&&err>=best.err)break;
   }
   if(!best||err<best.err)best={err,shift,filter,nib,p1:q1,p2:q2};
  }
 }
 return best;
}

// Encode PCM (Float32 in [-1,1] or Int16) into BRR blocks.
// options: resetAt = Set of block indices that must use filter 0 (loop or
// random-access entry points); gain applied before conversion.
// Returns {bytes:Uint8Array, blocks, snr}.
export function brrEncode(pcm,{resetAt=new Set([0]),gain=1}={}){
 const n=Math.ceil(pcm.length/16)*16||16;
 const isFloat=pcm instanceof Float32Array||pcm instanceof Float64Array;
 const target=new Float64Array(n);
 for(let i=0;i<pcm.length;i++){
  let v=(isFloat?pcm[i]*16384:pcm[i]/2)*gain;
  target[i]=v<-16384?-16384:v>16383?16383:v;
 }
 const blocks=n/16,bytes=new Uint8Array(blocks*BRR_BLOCK);
 let p1=0,p2=0,sig=0,noise=0;
 for(let b=0;b<blocks;b++){
  const t=target.subarray(b*16,b*16+16);
  const r=encodeBlock(t,p1,p2,resetAt.has(b)?[0]:[0,1,2,3]);
  bytes[b*9]=(r.shift<<4)|(r.filter<<2);
  for(let i=0;i<8;i++)bytes[b*9+1+i]=(r.nib[i*2]<<4)|r.nib[i*2+1];
  // recompute history exactly
  let q1=p1,q2=p2;
  for(let i=0;i<16;i++){const s=brrDecodeSample(r.nib[i],r.shift,r.filter,q1,q2);sig+=t[i]*t[i];noise+=(s-t[i])**2;q2=q1;q1=s;}
  p1=q1;p2=q2;
 }
 return {bytes,blocks,snr:10*Math.log10((sig+1e-9)/(noise+1e-9))};
}

// Parse a 16-bit PCM mono WAV (RIFF) into Float32 [-1,1).
export function readWav(buffer){
 const b=Buffer.from(buffer);
 if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('not a WAV file');
 let off=12,fmt=null,data=null;
 while(off+8<=b.length){
  const id=b.toString('ascii',off,off+4),size=b.readUInt32LE(off+4);
  if(id==='fmt ')fmt={format:b.readUInt16LE(off+8),channels:b.readUInt16LE(off+10),rate:b.readUInt32LE(off+12),bits:b.readUInt16LE(off+22)};
  if(id==='data')data=b.subarray(off+8,off+8+size);
  off+=8+size+(size&1);
 }
 if(!fmt||!data||fmt.format!==1||fmt.bits!==16)throw Error('expected 16-bit PCM WAV');
 const frames=data.length/2/fmt.channels,out=new Float32Array(frames);
 for(let i=0;i<frames;i++){let s=0;for(let c=0;c<fmt.channels;c++)s+=data.readInt16LE((i*fmt.channels+c)*2);out[i]=s/fmt.channels/32768;}
 return {rate:fmt.rate,pcm:out};
}

// Windowed-sinc (Kaiser) resampler with an explicit cutoff (Hz). With
// {length} the output has exactly that many samples (a tiny time stretch);
// {circular} treats the input as one period of a loop, so the seam stays
// seamless.
export function resample(pcm,from,to,{cutoff=Math.min(from,to)*0.47,taps=48,beta=8,length=null,circular=false}={}){
 if(from===to&&!length)return Float32Array.from(pcm);
 const len=length??Math.round(pcm.length*to/from),ratio=len/pcm.length,out=new Float32Array(len);
 const fc=cutoff/from; // normalized to input rate
 const bessel=x=>{let s=1,t=1;for(let k=1;k<30;k++){t*=(x/2/k)**2;s+=t;}return s;};
 const i0b=bessel(beta);
 for(let j=0;j<len;j++){
  const x=j/ratio,c=Math.floor(x);let acc=0,wsum=0;
  for(let k=c-taps+1;k<=c+taps;k++){
   if(!circular&&(k<0||k>=pcm.length))continue;
   const d=x-k,r=d/taps;if(Math.abs(r)>=1)continue;
   const w=bessel(beta*Math.sqrt(1-r*r))/i0b;
   const s=d===0?2*fc:Math.sin(2*Math.PI*fc*d)/(Math.PI*d);
   acc+=pcm[circular?((k%pcm.length)+pcm.length)%pcm.length:k]*s*w;wsum+=s*w;
  }
  out[j]=wsum?acc/wsum:0;
 }
 return out;
}
