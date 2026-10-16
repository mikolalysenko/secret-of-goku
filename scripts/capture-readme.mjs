// Curated, spoiler-free promotional media only. Raw frames stay in .local/.
import {chromium} from '@playwright/test';
import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve, join} from 'node:path';

const option = (name, fallback) => {const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1];};
const url = option('--url', 'http://127.0.0.1:5173/');
const fixture = option('--fixture', '.local/animation-audit/native/rabite-field-a.json');
const output = resolve('assets/readme'), scratch = resolve('.local/readme-capture');
await mkdir(output, {recursive: true}); await mkdir(scratch, {recursive: true});
const browser = await chromium.launch({channel: process.env.CI ? 'chromium' : 'chrome', headless: true});
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'inherit'});
  if (result.error || result.status !== 0) throw Error('ffmpeg failed; install ffmpeg before capturing README media');
}
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await page.goto(url); await page.waitForFunction(() => window.mana?.ready);
  await page.evaluate(() => {mana.pause(); mana.run(960);});
  const png = async path => {
    const data = await page.evaluate(() => document.querySelector('#screen').toDataURL('image/png').split(',')[1]);
    await writeFile(path, Buffer.from(data, 'base64'));
  };
  await png(join(scratch, 'title.png'));
  ffmpeg(['-i', join(scratch, 'title.png'), '-vf', 'crop=512:448:0:14', '-frames:v', '1', join(output, 'title-screen.png')]);

  const state = JSON.parse(await readFile(fixture, 'utf8'));
  const clips = [
    {name: 'instant-transmission', sequence: [[24, []], [6, [10, 0]], [36, []], [30, [0]], [36, []], [6, [10, 0]], [42, []], [24, [0]], [30, []]]},
    {name: 'ki-blasts', sequence: [[24, []], [54, [1]], [66, []]]},
    {name: 'kamehameha', sequence: [[24, []], [102, [10, 1]], [90, []]]},
  ];
  for (const clip of clips) {
    const directory = join(scratch, clip.name);
    await rm(directory, {recursive: true, force: true}); await mkdir(directory);
    await page.evaluate(state => {
      mana.pause(); state.romHash = mana.hash(mana.snes.cart.data); mana.restore(state);
      Object.assign(mana.mod.options, {enabled: true, power: true, superSaiyan: false});
      mana.run(3); mana.run(5, [7]); mana.run(3);
    }, state);
    let frame = 0;
    for (const [count, buttons] of clip.sequence) for (let i = 0; i < count; i += 3) {
      await page.evaluate(({frames, buttons}) => mana.run(frames, buttons), {frames: Math.min(3, count - i), buttons});
      await png(join(directory, `${String(frame++).padStart(4, '0')}.png`));
    }
    ffmpeg(['-framerate', '20', '-i', join(directory, '%04d.png'), '-filter_complex',
      '[0:v]crop=512:448:0:14,scale=256:224:flags=neighbor,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
      '-loop', '0', join(output, `${clip.name}.gif`)]);
    if (clip.name === 'kamehameha') ffmpeg(['-i', join(directory, '0045.png'), '-vf', 'crop=512:448:0:14', '-frames:v', '1', join(output, 'kamehameha.png')]);
    console.log(`Captured ${clip.name}: ${frame} frames, ${(frame / 20).toFixed(1)} seconds.`);
  }
} finally {await browser.close();}
