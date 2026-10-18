#!/usr/bin/env node
// Browser references for Frieza's scenes that no preset reaches by itself.
// Loads a preset in the browser mod (headless Chromium, as
// snes/tools/ref-capture.mjs), edits the mod's Frieza state in the snapshot
// (a scene at a chosen age on the preset's map), restores it, runs and
// screenshots. The edited state goes to scenario.json so the cartridge test
// (run.mjs, case `effects`) imports the same preset bundle and writes the
// same Frieza state.
//   node snes/test/frieza/capture.mjs [scenario ...]
// Output: .local/snes-ref-frieza/<scenario>/frame-NNNNN.png, scenario.json
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scenarios} from './scenarios.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const out=resolve(repo,'.local/snes-ref-frieza');
const port=5199;
const server=spawn(process.execPath,[resolve(repo,'scripts/serve.mjs')],{cwd:repo,env:{...process.env,PORT:String(port)},stdio:'ignore'});
// wait until the dev server answers
for(let i=0;i<60;i++){
  const ok=await fetch(`http://127.0.0.1:${port}/`).then(r=>r.ok).catch(()=>false);
  if(ok)break;
  await new Promise(r=>setTimeout(r,250));
}
const browser=await chromium.launch({channel:'chrome',headless:true}).catch(()=>chromium.launch({headless:true}));
try{
  for(const [name,sc] of Object.entries(scenarios)){
    if(only.length&&!only.includes(name))continue;
    const dir=join(out,name);mkdirSync(dir,{recursive:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(`http://127.0.0.1:${port}/?start=${sc.preset}&debug=true`);
      await page.waitForFunction(()=>window.mana&&mana.ready,{},{timeout:240000});
      await page.evaluate(()=>{mana.pause();const p=document.querySelector('#native-pause');if(p)p.hidden=true;});
      // the edit runs in the page: (frieza, status, challenge) -> void
      const edited=await page.evaluate(src=>{
        const st=mana.snapshot(),edit=eval(src);
        edit(st.goku.frieza,{x:mana.mod.status.x,y:mana.mod.status.y,map:mana.mod.read16(0xdc),cameraX:mana.mod.read16(0xa8),cameraY:mana.mod.read16(0xaa)},st.goku.challenge);
        mana.restore(st);
        return {frieza:st.goku.frieza,challenge:st.goku.challenge,map:mana.mod.read16(0xdc)};
      },sc.edit.toString());
      let at=0;
      for(const f of sc.frames){
        if(f>at){await page.evaluate(n=>mana.run(n),f-at);at=f;}
        await page.locator('#screen').screenshot({path:join(dir,`frame-${String(f).padStart(5,'0')}.png`)});
      }
      writeFileSync(join(dir,'scenario.json'),JSON.stringify({name,preset:sc.preset,frames:sc.frames,...edited,errors},null,1));
      console.log(name,'ok',errors.length?`(${errors.length} page errors)`:'');
    }catch(e){
      console.log(name,'FAILED',e.message.split('\n')[0]);
    }
    await page.close();
  }
}finally{await browser.close();server.kill();}
