import {cp,mkdir,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifiedRom} from './release-lib.mjs';
const romPath='rom/secret-of-mana-us.sfc';
// The maintainer supplies this one cartridge for self-contained public builds.
// Validate before replacing the last successful output.
const rom=verifiedRom(await readFile(romPath));
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
// Explicit public runtime list. The archived prototype and extracted map PNGs
// are research inputs; the real game reads those maps from the selected ROM.
const files=['index.html','engine.html','scenes.html','styles.css','engine','vendor','tools/rom','CREDITS.md','LICENSE','docs',
  'assets/sprites/kai-planet.png','assets/sprites/kai-npcs.png','assets/sprites/kai-planet.json',
  'assets/sprites/npcs.png','assets/sprites/rabite.png',
  'assets/sprites/vegeta-trial.png','assets/sprites/vegeta-trial.source.json',
  'assets/sprites/time-chamber.png','assets/sprites/time-chamber.source.json',
  'assets/sprites/vegeta-movement.png','assets/sprites/vegeta-movement.source.json',
  'assets/sprites/vegeta.png','assets/sprites/vegeta.source.json',
  'assets/sprites/goku-ssj-hair.png','assets/sprites/vegeta-ssj-hair.png','assets/sprites/saiyan-hair.source.json',
  'assets/sprites/frieza.png','assets/sprites/frieza.json','assets/sprites/frieza-full-power.png','assets/sprites/frieza-full-power.json','assets/sprites/dragon-balls.png','assets/sprites/death-ball.png','assets/sprites/ki-art.json','assets/sprites/goku.png','assets/sprites/ssj.png','assets/sprites/shenron.png','assets/sprites/shenron.json',
  'assets/social','assets/audio/kamehameha-charge.wav','assets/audio/kamehameha-release.wav','assets/audio/kamehameha-jp.json','assets/audio/dbz','assets/audio/music'];
for(const file of files){
  await mkdir(`dist/${file.split('/').slice(0,-1).join('/')}`,{recursive:true});
  await cp(file,`dist/${file}`,{recursive:true});
}
await mkdir('dist/rom',{recursive:true});await writeFile(`dist/${romPath}`,rom);
// Windows readdir uses backslashes; use URL-style paths for the allowlist
// and build hash so every platform packages the same module graph.
const publicFiles=(await readdir('dist',{recursive:true})).map(file=>file.replaceAll('\\','/'));
for(const file of publicFiles)if(file!==romPath&&/(^|\/)(\.|node_modules)|\.(sfc|smc|srm|state|zip)$/i.test(file))throw Error(`Unexpected private or cartridge file in build: ${file}`);
// Version the complete module graph, not just lab.js: a cached imported mod
// must not silently keep old controls beside a newly deployed player.
const sourceFiles=publicFiles.filter(file=>/\.(js|mjs|css|html|json)$/.test(file)).sort(),hash=createHash('sha256');
for(const file of sourceFiles)hash.update(file).update(await readFile(`dist/${file}`));
const version=hash.digest('hex').slice(0,10);
for(const file of sourceFiles){
 let source=await readFile(`dist/${file}`,'utf8');
 if(/\.(js|mjs)$/.test(file))source=source.replace(/((?:from\s*|import\s*\(|new URL\s*\(|fetch\s*\()\s*['"])(\.{1,2}\/[^'"\s]+\.(?:js|mjs|json))(['"])/g,`$1$2?v=${version}$3`);
 if(file.endsWith('.html'))source=source.replace(/((?:src|href)=["'])([^"'?#]+\.(?:js|css))(["'])/g,`$1$2?v=${version}$3`).replace('id="build-id">development','id="build-id">'+version);
 await writeFile(`dist/${file}`,source);
}
await writeFile('dist/.nojekyll','');
console.log(`Built dist/ (${version}) — public player, emulator, mod assets and verified bundled ROM. No checkpoints or private fixtures.`);
