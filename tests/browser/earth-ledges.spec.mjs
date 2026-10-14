import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

test('low earth terraces cross and land in both directions throughout village and woodland maps',async({page})=>{
 test.setTimeout(240000);
 test.skip(!existsSync('.local/graphics-audit/party.json')||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const baseline=JSON.parse(readFileSync('.local/graphics-audit/party.json')),results=[];
 for(const map of [16,19,23,27,39,40,41,49,52,53,54,55,60,63,131,132,144,168,194,197]){
  const result=await page.evaluate(({baseline,map})=>{
   mana.pause();baseline.romHash=mana.hash(mana.snes.cart.data);mana.restore(baseline);
   const m=mana.mod,c=mana.snes.cart.data,r=mana.snes.ram,h=m.localFlightHook;
   Object.assign(m.options,{enabled:true,power:true,superSaiyan:!!(map&1)});m.radio.restore({firstFlight:true});m.powerIntro.restore({flight:true,superSaiyan:true});
   const event=c.slice(0x742b0,0x742b5),door=c.slice(0x8300c,0x83010),word=a=>c[a]|c[a+1]<<8,start=0x80000+word(0x87000+map*2),end=0x80000+word(0x87002+map*2),objects=c.slice(start,end);
   try{
    c.set([4,24,3,5,0],0x742b0);c.set([map&255,16+(map>>8),16,0],0x8300c);
    // Isolate geometry from enemies' remote spell locks in the private fixture.
    for(let at=start+8;at<end;at+=8)if(c[at+5]<0x80){c[at]=0;c[at+1]=0xff;}
    r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);
   }finally{c.set(event,0x742b0);c.set(door,0x8300c);c.set(objects,start);}
   for(let i=1;i<12;i++)r[0xe000+i*512]=0;
   const {width,height}=h.bounds(),safe=(x,y)=>{const t=h.tileAt(x,y,0);return t&&!(t.behavior&0x90)&&h.canLand(x,y,0,t.flags&3);};
   const candidates=[];let banks=0,blocked=0;
   for(let y=24;y<height-16;y+=16)for(let x=24;x<width-16;x+=16){
    const t=h.tileAt(x,y,0);if(t.tile<96||t.tile>139||t.tile===130||t.code!==0||(t.flags&7)!==3)continue;
    banks++;if(!h.canFly(x,y,0)){blocked++;continue;}
    for(const [dx,dy,forward,back]of[[0,1,5,4],[1,0,7,6]]){
     const shores=[];for(const sign of[-1,1]){let shore=null;for(let d=16;d<=256;d+=16){const px=x+dx*d*sign,py=y+dy*d*sign;if(!h.canFly(px,py,0)||h.tileAt(px,py,0).behavior&0x90)break;if(safe(px,py)){shore={x:px,y:py};break;}}shores.push(shore);}
     if(shores.some(p=>!p))continue;const [a,b]=shores;let valid=true;
     for(let d=0;d<=Math.hypot(b.x-a.x,b.y-a.y);d++)if(!h.canFly(a.x+dx*d,a.y+dy*d,0)){valid=false;break;}
     if(valid)candidates.push({a,b,x,y,dx,dy,forward,back,tile:t.tile});
    }
   }
   const route=candidates.find(c=>c.tile===102)??candidates[0];
   const edge=[[4,8],[width-4,8],[8,4],[8,height-4],[-8,8],[width+8,8],[8,-8],[8,height+8]].some(([x,y])=>h.canFly(x,y,0));
   if(!route)return{map,banks,blocked,edge,route:null};
   const {a,b,forward,back}=route,terrain=h.tileAt(a.x,a.y,0).flags&3;
   mana.write16(0xe002,a.x);mana.write16(0xe004,a.y);r[0xe00b]=terrain;m.teleport.follow({...a,terrain,layer:0});mana.run(60);
   const steer=target=>{let frames=0;while((Math.hypot(m.status.x-target.x,m.status.y-target.y)>2||!h.canLand(m.status.x,m.status.y))&&frames++<140){const dx=target.x-m.status.x,dy=target.y-m.status.y,button=Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4;mana.run(1,[...(Math.hypot(dx,dy)>12?[8]:[]),button]);}mana.run(8);return{...m.status,land:h.canLand(m.status.x,m.status.y),terrain:r[0xe00b],frames};};
   const before=m.status,across=steer(b,forward),returned=steer(a,back);
   return{map,banks,blocked,edge,route,before,across,returned,radio:m.radio.status,error:m.story.status.error};
  },{baseline,map});results.push(result);
 }
 writeFileSync(test.info().outputPath('earth-ledges.json'),JSON.stringify(results,null,2));
 for(const r of results){
  const detail=JSON.stringify(r);expect(r.edge,detail).toBe(false);
  if(!r.banks)continue;
  expect(r.route,detail).toBeTruthy();expect(r.across.map,detail).toBe(r.map);expect(r.returned.map,detail).toBe(r.map);
  for(const [end,target]of[[r.across,r.route.b],[r.returned,r.route.a]]){expect(Math.hypot(end.x-target.x,end.y-target.y),detail).toBeLessThanOrEqual(5);expect(end.land,detail).toBe(true);expect(end.localFlight,detail).toBe(false);}
  expect(r.radio.barrierCount,detail).toBe(0);expect(r.error,detail).toBe(null);
 }
});
