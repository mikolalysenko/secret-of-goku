import {cp,mkdir,rm,readdir,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
// Explicit public runtime list. The archived prototype and extracted map PNGs
// are research inputs; the real game reads those maps from the selected ROM.
const files=['index.html','engine.html','styles.css','engine','vendor','tools/rom','CREDITS.md','LICENSE','docs',
  'assets/sprites/goku.png','assets/sprites/ssj.png',
  'assets/audio/kamehameha-charge.wav','assets/audio/kamehameha-release.wav','assets/audio/kamehameha-jp.json'];
for(const file of files){
  await mkdir(`dist/${file.split('/').slice(0,-1).join('/')}`,{recursive:true});
  await cp(file,`dist/${file}`,{recursive:true});
}
for(const file of await readdir('dist',{recursive:true}))if(/(^|\/)(\.|node_modules)|\.(sfc|smc|srm|state|zip)$/i.test(file))throw Error(`Private or cartridge file in build: ${file}`);
await writeFile('dist/.nojekyll','');
console.log('Built dist/ — public player, emulator and mod assets only. No ROMs or checkpoints.');
