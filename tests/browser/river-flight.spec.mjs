import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

test('woodland riverbanks and every lily-pad variant fly both ways in base and Super Saiyan',async({page},info)=>{
 test.setTimeout(240000);
 const fixture='.local/graphics-audit/party.json';
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const baseline=JSON.parse(readFileSync(fixture)),results=[];
 // Every gameplay map using the woodland set, plus the actual Water Palace.
 for(const map of[16,19,23,27,39,40,41,49,52,53,54,55,60,136]){
  const result=await page.evaluate(({baseline,map})=>{
   mana.pause();baseline.romHash=mana.hash(mana.snes.cart.data);mana.restore(baseline);
   const m=mana.mod,c=mana.snes.cart.data,r=mana.snes.ram,h=m.localFlightHook,word=a=>c[a]|c[a+1]<<8;
   Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});m.radio.restore({firstFlight:true});m.powerIntro.restore({flight:true,superShown:true});
   const event=c.slice(0x742b0,0x742b5),door=c.slice(0x8300c,0x83010),start=0x80000+word(0x87000+map*2),end=0x80000+word(0x87002+map*2),objects=c.slice(start,end);
   try{
    c.set([4,24,3,5,0],0x742b0);c.set([map&255,16+(map>>8),16,0],0x8300c);
    for(let at=start+8;at<end;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=255;}
    r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;mana.run(240);
   }finally{c.set(event,0x742b0);c.set(door,0x8300c);c.set(objects,start);}
   for(let i=1;i<12;i++)r[0xe000+i*512]=0;
   const {width,height}=h.bounds(),padIds=map===136?[173,174]:[159,162],pads=[],banks=[],walls=[],routes=[];
   // These streams have water at height 1 and grass at height 2. Height-0
   // cliff faces elsewhere in the woodland atlas are not riverbank shores.
   const floor=t=>t&&!(t.flags&8)&&!(t.behavior&0xd0)&&[1,2].includes(t.flags&7)&&t.code===0;
   const point=(x,y)=>{const t=h.tileAt(x,y,0);return floor(t)?{x,y,terrain:t.flags&3}:null;};
   for(let y=24;y<height-16;y+=16)for(let x=24;x<width-16;x+=16){
    const t=h.tileAt(x,y,0),pad=padIds.includes(t.tile),bank=map!==136&&t.tile>=80&&t.tile<=95;
    if(t.code===0&&(t.flags&7)===3&&(map===136?t.tile===175:t.tile===186))walls.push({x,y,fly:h.canFly(x,y,0)});
    if(!pad&&!bank||t.behavior&0xd0||t.flags&8)continue;
    if(pad)pads.push({x,y,tile:t.tile,fly:h.canFly(x,y,0),land:h.canLand(x,y,0,t.flags&3)});
    for(const[dx,dy]of[[1,0],[0,1]]){
     if(bank&&point(x-dx*16,y-dy*16)&&point(x+dx*16,y+dy*16))banks.push({x,y,tile:t.tile,fly:h.canFly(x,y,0)});
     const shore=sign=>{
      for(let n=1;n<=6;n++){
       const px=x+sign*dx*n*16,py=y+sign*dy*n*16,p=point(px,py);
       if(!h.canFly(px,py,0))return null;
       // Give a full-speed native frame enough floor to stop on: a tiny
       // patch between two pads is hover space, not a useful landing target.
       if(p&&Array.from({length:15},(_,i)=>h.canLand(px+sign*dx*i,py+sign*dy*i,0,p.terrain)).every(Boolean))return p;
      }
      return null;
     },a=shore(-1),b=shore(1);
     if(!a||!b)continue;
     if(!Array.from({length:Math.hypot(b.x-a.x,b.y-a.y)+1},(_,i)=>h.canFly(a.x+dx*i,a.y+dy*i,0)).every(Boolean))continue;
     routes.push({tile:t.tile,kind:pad?'pad-'+t.tile:'bank',x,y,dx,dy,a,b});
    }
   }
   // Traverse one actual bank and both pad graphics on each map. The scan
   // above also checks every pad and every bank with two adjacent floors.
   const selected=[...new Set(routes.map(v=>v.kind))].map(kind=>routes.find(v=>v.kind===kind&&v.x>32&&v.y>32));
   const grid=mana.hash(r.slice(0x10000,0x18000)),moves=[];let capture=null;
   for(const superSaiyan of[false,true])for(const route of selected.filter(Boolean)){
    const {a,b,dx,dy}=route;m.options.superSaiyan=superSaiyan;m.cancelCombat();m.localFlight=false;m.localLift=0;h.restore();
    mana.write16(0xe002,a.x);mana.write16(0xe004,a.y);r[0xe00b]=a.terrain;r[0xe006]=r[0xe007]=0;
    m.teleport.follow({...a,layer:0});mana.run(60);
    const move=(target,sign)=>{
     let frames=0;
     while(sign*(dx?(target.x-m.status.x):(target.y-m.status.y))>0&&frames++<30){
      mana.run(1,[8,dx?sign>0?7:6:sign>0?5:4]);
      if(!capture&&[16,136].includes(map)&&Math.hypot(m.status.x-route.x,m.status.y-route.y)<8){mana.render();capture=document.querySelector('#screen').toDataURL();}
     }
     mana.run(10);return{x:m.status.x,y:m.status.y,map:m.status.map,land:h.canLand(),flying:m.localFlight,frames};
    };
    moves.push({superSaiyan,route,across:move(b,1),back:move(a,-1)});
   }
   return{map,actual:m.status.map,pads,banks,walls,moves,capture,gridUnchanged:grid===mana.hash(r.slice(0x10000,0x18000)),edge:h.canFly(4,4,0),error:m.story.status.error};
  },{baseline,map});
  if(result.capture){writeFileSync(info.outputPath(`river-${map}.png`),Buffer.from(result.capture.split(',')[1],'base64'));delete result.capture;}
  results.push(result);writeFileSync(info.outputPath('rivers.json'),JSON.stringify(results,null,2));
  const detail=JSON.stringify({...result,pads:result.pads.filter(v=>!v.fly||v.land),banks:result.banks.filter(v=>!v.fly),walls:result.walls.filter(v=>v.fly)});
  expect(result.actual,detail).toBe(map);expect(result.error,detail).toBe(null);expect(result.edge,detail).toBe(false);expect(result.gridUnchanged,detail).toBe(true);
  expect(result.pads.every(v=>v.fly&&!v.land),detail).toBe(true);expect(result.banks.every(v=>v.fly),detail).toBe(true);expect(result.walls.every(v=>!v.fly),detail).toBe(true);
  for(const move of result.moves)for(const[end,target]of[[move.across,move.route.b],[move.back,move.route.a]]){
   // A video frame may contain two native movement updates (up to 14 px),
   // followed by the water current when flight is released on the far side.
   expect(end.map,detail).toBe(map);expect(Math.hypot(end.x-target.x,end.y-target.y),detail).toBeLessThan(16);expect(end.land,detail).toBe(true);expect(end.flying,detail).toBe(false);
  }
 }
 expect(results.flatMap(r=>r.pads).length).toBeGreaterThan(200);
 expect(results.flatMap(r=>r.banks).length).toBeGreaterThan(100);
 expect(results.flatMap(r=>r.moves).length).toBeGreaterThan(30);
 expect(new Set(results.find(r=>r.map===136).moves.map(m=>m.route.tile))).toEqual(new Set([173,174]));
});
