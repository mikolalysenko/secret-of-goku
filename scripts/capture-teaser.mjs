// Spoiler-free release teaser: real gameplay, frame-synchronous game audio,
// square social export. Recordings and proof stay under ignored .local/.
// Run a local server first, then: node scripts/capture-teaser.mjs
// --capture-only / --render-only split the two passes for editorial changes.
import {chromium} from '@playwright/test';
import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {resolve, join} from 'node:path';

const option = (name, fallback) => {const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1];};
const version = option('--version', '0.2.5');
const root = resolve(option('--out', `.local/teaser-${version}`));
const url = option('--url', 'http://127.0.0.1:5187/');
const fixture = option('--fixture', '.local/animation-audit/native/rabite-field-solo.json');
const fps = 60, endFrames = 204;
const clips = [
  {name: 'punch', caption: 'WITH GOKU.', map: 28, x: 14, y: 20,
    position: {x: 232, y: 322, terrain: 2}, actions: ['punch'],
    sequence: [[6, []], [3, [4]], [51, [0]], [30, [4]], [51, [0]], [21, []]]},
  {name: 'flight', caption: 'TAKE FLIGHT', map: 25, x: 22, y: 60, actions: ['flight'],
    sequence: [[12, []], [18, [8, 4]], [12, []], [18, [8, 7]], [24, []], [18, [8, 6]], [12, []], [18, [8, 5]], [30, []]]},
  {name: 'ki-blasts', caption: 'KI BLASTS', map: 302, x: 15, y: 15, actions: ['blast'],
    sequence: [[9, []], [3, [7]], [48, [1]], [3, [6]], [48, [1]], [3, [4]], [48, [1]], [18, []]]},
  {name: 'instant-transmission', caption: 'INSTANT TRANSMISSION', map: 67, x: 20, y: 26, actions: ['teleport'],
    sequence: [[12, []], [6, [10, 0]], [36, []], [12, [6]], [12, []], [6, [10, 0]], [36, []], [12, [7]], [6, [10, 0]], [36, []]]},
  {name: 'power-up', caption: 'POWER UP', map: 109, x: 10, y: 15, actions: ['focus'],
    sequence: [[12, []], [108, [10]], [18, [10, 6]], [18, [10, 7]], [42, []]]},
  {name: 'kamehameha', caption: 'KAMEHAMEHA!', map: 286, x: 16, y: 18, actions: ['charge', 'beam'],
    sequence: [[12, []], [3, [7]], [234, [10, 1]], [150, []]]},
];
for (const clip of clips) clip.frames = clip.sequence.reduce((n, [frames]) => n + frames, 0);
await mkdir(root, {recursive: true});
const browser = await chromium.launch({channel: process.env.CI ? 'chromium' : 'chrome', headless: true});
const ffmpeg = args => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'inherit'});
  if (r.error || r.status !== 0) throw Error('ffmpeg failed');
};

async function capture() {
  const currentVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
  if (currentVersion !== version) throw Error(`Requested ${version}, but the checked-out runtime is ${currentVersion}`);
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.waitForFunction(() => window.mana?.ready, null, {timeout: 60000});
  await page.evaluate(() => {mana.pause(); mana.run(960);});
  await writeFile(join(root, 'title.png'), Buffer.from(await page.evaluate(() => document.querySelector('#screen').toDataURL('image/png').split(',')[1]), 'base64'));
  const state = JSON.parse(await readFile(fixture, 'utf8')), proof = [];
  for (const clip of clips) {
    const sequence = [...clip.sequence, ...(clip === clips.at(-1) ? [[endFrames, []]] : [])];
    const capturedFrames = sequence.reduce((n, [frames]) => n + frames, 0);
    const dir = join(root, clip.name);
    await rm(dir, {recursive: true, force: true}); await mkdir(dir);
    await page.evaluate(({state, clip}) => {
      mana.pause(); state.romHash = mana.hash(mana.snes.cart.data); mana.restore(state);
      Object.assign(mana.mod.options, {enabled: true, power: true, superSaiyan: false}); mana.run(3);
      const cart = mana.snes.cart.data, event = cart.slice(0x742b0, 0x742b5), door = cart.slice(0x8300c, 0x83010);
      try {
        cart.set([4, 24, 3, 5, 0], 0x742b0);
        cart.set([clip.map & 255, clip.x * 2 + (clip.map >> 8), clip.y * 2, 0], 0x8300c);
        mana.write8(0xd1, 0xb0); mana.write8(0xd2, 0x42); mana.write8(0xd3, 0xc7); mana.write8(0xd0, 1); mana.run(240);
      } finally {cart.set(event, 0x742b0); cart.set(door, 0x8300c);}
      mana.mod.powerIntro.restore({flight: true, superShown: true}); mana.mod.radio.restore({firstFlight: true});
      if (clip.position) {
        const {x, y, terrain} = clip.position;
        mana.write16(0xe002, x); mana.write16(0xe004, y); mana.write8(0xe00b, terrain);
        mana.mod.localFlightHook.restore(); mana.mod.teleport.follow({x, y, terrain});
      }
      mana.run(30);
      if (mana.mod.status.map !== clip.map || !mana.mod.canAttack) throw Error(`Scene ${clip.name} is not controllable`);
    }, {state, clip});
    // Schedule the real game's effects and native DSP on the emulated clock.
    // Deferred disconnects preserve already-scheduled offline sound; a default
    // stop() means this emulated instant, not OfflineAudioContext time zero.
    await page.evaluate(async frames => {
      const real = new OfflineAudioContext(2, Math.ceil((frames / 60 + .3) * 48000), 48000);
      const rec = window.__teaser = {on: false, frame: 0, now: 0, chunks: [], real, rendering: false};
      const patchNode = node => {
        const disconnect = node.disconnect.bind(node);
        node.disconnect = (...args) => {if (rec.rendering) disconnect(...args);};
        if (node.stop) {const stop = node.stop.bind(node); node.stop = (when = rec.now) => stop(when);}
        return node;
      };
      rec.proxy = new Proxy(real, {get(t, p) {
        if (p === 'state') return 'running'; if (p === 'currentTime') return rec.now;
        const v = Reflect.get(t, p, t);
        if (typeof v !== 'function') return v;
        return (...args) => {const result = v.apply(t, args); return String(p).startsWith('create') && result?.disconnect ? patchNode(result) : result;};
      }});
      rec.runFrame = mana.snes.runFrame; rec.update = mana.sound.update;
      mana.snes.runFrame = function(...args) {
        const result = rec.runFrame.apply(this, args);
        if (rec.on) {
          const d = this.apu.dsp, n = d.sampleOffset, gain = .4 * mana.sound.nativeGain;
          rec.chunks.push([Float32Array.from(d.samplesL.subarray(0, n), x => x * gain), Float32Array.from(d.samplesR.subarray(0, n), x => x * gain)]);
          rec.now = rec.frame++ / 60;
        }
        return result;
      };
      mana.sound.update = (ctx, audible, when) => rec.on ? rec.update(rec.proxy, true, rec.now) : rec.update(ctx, audible, when);
      rec.update(rec.proxy, true, 0); await mana.sound.ready; await mana.sound.speech.ready;
      if (mana.sound.stats.error || mana.sound.speech.stats.error) throw Error('Game audio assets did not load');
      mana.sound.stats.history = []; mana.sound.speech.stats.history = [];
      rec.canvas = document.createElement('canvas'); rec.canvas.width = 256; rec.canvas.height = 224;
      rec.g = rec.canvas.getContext('2d'); rec.g.imageSmoothingEnabled = false;
      rec.on = true;
    }, capturedFrames);
    const samples = []; let frame = 0;
    for (const [count, buttons] of sequence) {
      for (let at = 0; at < count; at += 6) {
        const batch = await page.evaluate(({count, buttons}) => {
          const rec = window.__teaser, output = [];
          for (let i = 0; i < count; i++) {
            mana.run(1, buttons);
            rec.g.drawImage(document.querySelector('#screen'), 0, 14, 512, 448, 0, 0, 256, 224);
            output.push({png: rec.canvas.toDataURL('image/png').split(',')[1], map: mana.mod.status.map,
              action: mana.mod.action?.kind ?? null, flying: !!mana.mod.localFlight, controllable: mana.mod.canAttack});
          }
          return output;
        }, {count: Math.min(6, count - at), buttons});
        for (const {png, ...sample} of batch) {
          await writeFile(join(dir, `${String(frame).padStart(4, '0')}.png`), Buffer.from(png, 'base64'));
          samples.push({frame: frame++, ...sample});
        }
      }
    }
    const actions = new Set(samples.map(s => s.action)); if (samples.some(s => s.flying)) actions.add('flight');
    if (clip.actions.some(a => !actions.has(a))) throw Error(`Missing action in ${clip.name}: ${[...actions]}`);
    if (samples.some(s => s.map !== clip.map)) throw Error(`Unexpected area transition in ${clip.name}`);
    const audio = await page.evaluate(async () => {
      const rec = window.__teaser; rec.on = false;
      const length = rec.chunks.reduce((n, c) => n + c[0].length, 0);
      const buffer = rec.real.createBuffer(2, length, length / (rec.frame / 60));
      let offset = 0;
      for (const [l, r] of rec.chunks) {buffer.copyToChannel(l, 0, offset); buffer.copyToChannel(r, 1, offset); offset += l.length;}
      const source = rec.real.createBufferSource(); source.buffer = buffer; source.connect(rec.real.destination); source.start(0);
      rec.rendering = true; const rendered = await rec.real.startRendering();
      const pcm = new Int16Array(rendered.length * 2), l = rendered.getChannelData(0), r = rendered.getChannelData(1);
      let peak = 0, energy = 0;
      for (let i = 0; i < rendered.length; i++) {
        peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i])); energy += l[i] ** 2 + r[i] ** 2;
        pcm[i * 2] = Math.max(-1, Math.min(1, l[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, r[i])) * 32767;
      }
      const bytes = new Uint8Array(pcm.buffer); let binary = '';
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      mana.snes.runFrame = rec.runFrame; mana.sound.update = rec.update;
      return {base64: btoa(binary), rate: rendered.sampleRate, peak, rms: Math.sqrt(energy / pcm.length),
        sounds: mana.sound.stats.history, speech: mana.sound.speech.stats.history};
    });
    if (audio.rms < .001 || audio.peak >= 1) throw Error(`Silent or clipped audio in ${clip.name}: ${audio.rms}, ${audio.peak}`);
    const data = Buffer.from(audio.base64, 'base64'), head = Buffer.alloc(44);
    head.write('RIFF'); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16);
    head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(audio.rate, 24); head.writeUInt32LE(audio.rate * 4, 28);
    head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
    await writeFile(join(dir, 'audio.wav'), Buffer.concat([head, data]));
    const {base64, ...audioProof} = audio;
    proof.push({...clip, capturedFrames, audio: audioProof, samples});
    console.log(`Captured ${clip.name}: ${frame} frames, audio peak ${audio.peak.toFixed(3)}`);
  }
  if (errors.length) throw Error(errors.join('\n'));
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout.trim();
  await writeFile(join(root, 'proof.json'), JSON.stringify({version, revision, fps, clips: proof}, null, 2));
  await page.close();
}

async function render() {
  const page = await browser.newPage({viewport: {width: 1080, height: 1080}});
  await page.setContent('<canvas id="c" width="1080" height="1080"></canvas>');
  const title = (await readFile(join(root, 'title.png'))).toString('base64');
  await page.evaluate(async ({title, version}) => {
    const canvas = document.querySelector('#c'), g = canvas.getContext('2d');
    const load = async png => createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
    const logo = await load(title);
    function text(s, x, y, size, color, align = 'center', weight = 800) {
      g.font = `${weight} ${size}px "Avenir Next", "Arial", sans-serif`; g.fillStyle = color;
      g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
    }
    window.composeTeaser = async ({png, caption, first, end, age}) => {
      g.fillStyle = end ? '#000000' : '#090e19'; g.fillRect(0, 0, 1080, 1080);
      if (end) {
        text(`VERSION ${version}  /  OUT NOW`, 540, 142, 34, '#ffcf42');
        g.imageSmoothingEnabled = false;
        g.drawImage(logo, 96, 104, 320, 128, 60, 208, 960, 384);
        text('Secret of Mana. With Goku.', 540, 627, 43, '#f8fafc');
        g.fillStyle = '#ffcf42'; g.fillRect(142, 716, 796, 90);
        text('PLAY IN YOUR BROWSER', 540, 763, 38, '#090e19');
        text('PC  /  Mac  /  Linux  /  Steam Deck', 540, 856, 31, '#c5d2e3', 'center', 500);
        text('mikolalysenko.github.io/secret-of-goku', 540, 940, 28, '#ffcf42', 'center', 600);
        text('Unofficial fan game', 540, 1013, 22, '#8c9aae', 'center', 500);
      } else {
        text(first ? 'SECRET OF MANA.' : 'SECRET OF GOKU', 30, 49, 42, '#f8fafc', 'left');
        g.fillStyle = '#ffcf42'; g.fillRect(868, 22, 184, 54);
        text(version, 960, 51, 30, '#090e19');
        const img = await load(png); g.imageSmoothingEnabled = false;
        g.drawImage(img, 28, 100, 1024, 896); img.close();
        g.fillStyle = '#ffcf42'; g.fillRect(28, 1000, Math.min(1024, age * 24), 3);
        text(caption, 540, 1040, first ? 44 : 33, '#f8fafc');
      }
      return canvas.toDataURL('image/png').split(',')[1];
    };
  }, {title, version});
  const video = join(root, 'video-only.mp4');
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p',
    '-r', String(fps), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', video], {stdio: ['pipe', 'inherit', 'inherit']});
  const done = once(ff, 'close'); let frame = 0;
  for (const clip of [...clips, {name: 'end', frames: endFrames}]) {
    for (let age = 0; age < clip.frames; age++) {
      const png = clip.name === 'end' ? null : (await readFile(join(root, clip.name, `${String(age).padStart(4, '0')}.png`))).toString('base64');
      const result = await page.evaluate(args => composeTeaser(args), {png, caption: clip.caption, first: clip === clips[0], end: clip.name === 'end', age});
      if (!ff.stdin.write(Buffer.from(result, 'base64'))) await once(ff.stdin, 'drain');
      if (frame % 300 === 0) console.log(`Composed frame ${frame}`); frame++;
    }
  }
  ff.stdin.end(); if ((await done)[0] !== 0) throw Error('Video encode failed');
  const filters = [], labels = [], input = [];
  clips.forEach((clip, i) => {
    input.push('-i', join(root, clip.name, 'audio.wav'));
    const seconds = clip.frames / fps;
    filters.push(`[${i}:a]atrim=0:${seconds},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=${seconds - .012}:d=0.012[a${i}]`); labels.push(`[a${i}]`);
  });
  // Continue the captured final scene's native music under the end card.
  const last = clips.at(-1), endSeconds = endFrames / fps;
  filters.push(`[${clips.length - 1}:a]atrim=start=${last.frames / fps}:end=${last.frames / fps + endSeconds},asetpts=PTS-STARTPTS,volume=0.5,afade=t=in:d=0.18,afade=t=out:st=${endSeconds - .8}:d=0.8[end]`);
  filters.push(`${labels.join('')}[end]concat=n=${clips.length + 1}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=9[out]`);
  ffmpeg([...input, '-i', video, '-filter_complex', filters.join(';'), '-map', `${clips.length}:v`, '-map', '[out]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', join(root, `secret-of-goku-${version}-teaser.mp4`)]);
  await page.close(); console.log(`Wrote ${(frame / fps).toFixed(2)} seconds to ${root}`);
}

try {
  if (!process.argv.includes('--render-only')) await capture();
  if (!process.argv.includes('--capture-only')) await render();
} finally {await browser.close();}
