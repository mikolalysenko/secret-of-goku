// Controller-driven animation filmstrips against the user's local cartridge.
// Captures stay ignored in .local; no ROM or extracted art is published.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
const out='.local/animation-audit/runtime',report={scenes:[],errors:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.mana?.ready);
  const state=JSON.parse(await readFile('.local/graphics-audit/party.json','utf8'));
  await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);window.auditBase=state;},state);
  const moves={
    walk:[[30,'direction'],[8,[]]],run:[[24,'run'],[8,[]]],
    combo:[[2,[0]],[10,[]],[2,[0]],[10,[]],[2,[0]],[22,[]]],
    charge:[[112,[10,1]],[30,[]]],ki:[[45,[1]],[22,[]]],
    transform:[[96,[10,8]],[80,[]],[2,[10,8]],[14,[]]],
  };
  for(const superSaiyan of [false,true])for(const [direction,button]of [['down',5],['left',6],['right',7],['up',4]])for(const [move,sequence]of Object.entries(moves)){
    if(move==='transform'&&(superSaiyan||direction!=='down'))continue;
    const name=`${superSaiyan?'super':'base'}-${direction}-${move}`;
    const frames=await page.evaluate(({superSaiyan,button,sequence})=>{
      mana.restore(window.auditBase);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan});
      // Only the diagnostic filmstrip hides companions, so each silhouette is
      // readable. Separate native presentation tests retain party occlusion.
      mana.write8(0xe200,0);mana.write8(0xe400,0);mana.run(2,[button]);mana.run(8);
      const captures=[];let tick=0;
      for(const [count,buttons]of sequence)for(let i=0;i<count;i++){
        mana.run(1,buttons==='direction'?[button]:buttons==='run'?[button,8]:buttons);tick++;
        const sprite=mana.mod.spriteLayer.plan?.sprite;
        if(!sprite)throw Error('Missing player in combat animation');
        captures.push({tick,sprite:{...sprite},world:mana.mod.status,action:mana.mod.action?JSON.parse(JSON.stringify(mana.mod.action)):null,effects:mana.mod.effects.map(effect=>({kind:effect.kind,life:effect.life})),png:document.querySelector('#screen').toDataURL()});
      }
      return captures;
    },{superSaiyan,button,sequence});
    const sheets=new PNG({width:96*frames.length,height:96}),selected=[];
    for(const [i,frame]of frames.entries()){
      const png=PNG.sync.read(Buffer.from(frame.png.split(',')[1],'base64'));
      const left=Math.round((frame.sprite.x-8)*2),top=Math.round((frame.sprite.y-8)*2+14);
      for(let y=0;y<96;y++)for(let x=0;x<96;x++){
        const from=((top+y)*png.width+left+x)*4,to=(y*sheets.width+i*96+x)*4;
        if(left+x>=0&&left+x<png.width&&top+y>=0&&top+y<png.height)png.data.copy(sheets.data,to,from,from+4);
      }
      if(i%Math.max(1,Math.floor(frames.length/12))===0&&selected.length<12)selected.push(i);
      delete frame.png;
    }
    await writeFile(`${out}/${name}.png`,PNG.sync.write(sheets));
    const contact=new PNG({width:96*selected.length,height:96});
    selected.forEach((frame,x)=>{for(let y=0;y<96;y++)sheets.data.copy(contact.data,(y*contact.width+x*96)*4,(y*sheets.width+frame*96)*4,(y*sheets.width+(frame+1)*96)*4);});
    await writeFile(`${out}/${name}-contact.png`,PNG.sync.write(contact));
    report.scenes.push({name,superSaiyan,direction,move,frames});
    console.log(`${name}: ${frames.length} frames`);
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;report.passed=false;process.exitCode=1;}
finally{
  await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  const cards=report.scenes.map(scene=>`<figure><canvas width="96" height="96" data-count="${scene.frames.length}" data-file="${scene.name}.png"></canvas><figcaption>${scene.name}</figcaption><a href="${scene.name}-contact.png">Filmstrip</a></figure>`).join('');
  await writeFile(`${out}/index.html`,`<!doctype html><meta charset="utf-8"><title>Native combat animation audit</title><style>body{background:#10151b;color:#d9e4eb;font:14px system-ui;padding:24px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}figure{margin:0}canvas{width:192px;height:192px;image-rendering:pixelated}a{color:#9de}button{margin:12px}</style><h1>Controller-driven combat</h1><button id="toggle">Pause</button><main>${cards}</main><script>const views=[...document.querySelectorAll('canvas')].map(canvas=>{const image=new Image();image.src=canvas.dataset.file;return{canvas,image,context:canvas.getContext('2d'),count:+canvas.dataset.count}});let playing=true,start=performance.now(),age=0;document.querySelector('button').onclick=()=>{playing=!playing;document.querySelector('button').textContent=playing?'Pause':'Play'};function tick(now){if(playing)age+=(now-start)*60/1000;start=now;for(const view of views)if(view.image.complete){view.context.clearRect(0,0,96,96);view.context.drawImage(view.image,(Math.floor(age)%view.count)*96,0,96,96,0,0,96,96)}requestAnimationFrame(tick)}requestAnimationFrame(tick)</script>`);
  console.log(JSON.stringify({passed:report.passed,scenes:report.scenes.length,failure:report.failure}));
}
