import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const origin='https://demo.example/secret-of-goku/';
async function publicBuild(page,{defaultRom=false,start=''}={}){
 test.skip(!existsSync('dist/index.html'),'Run npm run build first.');
 const requests=[],errors=[];page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();if(!url.startsWith(origin))return route.fulfill({status:404,body:'Outside the public build'});
  const path=url.slice(origin.length).split('?')[0]||'index.html';
  if(path.includes('..'))return route.abort();
  if(defaultRom&&path==='rom/secret-of-mana-us.sfc')return route.fulfill({body:await readFile('.local/rom/secret-of-mana-us.sfc'),contentType:'application/octet-stream'});
  try{await route.fulfill({body:await readFile(resolve('dist',path)),contentType:({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.wav':'audio/wav'})[extname(path)]||'application/octet-stream'});}
  catch{await route.fulfill({status:404,body:'Missing public file'});}
 });
 await page.goto(origin+(start?`?start=${start}`:''));await page.waitForFunction(()=>window.mana);return{requests,errors};
}
test('public subdirectory build starts with a ROM chooser and rejects unsupported files locally',async({page})=>{
 const {requests,errors}=await publicBuild(page);await expect(page.getByRole('button',{name:'Choose ROM',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>mana.ready)).toBe(false);expect(requests.some(r=>r.url.includes('local-rom'))).toBe(false);
 expect(requests.some(r=>r.url===origin+'rom/secret-of-mana-us.sfc')).toBe(true);
 const version=await page.locator('#build-id').textContent();expect(version).toMatch(/^[a-f0-9]{10}$/);
 const modules=requests.filter(r=>/\.(?:js|mjs)$/.test(new URL(r.url).pathname));expect(modules.length).toBeGreaterThan(10);
 expect(modules.every(r=>new URL(r.url).searchParams.get('v')===version)).toBe(true);
 await page.locator('#rom-file').setInputFiles({name:'wrong.sfc',mimeType:'application/octet-stream',buffer:Buffer.alloc(1024)});
 await expect(page.locator('#boot-status')).toContainText('original Secret of Mana (USA) ROM');
 expect(requests.every(r=>r.method==='GET')).toBe(true);expect(errors).toEqual([]);
});
test('public subdirectory build boots a locally chosen ROM without uploading it',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires local ROM.');const {requests,errors}=await publicBuild(page);
 await expect(page.locator('#rom-file')).toBeEnabled();
 await page.locator('#rom-file').setInputFiles('.local/rom/secret-of-mana-us.sfc');await page.waitForFunction(()=>mana.ready);
 await expect(page.locator('#boot-screen')).toBeHidden();await page.keyboard.press('ArrowLeft');
 await expect.poll(()=>page.evaluate(()=>mana.mod.sound.speech.stats.ready)).toBe(true);
 const rendered=await page.evaluate(()=>{mana.pause();mana.run(900);return mana.pixels.some((v,i)=>i%4!==3&&v>0);});expect(rendered).toBe(true);
 expect(requests.some(r=>r.url.includes('local-rom'))).toBe(false);expect(requests.every(r=>r.method==='GET')).toBe(true);expect(errors).toEqual([]);
});
test('public subdirectory build automatically boots a valid ROM at the default path',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires local ROM.');
 const {requests,errors}=await publicBuild(page,{defaultRom:true});await page.waitForFunction(()=>mana.ready);
 await expect(page.locator('#boot-screen')).toBeHidden();
 expect(requests.filter(r=>r.url===origin+'rom/secret-of-mana-us.sfc')).toHaveLength(1);
 expect(requests.some(r=>r.url.includes('local-rom'))).toBe(false);expect(requests.every(r=>r.method==='GET')).toBe(true);expect(errors).toEqual([]);
});
test('a shared finale query survives manual ROM selection in the published subdirectory build',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires local ROM.');
 const {requests,errors}=await publicBuild(page,{start:'beast'});
 await expect(page.getByRole('button',{name:'Choose ROM',exact:true})).toBeEnabled();
 await page.locator('#rom-file').setInputFiles('.local/rom/secret-of-mana-us.sfc');
 await page.waitForFunction(()=>mana.ready&&mana.mod.status.map===253&&mana.mod.canAttack,{},{timeout:35000});
 expect(await page.evaluate(()=>{mana.pause();return mana.mod.challenge.status;})).toMatchObject({fed:true,started:true,won:false});
 await page.getByText('Test scenes',{exact:true}).click();
 await expect(page.getByRole('link',{name:'Planet explosion: direct link'})).toHaveAttribute('href','?start=explosion');
 expect(requests.every(r=>r.method==='GET')).toBe(true);expect(errors).toEqual([]);
});
