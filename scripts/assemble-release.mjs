import {cp, mkdir, readdir, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {writeChecksums} from './release-lib.mjs';

const [source, destination] = process.argv.slice(2);
if (!source || !destination || resolve(source) === resolve(destination)) throw Error('Usage: node scripts/assemble-release.mjs <download-directory> <new-output-directory>');
await mkdir(destination); // Refuse to mix an existing release with this one.
const names = new Set();
async function collect(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    if ((await stat(path)).isDirectory()) await collect(path);
    else if (/\.(zip|tar\.gz|AppImage)$/.test(name)) {
      if (names.has(name)) throw Error(`Duplicate release filename: ${name}`);
      names.add(name); await cp(path, join(destination, name));
    }
  }
}
await collect(source);
await writeChecksums(destination);
console.log(`Assembled ${names.size} archives with SHA256SUMS.`);
