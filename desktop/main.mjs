// Secret of Goku is a vibe coded fan game, not intended for commercial purposes.
// Third-party characters, ROM data and assets retain their original ownership.
import {app, BrowserWindow, Menu, net, protocol, session, shell} from 'electron';
import {readFileSync} from 'node:fs';
import {join, extname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {APP_URL, CONTENT_SECURITY_POLICY, isAppUrl, resolveAsset, externalUrl, startFullscreen} from './runtime.mjs';

app.setName('Secret of Goku');
// Never put saves inside an installed app, AppImage, or a versioned directory.
const profileDirectory = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', profileDirectory ? resolve(profileDirectory) : join(app.getPath('appData'), 'secret-of-goku'));
protocol.registerSchemesAsPrivileged([{
  scheme: 'goku', privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true},
}]);

let window;
const openExternal = url => {
  const safe = externalUrl(url);
  if (safe) void shell.openExternal(safe).catch(error => console.error('Could not open link:', error.message));
};

async function createWindow() {
  const {profile} = JSON.parse(readFileSync(join(app.getAppPath(), 'desktop/profile.json'), 'utf8'));
  window = new BrowserWindow({
    title: 'Secret of Goku', width: 1280, height: 800, minWidth: 640, minHeight: 480,
    backgroundColor: '#080808', show: false, autoHideMenuBar: true,
    fullscreen: startFullscreen({profile, argv: process.argv, env: process.env}),
    webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required'},
  });
  window.webContents.setWindowOpenHandler(({url}) => {openExternal(url); return {action: 'deny'};});
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {event.preventDefault(); openExternal(url);}
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && !input.isAutoRepeat && (input.key === 'F11' || (input.alt && input.key === 'Enter'))) {
      event.preventDefault(); window.setFullScreen(!window.isFullScreen());
    }
  });
  window.once('ready-to-show', () => {window.show(); window.focus();});
  window.on('closed', () => {window = null;});
  await window.loadURL(APP_URL);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {if (window) {if (window.isMinimized()) window.restore(); window.show(); window.focus();}});
  // Do not await readiness at module top level: Electron waits for ESM loading
  // to finish before emitting ready.
  app.whenReady().then(async () => {
  const gameRoot = join(app.getAppPath(), 'game');
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.md': 'text/plain; charset=utf-8', '.sfc': 'application/octet-stream'};
  protocol.handle('goku', async request => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405});
    try {
      const file = resolveAsset(gameRoot, request.url);
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      if (types[extname(file)]) headers.set('Content-Type', types[extname(file)]);
      headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(request.method === 'HEAD' ? null : response.body, {status: response.status, headers});
    } catch {return new Response('Not found', {status: 404});}
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(permission === 'fullscreen' && isAppUrl(details.requestingUrl || contents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => permission === 'fullscreen' && isAppUrl(origin));
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
    {label: 'Secret of Goku', submenu: [{role: 'about'}, {type: 'separator'}, {role: 'quit'}]},
    {label: 'View', submenu: [{role: 'togglefullscreen'}]},
  ]) : null);
  await createWindow();
  app.on('activate', () => {if (!window) void createWindow();});
  app.on('window-all-closed', () => app.quit());
  }).catch(error => {console.error('Could not start Secret of Goku:', error); app.exit(1);});
}
