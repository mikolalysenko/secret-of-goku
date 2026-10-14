import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

test('flight crosses lily pads, cave height changes and Gaia lava shores while palace stair pockets stay closed',async({page})=>{
 test.setTimeout(240000);test.skip(!existsSync('.local/graphics-audit/party.json')||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private native fixtures required.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const baseline=JSON.parse(readFileSync('.local/graphics-audit/party.json')),results=[];
 for(const map of[136,139,275,278,284,285,286])results.push(await page.evaluate(({baseline,map})=>{
  mana.pause();baseline.romHash=mana.hash(mana.snes.cart.data);mana.restore(baseline);
  const m=mana.mod,c=mana.snes.cart.data,r=mana.snes.ram,h=m.localFlightHook,word=a=>c[a]|c[a+1]<<8;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});m.radio.restore({firstFlight:true});m.powerIntro.restore({flight:true,superSaiyan:true});
  const event=c.slice(0x742b0,0x742b5),door=c.slice(0x8300c,0x83010),start=0x80000+word(0x87000+map*2),end=0x80000+word(0x87002+map*2),objects=c.slice(start,end);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,16+(map>>8),16,0],0x8300c);for(let at=start+8;at<end;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=0xff;}r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);}finally{c.set(event,0x742b0);c.set(door,0x8300c);c.set(objects,start);}
  for(let i=1;i<12;i++)r[0xe000+i*512]=0;
  const {width,height}=h.bounds(),routes=[],voids=[],pockets=[];
  for(let y=24;y<height-16;y+=16)for(let x=24;x<width-16;x+=16){
   const t=h.tileAt(x,y,0);
   if(map===139&&t.ty>=59&&t.ty<=65&&t.tx>=12&&t.tx<=21&&(t.tx<16||t.tx>17)&&[6,22,38,54,187].includes(t.tile))pockets.push({x,y,fly:h.canFly(x,y,0)});
   if(map>=275&&t.tile===0){const route=h.dungeon.airRoute(t);voids.push({fly:h.canFly(x,y,0),shores:route?route.ends.map(t=>({tx:t.tx,ty:t.ty,floor:h.dungeon.floor(t,h.dungeon.context())})):[]});}
   if(map===139?!(t.ty>=48&&t.ty<=53&&[6,22,38,54,187].includes(t.tile)):map===136?![174,175].includes(t.tile):!((t.code>=16&&t.code<=23)||((t.flags&7)===3&&h.lowObstacle(t))))continue;
   if(!h.canFly(x,y,0))continue;
   for(const[dx,dy]of[[0,1],[1,0]]){
    const shore=sign=>{for(let d=16;d<=256;d+=16){const px=x+sign*dx*d,py=y+sign*dy*d,tt=h.tileAt(px,py,0);if(!tt||tt.behavior&0x90||!h.canFly(px,py,0))return null;if(h.canLand(px,py,0,tt.flags&3))return{x:px,y:py,terrain:tt.flags&3};}return null;},a=shore(-1),b=shore(1);
    if(!a||!b)continue;let valid=true;for(let d=0;d<=Math.hypot(b.x-a.x,b.y-a.y);d++)if(!h.canFly(a.x+dx*d,a.y+dy*d,0))valid=false;
    if(valid)routes.push({tile:t.tile,code:t.code,x,y,a,b,dx,dy});
   }
  }
  // Include the actual lava shoreline in Gaia B, not only a cave elsewhere.
  const route=map===285?routes.find(v=>v.y>=810&&v.y<=960)??routes[0]:routes.find(v=>v.a.terrain!==v.b.terrain)??routes[0];
  if(!route)return{map,routes:0,pockets,voids};
  const {a,b}=route;mana.write16(0xe002,a.x);mana.write16(0xe004,a.y);r[0xe00b]=a.terrain;m.teleport.follow({...a,layer:0});mana.run(70);
  const steer=target=>{let frames=0;while((Math.hypot(m.status.x-target.x,m.status.y-target.y)>2||!h.canLand())&&frames++<180){const dx=target.x-m.status.x,dy=target.y-m.status.y,button=Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4;mana.run(1,[...(Math.hypot(dx,dy)>12?[8]:[]),button]);}mana.run(10);return{...m.status,land:h.canLand(),terrain:r[0xe00b],frames};};
  return{map,routes:routes.length,route,across:steer(b),returned:steer(a),pockets,voids,radio:m.radio.status,error:m.story.status.error};
 },{baseline,map}));
 writeFileSync(test.info().outputPath('terrain.json'),JSON.stringify(results,null,2));
 for(const r of results){const detail=JSON.stringify(r);expect(r.routes,detail).toBeGreaterThan(0);for(const gap of r.voids.filter(v=>v.fly)){expect(gap.shores,detail).toHaveLength(2);expect(gap.shores.every(s=>s.floor&&s.tx>0&&s.ty>0),detail).toBe(true);}expect(r.pockets.some(p=>p.fly),detail).toBe(false);if(r.map===139)expect(r.pockets.length).toBeGreaterThan(0);
  for(const[end,target]of[[r.across,r.route.b],[r.returned,r.route.a]]){expect(end.map,detail).toBe(r.map);expect(Math.hypot(end.x-target.x,end.y-target.y),detail).toBeLessThanOrEqual(5);expect(end.land,detail).toBe(true);expect(end.localFlight,detail).toBe(false);}
  expect(r.radio.barrierCount,detail).toBe(0);expect(r.error,detail).toBe(null);
 }
});
