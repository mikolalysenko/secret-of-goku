import {resolve, relative, isAbsolute} from 'node:path';

export const APP_URL = 'goku://game/';
export const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

export function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'goku:' && url.host === 'game' && !url.username && !url.password;
  } catch { return false; }
}

// A stable, secure origin keeps localStorage / IndexedDB saves across updates.
// Only the packaged game directory is exposed; no HTTP server or Node bridge.
export function resolveAsset(root, value) {
  if (!isAppUrl(value)) throw Error('Unknown application origin');
  const pathname = decodeURIComponent(new URL(value).pathname);
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) {
    throw Error('Invalid asset path');
  }
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  const child = relative(root, file);
  if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Asset outside game directory');
  return file;
}

export function externalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function startFullscreen({profile = 'desktop', argv = [], env = {}} = {}) {
  if (argv.includes('--windowed')) return false;
  return argv.includes('--fullscreen') || profile !== 'desktop' || env.SteamDeck === '1' || env.XDG_CURRENT_DESKTOP === 'gamescope';
}
