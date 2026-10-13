import {cp,mkdir,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
// Explicit public runtime list. The archived prototype and extracted map PNGs
// are research inputs; the real game reads those maps from the selected ROM.
const files=['index.html','engine.html','styles.css','engine','vendor','tools/rom','CREDITS.md','LICENSE','docs',
  'assets/sprites/goku.png','assets/sprites/ssj.png',
  'assets/audio/kamehameha-charge.wav','assets/audio/kamehameha-release.wav','assets/audio/kamehameha-jp.json','assets/audio/dbz'];
for(const file of files){
  await mkdir(`dist/${file.split('/').slice(0,-1).join('/')}`,{recursive:true});
  await cp(file,`dist/${file}`,{recursive:true});
}
const publicFiles=await readdir('dist',{recursive:true});
for(const file of publicFiles)if(/(^|\/)(\.|node_modules)|\.(sfc|smc|srm|state|zip)$/i.test(file))throw Error(`Private or cartridge file in build: ${file}`);
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
console.log(`Built dist/ (${version}) — public player, emulator and mod assets only. No ROMs or checkpoints.`);
