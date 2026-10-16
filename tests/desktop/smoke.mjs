import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';

const flag = name => {const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1];};
const executablePath = flag('--executable');
const stage = resolve(flag('--app') || `.local/desktop/desktop-${({darwin: 'mac', win32: 'windows', linux: 'linux'})[process.platform]}-${process.arch}`);
const profile = await mkdtemp(join(tmpdir(), 'secret-of-goku-smoke-'));
let application;
try {
  for (let pass = 0; pass < 2; pass++) {
    const args = [`--user-data-dir=${profile}`, '--windowed'];
    application = await electron.launch({...(executablePath ? {executablePath: resolve(executablePath)} : {}), args: executablePath ? args : [stage, ...args], timeout: 60000});
    const page = await application.firstWindow();
    await application.context().setOffline(true);
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(request.url()));
    await page.waitForFunction(() => window.mana?.ready, null, {timeout: 60000}).catch(async error => {
      console.error('Startup:', await page.locator('#boot-status').textContent(), errors, failed); throw error;
    });
    assert.equal(page.url(), 'goku://game/');
    assert.deepEqual(await page.evaluate(() => ({secure: isSecureContext, node: typeof window.require, process: typeof window.process})), {secure: true, node: 'undefined', process: 'undefined'});
    assert.equal(await page.locator('#boot-screen').isHidden(), true);
    assert.equal(await page.locator('button').filter({hasText: /^Mute$/}).count(), 1, 'controller-only startup has sound');
    assert.equal(await page.locator('button:visible, header:visible, nav:visible, .touch-pad:visible, .settings:visible').count(), 0, 'desktop has no page chrome or controls overlay');
    const screen = await page.locator('#screen').boundingBox();
    assert.equal(screen.x, 0); assert.equal(screen.y, 0);
    assert.equal(screen.width, await page.evaluate(() => innerWidth));
    assert.equal(screen.height, await page.evaluate(() => innerHeight));
    const preferences = await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.sandbox, true); assert.equal(preferences.nodeIntegration, false);
    await page.evaluate(() => mana.pause());
    if (pass === 0) {
      const rendered = await page.evaluate(async () => {
        mana.run(960);
        const pixels = mana.pixels.some((v, i) => i % 4 !== 3 && v > 0);
        mana.snes.cart.write(0x30, 0x6fff, 0x47); mana.battery.flush();
        return pixels;
      });
      assert.equal(rendered, true, 'title renders from the bundled ROM');
      await page.keyboard.press('F5');
      await page.waitForFunction(() => document.querySelector('#lab-message').textContent.startsWith('Checkpoint saved in'));
      assert.equal(await page.evaluate(async () => (await fetch('/.env')).status), 404);
      assert.equal(await page.evaluate(async () => (await fetch('/index.html', {method: 'POST'})).status), 405);
    } else {
      assert.equal(await page.locator('#native-restore').isEnabled(), true, 'IndexedDB checkpoint survives restart');
      assert.equal(await page.evaluate(() => mana.snes.cart.sram[0xfff]), 0x47, 'native SRAM survives restart');
      await page.keyboard.press('F9');
      assert.equal(await page.locator('#lab-message').textContent(), 'Checkpoint restored.');
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    await application.close(); application = null;
  }
  console.log('Desktop smoke passed: bundled ROM, native title, sandbox, audio, SRAM and checkpoint persistence.');
} finally {
  if (application) await application.close();
  await rm(profile, {recursive: true, force: true});
}
