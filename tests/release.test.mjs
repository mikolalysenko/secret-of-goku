import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseReleaseArgs, loadReleaseRom, verifiedRom, stageRelease, writeChecksums} from '../scripts/release-lib.mjs';

test('release CLI rejects invalid or misleading platform/profile combinations', () => {
  assert.equal(parseReleaseArgs([], 'darwin', 'arm64').platform, 'mac');
  assert.equal(parseReleaseArgs(['--platform', 'linux', '--profile', 'steam-deck', '--arch', 'x64'], 'linux').profile, 'steam-deck');
  for (const args of [['--platform'], ['--platform', 'wat'], ['--arch', 'ia32'], ['--profile', 'wat'], ['--oops'],
    ['--platform', 'mac'], ['--platform', 'windows', '--profile', 'steam-deck'], ['--platform', 'linux', '--arch', 'arm64', '--profile', 'bazzite']]) {
    assert.throws(() => parseReleaseArgs(args, 'linux', 'x64'), undefined, args.join(' '));
  }
  assert.throws(() => parseReleaseArgs(['--platform', 'linux'], 'darwin'));
  assert.equal(parseReleaseArgs(['--platform', 'linux', '--archive-only'], 'darwin').archiveOnly, true);
});

test('release cannot silently omit a missing or invalid ROM', async () => {
  await assert.rejects(loadReleaseRom(join(tmpdir(), 'missing-secret-of-goku-rom.sfc')), /Release ROM missing/);
  assert.throws(() => verifiedRom(new Uint8Array(2097152)));
  await assert.rejects(loadReleaseRom(join(tmpdir(), 'missing-secret-of-goku-rom.sfc'), 'http://private.invalid/secret'), error => {
    assert.match(error.message, /Could not download/); assert.equal(error.message.includes('private.invalid'), false); return true;
  });
});

const romPath = '.local/rom/secret-of-mana-us.sfc';
test('offline staging includes a verified ROM and preserves the source build', {skip: !existsSync(romPath)}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'goku-release-'));
  try {
    const root = join(temporary, 'repo'), stage = join(temporary, 'stage');
    await mkdir(join(root, 'dist'), {recursive: true}); await mkdir(join(root, 'desktop'));
    for (const name of ['LICENSE', 'CREDITS.md', 'desktop/main.mjs', 'desktop/runtime.mjs', 'desktop/player.css', 'desktop/PLAYING.md']) await writeFile(join(root, name), 'fixture');
    await writeFile(join(root, 'dist/index.html'), '<html><head></head><body></body></html>');
    const source = await readFile(romPath), headered = Buffer.concat([Buffer.alloc(512), source]);
    const rom = verifiedRom(headered);
    assert.equal(rom.length, 2097152);
    await stageRelease({root, stage, options: {profile: 'bazzite'}, rom, metadata: {name: 'secret-of-goku', version: '0.1.0'}});
    assert.deepEqual(await readFile(join(stage, 'game/rom/secret-of-mana-us.sfc')), Buffer.from(rom));
    assert.deepEqual(JSON.parse(await readFile(join(stage, 'desktop/profile.json'))), {profile: 'bazzite'});
    await assert.rejects(access(join(root, 'dist/rom')));
    assert.match(await readFile(join(stage, 'game/index.html'), 'utf8'), /desktop-player.css/);
    assert.doesNotMatch(await readFile(join(root, 'dist/index.html'), 'utf8'), /desktop-player.css/);
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('release checksums cover distributable archives only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goku-checksums-'));
  try {
    await writeFile(join(directory, 'game.zip'), 'release'); await writeFile(join(directory, 'builder-debug.yml'), 'not public');
    const files = await writeChecksums(directory);
    assert.deepEqual(files, ['game.zip']);
    assert.equal(await readFile(join(directory, 'SHA256SUMS'), 'utf8'), `${createHash('sha256').update('release').digest('hex')}  game.zip\n`);
  } finally {await rm(directory, {recursive: true, force: true});}
});
