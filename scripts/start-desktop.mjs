import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prepared = spawnSync(process.execPath, ['scripts/release.mjs', '--stage-only'], {cwd: root, stdio: 'inherit'});
if (prepared.error || prepared.status !== 0) process.exit(prepared.status || 1);
const platform = {darwin: 'mac', win32: 'windows', linux: 'linux'}[process.platform];
const electron = createRequire(import.meta.url)('electron');
const launched = spawnSync(electron, [resolve(root, `.local/desktop/desktop-${platform}-${process.arch}`), ...process.argv.slice(2)], {cwd: root, stdio: 'inherit'});
if (launched.error) console.error(launched.error.message);
process.exitCode = launched.status ?? 1;
