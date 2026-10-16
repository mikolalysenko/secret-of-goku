import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {resolveAsset, externalUrl, isAppUrl, startFullscreen} from '../desktop/runtime.mjs';

test('desktop protocol resolves game assets without exposing other files', () => {
  const root = resolve('game');
  assert.equal(resolveAsset(root, 'goku://game/'), resolve(root, 'index.html'));
  assert.equal(resolveAsset(root, 'goku://game/engine/lab.js?v=abc'), resolve(root, 'engine/lab.js'));
  for (const url of ['file:///etc/passwd', 'goku://other/index.html', 'goku://user@game/index.html', 'goku://game:42/index.html',
    'goku://game/%2e%2e%2fsecret', 'goku://game/.env', 'goku://game/foo%5c..%5csecret', 'goku://game/%00', 'goku://game/%ZZ']) {
    assert.throws(() => resolveAsset(root, url), undefined, url);
  }
  assert.equal(isAppUrl('not a url'), false);
});

test('only ordinary HTTPS links can leave the desktop shell', () => {
  assert.equal(externalUrl('https://github.com/mikolalysenko/secret-of-goku'), 'https://github.com/mikolalysenko/secret-of-goku');
  for (const url of ['file:///tmp/file', 'javascript:alert(1)', 'goku://game/', 'https://user:pass@example.com', 'steam://run/1']) assert.equal(externalUrl(url), null);
});

test('handheld launch profiles and Gaming Mode default to fullscreen with a windowed override', () => {
  assert.equal(startFullscreen(), false);
  assert.equal(startFullscreen({profile: 'steam-deck'}), true);
  assert.equal(startFullscreen({profile: 'bazzite'}), true);
  assert.equal(startFullscreen({env: {SteamDeck: '1'}}), true);
  assert.equal(startFullscreen({env: {XDG_CURRENT_DESKTOP: 'gamescope'}}), true);
  assert.equal(startFullscreen({argv: ['--fullscreen']}), true);
  assert.equal(startFullscreen({profile: 'steam-deck', argv: ['--fullscreen', '--windowed']}), false);
});
