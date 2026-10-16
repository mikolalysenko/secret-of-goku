import {readFile, writeFile, mkdir, cp, rm, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, join} from 'node:path';
import {inspectRom, normalizeRom, US_ROM} from '../tools/rom/rom.mjs';

export const releaseHelp = `Usage: npm run release -- [options]
  --platform linux|mac|windows   Default: current host
  --arch x64|arm64               Default: current host
  --profile desktop|steam-deck|bazzite
  --rom /path/to/game.sfc        Default: .local/rom/secret-of-mana-us.sfc
  --archive-only                ZIP / tar.gz only (also allows cross-packaging)
  --stage-only                  Prepare the offline app without packaging
  --help

Examples:
  npm run release -- --platform linux --arch x64 --profile steam-deck
  npm run release -- --platform linux --arch x64 --profile bazzite
  npm run release -- --platform mac --arch arm64
  npm run release -- --platform windows --arch x64

All builds include the verified local ROM. Alternatively set RELEASE_ROM_URL
to a private HTTPS download URL. Nothing is committed, tagged or published.
Artifacts and SHA256SUMS are written under release/<version>/<profile>-<platform>-<arch>/.`;

export function parseReleaseArgs(argv, host = process.platform, hostArch = process.arch) {
  const options = {platform: ({darwin: 'mac', win32: 'windows', linux: 'linux'})[host], arch: hostArch, profile: 'desktop', rom: '.local/rom/secret-of-mana-us.sfc', archiveOnly: false, stageOnly: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') return {help: true};
    if (arg === '--archive-only') options.archiveOnly = true;
    else if (arg === '--stage-only') options.stageOnly = true;
    else if (['--platform', '--arch', '--profile', '--rom'].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = argv[++i];
    } else throw Error(`Unknown option: ${arg}`);
  }
  if (!['linux', 'mac', 'windows'].includes(options.platform)) throw Error('Platform must be linux, mac or windows');
  if (!['x64', 'arm64'].includes(options.arch)) throw Error('Architecture must be x64 or arm64');
  if (!['desktop', 'steam-deck', 'bazzite'].includes(options.profile)) throw Error('Unknown release profile');
  if (options.profile !== 'desktop' && (options.platform !== 'linux' || options.arch !== 'x64')) throw Error('Steam Deck and Bazzite profiles require Linux x64');
  if (!options.stageOnly && options.platform === 'mac' && host !== 'darwin') throw Error('macOS releases must be built on macOS');
  if (!options.stageOnly && options.platform === 'linux' && host !== 'linux' && !options.archiveOnly) throw Error('Build AppImages on Linux, or use --archive-only for a portable tar.gz');
  return options;
}

export function verifiedRom(source) {
  if (inspectRom(source).sha256 !== US_ROM.sha256) throw Error('Release requires the original Secret of Mana (USA) ROM');
  return normalizeRom(source).bytes;
}

export async function loadReleaseRom(file, downloadUrl) {
  try {return verifiedRom(await readFile(file));}
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!downloadUrl) throw Error('Release ROM missing. Run npm run rom:import -- /path/to/your/rom, pass --rom, or set RELEASE_ROM_URL.');
  }
  // Keep private URLs out of logs, package metadata and generated config files.
  let bytes;
  try {
    if (new URL(downloadUrl).protocol !== 'https:') throw Error();
    const response = await fetch(downloadUrl, {signal: AbortSignal.timeout(60000)});
    if (!response.ok || new URL(response.url).protocol !== 'https:') throw Error();
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 2097152 + 512) throw Error();
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  } catch {throw Error('Could not download release ROM from RELEASE_ROM_URL (expected a raw .sfc/.smc over HTTPS).');}
  return verifiedRom(bytes);
}

export async function stageRelease({root, stage, options, rom, metadata}) {
  // Only the stage owned by this profile is replaced. Saves and other builds stay put.
  await rm(stage, {recursive: true, force: true});
  await mkdir(join(stage, 'desktop'), {recursive: true});
  await cp(join(root, 'dist'), join(stage, 'game'), {recursive: true});
  await cp(join(root, 'desktop/player.css'), join(stage, 'game/desktop-player.css'));
  const indexPath = join(stage, 'game/index.html');
  const index = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, index.replace('</head>', '  <link rel="stylesheet" href="desktop-player.css">\n</head>'));
  for (const name of ['main.mjs', 'runtime.mjs']) await cp(join(root, 'desktop', name), join(stage, 'desktop', name));
  for (const name of ['LICENSE', 'CREDITS.md']) await cp(join(root, name), join(stage, name));
  await cp(join(root, 'desktop/PLAYING.md'), join(stage, 'PLAYING.md'));
  await writeFile(join(stage, 'desktop/profile.json'), JSON.stringify({profile: options.profile}) + '\n');
  await writeFile(join(stage, 'package.json'), JSON.stringify({
    name: metadata.name, version: metadata.version, type: 'module', main: 'desktop/main.mjs',
    description: 'Secret of Mana. With Goku. A vibe coded fan game, not intended for commercial purposes.',
    author: 'Mikola Lysenko and contributors', license: 'MIT',
  }, null, 2) + '\n');
  await mkdir(join(stage, 'game/rom'), {recursive: true});
  await writeFile(join(stage, 'game/rom/secret-of-mana-us.sfc'), rom);
  verifiedRom(await readFile(join(stage, 'game/rom/secret-of-mana-us.sfc')));
}

export function buildConfig({root, stage, output, options, electronVersion}) {
  const label = options.profile === 'desktop' ? options.platform : options.profile;
  return {
    appId: 'org.secret-of-goku.game', productName: 'Secret of Goku', electronVersion,
    directories: {app: stage, output, buildResources: join(root, 'desktop')},
    artifactName: `secret-of-goku-\${version}-${label}-\${arch}.\${ext}`,
    asar: true, npmRebuild: false, files: ['package.json', 'desktop/**', 'game/**', 'LICENSE', 'CREDITS.md', 'PLAYING.md'],
    // These are archives, not installers; saves live in the OS user-data folder.
    mac: {target: ['zip'], category: 'public.app-category.role-playing-games'},
    win: {target: ['zip'], signAndEditExecutable: false},
    linux: {
      target: options.archiveOnly ? ['tar.gz'] : ['AppImage', 'tar.gz'], category: 'Game', executableName: 'secret-of-goku',
      extraFiles: [{from: join(root, 'desktop/linux'), to: '.', filter: ['*.sh']}],
      desktop: {entry: {Name: 'Secret of Goku', Comment: 'Secret of Mana. With Goku.', Categories: 'Game;RolePlaying;'}},
    },
  };
}

export async function writeChecksums(directory) {
  const files = (await readdir(directory)).filter(file => /\.(zip|tar\.gz|AppImage)$/.test(file)).sort();
  if (!files.length) throw Error('No release archives were produced');
  const hashes = [];
  for (const file of files) hashes.push(`${createHash('sha256').update(await readFile(join(directory, file))).digest('hex')}  ${file}`);
  await writeFile(join(directory, 'SHA256SUMS'), hashes.join('\n') + '\n');
  return files;
}
