import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const origin='https://demo.example/secret-of-goku/';
async function publicBuild(page){
 test.skip(!existsSync('dist/index.html'),'Run npm run build first.');
 const requests=[],errors=[];page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();if(!url.startsWith(origin))return route.fulfill({status:404,body:'Outside the public build'});
  const path=url.slice(origin.length).split('?')[0]||'index.html';
  if(path.includes('..'))return route.abort();
  try{await route.fulfill({body:await readFile(resolve('dist',path)),contentType:({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.wav':'audio/wav'})[extname(path)]||'application/octet-stream'});}
  catch{await route.fulfill({status:404,body:'Missing public file'});}
 });
 await page.goto(origin);await page.waitForFunction(()=>window.mana);return{requests,errors};
}
test('public subdirectory build starts with a ROM chooser and rejects unsupported files locally',async({page})=>{
 const {requests,errors}=await publicBuild(page);await expect(page.getByRole('button',{name:'Choose ROM',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>mana.ready)).toBe(false);expect(requests.some(r=>r.url.includes('local-rom'))).toBe(false);
 await page.locator('#rom-file').setInputFiles({name:'wrong.sfc',mimeType:'application/octet-stream',buffer:Buffer.alloc(1024)});
 await expect(page.locator('#boot-status')).toContainText('original Secret of Mana (USA) ROM');
 expect(requests.every(r=>r.method==='GET')).toBe(true);expect(errors).toEqual([]);
});
test('public subdirectory build boots a locally chosen ROM without uploading it',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires local ROM.');const {requests,errors}=await publicBuild(page);
 await page.locator('#rom-file').setInputFiles('.local/rom/secret-of-mana-us.sfc');await page.waitForFunction(()=>mana.ready);
 await expect(page.locator('#boot-screen')).toBeHidden();await page.keyboard.press('ArrowLeft');
 await expect.poll(()=>page.evaluate(()=>mana.mod.sound.speech.stats.ready)).toBe(true);
 const rendered=await page.evaluate(()=>{mana.pause();mana.run(900);return mana.pixels.some((v,i)=>i%4!==3&&v>0);});expect(rendered).toBe(true);
 expect(requests.some(r=>r.url.includes('local-rom'))).toBe(false);expect(requests.every(r=>r.method==='GET')).toBe(true);expect(errors).toEqual([]);
});
