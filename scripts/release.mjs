import {readFile, mkdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {releaseHelp, parseReleaseArgs, loadReleaseRom, stageRelease, buildConfig, writeChecksums} from './release-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const options = parseReleaseArgs(process.argv.slice(2));
  if (options.help) console.log(releaseHelp);
  else {
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const rom = await loadReleaseRom(resolve(root, options.rom), process.env.RELEASE_ROM_URL);
    const id = `${options.profile}-${options.platform}-${options.arch}`;
    const stage = join(root, '.local/desktop', id), output = join(root, 'release', metadata.version, id);
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], {cwd: root, stdio: 'inherit'});
    if (result.error || result.status !== 0) throw Error('Runtime build failed');
    await stageRelease({root, stage, options, rom, metadata});
    console.log(`Staged offline ${id} app with verified ROM: ${stage}`);
    if (!options.stageOnly) {
      // GitHub exposes absent optional secrets as empty strings. An empty
      // CSC_LINK is interpreted as the current directory, not "no signing".
      for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
        if (process.env[key] === '') delete process.env[key];
      }
      const require = createRequire(import.meta.url);
      const {build, Platform, Arch} = require('electron-builder');
      const platform = {linux: Platform.LINUX, mac: Platform.MAC, windows: Platform.WINDOWS}[options.platform];
      // A rerun must not mix older archives or checksums into this release.
      await rm(output, {recursive: true, force: true});
      await mkdir(output, {recursive: true});
      const electronVersion = require('electron/package.json').version;
      await build({config: buildConfig({root, stage, output, options, electronVersion}),
        targets: platform.createTarget(undefined, Arch[options.arch]), publish: 'never'});
      const files = await writeChecksums(output);
      console.log(`Release ready in ${output}:\n${files.join('\n')}\nSHA256SUMS`);
    }
  }
} catch (error) {console.error(`Release failed: ${error.message}`); process.exit(1);}
