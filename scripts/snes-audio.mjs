// Shared, deliberately gritty sample treatment for the added DBZ recordings.
// This approximates a low-bandwidth SNES sample bank, not an SPC/BRR encoder.
export const snesAudio={rate:16000,bits:10,lowpass:5600};
export const snesAudioDescription='Mono 16 kHz, 5.6 kHz low-pass, 10-bit quantization stored as 16-bit PCM. A consistent SNES-style sample-bank aesthetic; not hardware BRR encoding.';
export function snesWav(samples){
  const b=Buffer.alloc(44+samples.length*2),rate=snesAudio.rate;
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);
  // Keep the same gain/headroom as the clean mix, including loop boundaries.
  samples.forEach((v,i)=>b.writeInt16LE(Math.round(Math.max(-.8,Math.min(.8,v))*512)*64,44+i*2));
  return b;
}
