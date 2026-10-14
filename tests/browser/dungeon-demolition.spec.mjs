import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

test('a full Super Saiyan wave opens a real palace passage, preserves scripts and replays its checkpoint',async({page},info)=>{
 test.setTimeout(120000);test.skip(!existsSync('.local/graphics-audit/party.json')||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private native fixtures required.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const saved=await page.evaluate(s=>{
  mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);
  const m=mana.mod,c=mana.snes.cart.data,r=mana.snes.ram,word=a=>c[a]|c[a+1]<<8,map=346;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});m.radio.restore({firstFlight:true});m.powerIntro.restore({flight:true,superShown:true});
  const event=c.slice(0x742b0,0x742b5),door=c.slice(0x8300c,0x83010),start=0x80000+word(0x87000+map*2),end=0x80000+word(0x87002+map*2),objects=c.slice(start,end);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,17,16,0],0x8300c);for(let at=start+8;at<end;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=255;}r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);}finally{c.set(event,0x742b0);c.set(door,0x8300c);c.set(objects,start);}
  for(let i=1;i<12;i++)r[0xe000+i*512]=0;
  mana.write16(0xe002,120);mana.write16(0xe004,88);r[0xe00b]=2;r[0xe006]=r[0xe007]=0;m.localFlightHook.restore();m.teleport.follow({x:120,y:88,layer:0,terrain:2});mana.run(70);
  return mana.snapshot();
 },JSON.parse(readFileSync('.local/graphics-audit/party.json')));
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:info.outputPath('before.png')});
 const result=await page.evaluate(saved=>{
  const m=mana.mod,r=mana.snes.ram,g=m.localFlightHook.dungeon,plan=g.breach(g.tile(8,5,0),{dx:1}),rom=mana.hash(mana.snes.cart.data),results=[];
  if(!plan)return{error:'Expected native palace wall was absent'};
  for(const[superSaiyan,frames]of[[false,100],[true,20],[true,52]]){
   mana.restore(saved);m.options.superSaiyan=superSaiyan;const flags=Array.from(r.slice(0xcf00,0xd000));
   mana.run(3,[7]);mana.run(frames,[10,1]);mana.run(1);mana.run(125);
   results.push({superSaiyan,frames,opened:plan.cells.filter(t=>r[t.address]!==t.tile).length,flagsUnchanged:flags.every((v,i)=>i===10||v===r[0xcf00+i]),radio:m.radio.snapshot(),error:m.story.status.error});
  }
  const checkpoint=mana.snapshot(),walk=()=>{
   for(let i=0;i<110&&m.status.x<262;i++)mana.run(1,[7]);mana.run(10);
   return{...m.status,land:m.localFlightHook.canLand(),tiles:plan.edits.map(t=>r[t.address])};
  };
  const crossed=walk();mana.restore(checkpoint);const replay=walk();
  return{results,total:plan.cells.length,expectedTiles:plan.edits.map(t=>t.replacement),crossed,replay,romUnchanged:rom===mana.hash(mana.snes.cart.data)};
 },saved);
 writeFileSync(info.outputPath('demolition.json'),JSON.stringify(result,null,2));
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:info.outputPath('after.png')});
 expect(result.error,JSON.stringify(result)).toBeUndefined();expect(result.results.map(r=>r.opened)).toEqual([0,0,result.total]);
 for(const r of result.results){expect(r.flagsUnchanged).toBe(true);expect(r.error).toBe(null);}
 expect(result.crossed.map).toBe(346);expect(result.crossed.x).toBeGreaterThanOrEqual(262);expect(result.crossed.canAttack).toBe(true);expect(result.crossed.land).toBe(true);expect(result.crossed.tiles).toEqual(result.expectedTiles);
 expect(result.replay).toEqual(result.crossed);expect(result.romUnchanged).toBe(true);
});
