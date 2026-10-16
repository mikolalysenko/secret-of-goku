import{test,expect}from'@playwright/test';
import{readFileSync,existsSync}from'node:fs';
const fixture='.local/graphics-audit/party.json';
for(const gold of[false,true])test(`training gi unequips, re-equips and restores in the native ring (SSJ ${gold})`,async({page})=>{
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private native fixture required');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const result=await page.evaluate(({state,gold})=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);const m=mana.mod,r=mana.snes.ram;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:gold});mana.run(4);
  const read=()=>({armor:r[0xe1e1],str:r[0xe188],agi:r[0xe189],attack:m.status.attack,nativeAttack:r[0xe198],damage:m.damageScale(),weighted:m.equipment.weighted,partyArmor:[r[0xe3e1],r[0xe5e1]]});
  const before=read();mana.run(2,[9]);mana.run(90);mana.run(2,[0]);mana.run(90);
  const confirm=()=>{mana.run(2,[0]);mana.run(90);mana.run(2,[0]);mana.run(90);};
  confirm();const bare=read();confirm();const worn=read();
  const saved=mana.snapshot();confirm();mana.restore(saved);mana.run(180);const restored=read();
  for(let i=0;i<3&&!m.canAttack;i++){mana.run(2,[9]);mana.run(90);}
  const final=read();document.querySelector('#native-pause').hidden=true;
  return{before,bare,worn,restored,final,can:m.canAttack};
 },{state:JSON.parse(readFileSync(fixture)),gold});
 const power=gold?8191:4095;
 expect(result.before).toMatchObject({armor:22,str:230,damage:Math.round(power*.9),weighted:true});
 expect(result.bare).toMatchObject({armor:21,str:255,damage:power,attack:power,weighted:false});
 expect(result.worn).toMatchObject({armor:22,str:230,damage:Math.round(power*.9),attack:Math.round(power*.9),weighted:true});
 expect(result.worn.agi).toBe(Math.floor(result.bare.agi*.8));
 expect(result.restored).toEqual(result.worn);expect(result.final).toEqual(result.worn);expect(result.can).toBe(true);
 expect(result.bare.partyArmor).toEqual(result.before.partyArmor);expect(result.worn.partyArmor).toEqual(result.before.partyArmor);
 expect(result.bare.nativeAttack).toBe(255);expect(result.worn.nativeAttack).toBe(255);
 await page.locator('#screen').screenshot({path:test.info().outputPath('training-gear.png')});
});

test('orbital melee also benefits from removing the training gi',async({page})=>{
 test.setTimeout(120000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private ROM required');
 await page.goto('/?start=space');await page.waitForFunction(()=>mana.ready,{},{timeout:60000});
 const damage=await page.evaluate(()=>{
  mana.pause();const m=mana.mod,base=m.frieza.snapshot(),out=[];
  for(const armor of[22,21]){
   const s=structuredClone(base),b=s.boss,o=b.space;
   Object.assign(b,{hp:20000,guard:0,surge:null,stun:0,x:128,y:80});
   Object.assign(o,{intro:0,clash:null,duel:null,beam:null,charge:0,cooldown:0,hero:{x:108,y:80}});
   m.write8(0xe1e1,armor);m.frieza.restore(s);m.frieza.spaceInput(1);out.push(20000-m.frieza.status.hp);
  }return out;
 });expect(damage).toEqual([495,550]);
});
