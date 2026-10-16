// Curated, spoiler-free promotional media only. Raw frames stay in .local/.
import {chromium} from '@playwright/test';
import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve, join} from 'node:path';

const option = (name, fallback) => {const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1];};
const url = option('--url', 'http://127.0.0.1:5173/');
const fixture = option('--fixture', '.local/animation-audit/native/rabite-field-solo.json');
const selected = option('--scene', 'all');
const output = resolve('assets/readme'), scratch = resolve('.local/readme-capture');
// Select ordinary scenery with the native door loader, then use real controls.
// No story scenes, bosses, late-game locations, or forced transformations.
const clips = [
  {name: 'instant-transmission', map: 67, x: 20, y: 26, actions: ['teleport'],
    sequence: [[24, []], [6, [10, 0]], [36, []], [12, [6]], [12, []], [6, [10, 0]], [36, []], [12, [7]], [6, [10, 0]], [36, []]]},
  {name: 'ki-blasts', map: 302, x: 15, y: 15, actions: ['blast'],
    sequence: [[18, []], [3, [7]], [36, [1]], [3, [6]], [36, [1]], [3, [4]], [36, [1]], [27, []]]},
  {name: 'kamehameha', map: 286, x: 16, y: 18, actions: ['charge', 'beam'],
    sequence: [[24, []], [3, [7]], [102, [10, 1]], [90, []]]},
  {name: 'flight', map: 25, x: 22, y: 60, actions: ['flight'],
    sequence: [[24, []], [12, [8, 4]], [12, []], [12, [8, 7]], [24, []], [12, [8, 6]], [12, []], [12, [8, 5]], [30, []]]},
  {name: 'punch', map: 28, x: 14, y: 20, position: {x: 232, y: 322, terrain: 2}, actions: ['punch'],
    sequence: [[18, []], [3, [4]], [3, [0]], [45, []], [30, [4]], [6, [0]], [36, []]]},
  {name: 'power-up', map: 109, x: 10, y: 15, actions: ['focus'],
    sequence: [[24, []], [90, [10]], [18, [10, 6]], [18, [10, 7]], [30, []]]},
];
if (selected !== 'all' && !clips.some(clip => clip.name === selected)) throw Error(`Unknown scene: ${selected}`);
await mkdir(output, {recursive: true}); await mkdir(scratch, {recursive: true});
const browser = await chromium.launch({channel: process.env.CI ? 'chromium' : 'chrome', headless: true});
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'inherit'});
  if (result.error || result.status !== 0) throw Error('ffmpeg failed; install ffmpeg before capturing README media');
}
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url); await page.waitForFunction(() => window.mana?.ready);
  await page.evaluate(() => {mana.pause(); mana.run(960);});
  const png = async path => {
    const data = await page.evaluate(() => document.querySelector('#screen').toDataURL('image/png').split(',')[1]);
    await writeFile(path, Buffer.from(data, 'base64'));
  };
  if (!process.argv.includes('--skip-title')) {
    await png(join(scratch, 'title.png'));
    ffmpeg(['-i', join(scratch, 'title.png'), '-vf', 'crop=512:448:0:14', '-frames:v', '1', join(output, 'title-screen.png')]);
  }

  const state = JSON.parse(await readFile(fixture, 'utf8'));
  const proof = [];
  for (const clip of clips.filter(clip => selected === 'all' || clip.name === selected)) {
    const directory = join(scratch, clip.name);
    await rm(directory, {recursive: true, force: true}); await mkdir(directory);
    await page.evaluate(({state, clip}) => {
      mana.pause(); state.romHash = mana.hash(mana.snes.cart.data); mana.restore(state);
      Object.assign(mana.mod.options, {enabled: true, power: true, superSaiyan: false});
      mana.run(3);
      const cart = mana.snes.cart.data, event = cart.slice(0x742b0, 0x742b5), door = cart.slice(0x8300c, 0x83010);
      try {
        cart.set([4, 24, 3, 5, 0], 0x742b0);
        cart.set([clip.map & 255, clip.x * 2 + (clip.map >> 8), clip.y * 2 + (clip.layer || 0), 0], 0x8300c);
        mana.write8(0xd1, 0xb0); mana.write8(0xd2, 0x42); mana.write8(0xd3, 0xc7); mana.write8(0xd0, 1);
        mana.run(240);
      } finally {cart.set(event, 0x742b0); cart.set(door, 0x8300c);}
      // These are already-learned techniques: omit first-use tutorial dialogue.
      mana.mod.powerIntro.restore({flight: true, superShown: true});
      mana.mod.radio.restore({firstFlight: true});
      if (clip.position) {
        const {x, y, terrain} = clip.position;
        mana.write16(0xe002, x); mana.write16(0xe004, y); mana.write8(0xe00b, terrain);
        mana.mod.localFlightHook.restore(); mana.mod.teleport.follow({x, y, terrain});
      }
      mana.run(30);
      if (mana.mod.status.map !== clip.map || !mana.mod.canAttack) throw Error(`Scene ${clip.name} is not ready for player control`);
    }, {state, clip});
    let frame = 0; const actions = new Set(), maps = new Set();
    for (const [count, buttons] of clip.sequence) for (let i = 0; i < count; i += 3) {
      const sample = await page.evaluate(({frames, buttons}) => {
        mana.run(frames, buttons);
        return {action: mana.mod.action?.kind, flying: mana.mod.localFlight, map: mana.mod.status.map};
      }, {frames: Math.min(3, count - i), buttons});
      if (sample.action) actions.add(sample.action); if (sample.flying) actions.add('flight'); maps.add(sample.map);
      await png(join(directory, `${String(frame++).padStart(4, '0')}.png`));
    }
    if (clip.actions.some(action => !actions.has(action))) throw Error(`Missing technique in ${clip.name}: ${[...actions]}`);
    if (maps.size !== 1 || !maps.has(clip.map)) throw Error(`Unexpected area transition in ${clip.name}`);
    ffmpeg(['-framerate', '20', '-i', join(directory, '%04d.png'), '-filter_complex',
      '[0:v]crop=512:448:0:14,scale=256:224:flags=neighbor,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
      '-loop', '0', join(output, `${clip.name}.gif`)]);
    proof.push({name: clip.name, map: clip.map, frames: frame, seconds: frame / 20, actions: [...actions]});
    console.log(`Captured ${clip.name}: ${frame} frames, ${(frame / 20).toFixed(1)} seconds.`);
  }
  if (errors.length) throw Error(`Game errors during capture: ${errors.join('; ')}`);
  await writeFile(join(scratch, `proof-${selected}.json`), JSON.stringify(proof, null, 2));
} finally {await browser.close();}
