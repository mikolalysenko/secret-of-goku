// Deterministic color-key conversion. Source sheets and their credits stay intact.
import { PNG } from 'pngjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await mkdir('assets/sprites', { recursive: true });
const keys = {
  goku: [[42,150,108], [52,188,136], [35,127,90], [71,255,187]],
  ssj: [[42,150,108], [52,188,136], [35,127,90], [71,255,187]],
  npcs: [[0,128,128]], characters: [[0,128,128]],
  mantis: [[255,255,255]], rabite: [[192,255,192]],
};
for (const [name, colors] of Object.entries(keys)) {
  const png = PNG.sync.read(await readFile(`assets/source/${name}.png`));
  // The flat green mat in the GBA sheets has slightly different border colors.
  for (let i=0; i<png.data.length; i+=4) {
    const [r,g,b] = png.data.subarray(i,i+3);
    if (colors.some(c=>c[0]===r&&c[1]===g&&c[2]===b)) png.data[i+3]=0;
  }
  await writeFile(`assets/sprites/${name}.png`, PNG.sync.write(png));
  console.log(`${name}: ${png.width} × ${png.height}`);
}
