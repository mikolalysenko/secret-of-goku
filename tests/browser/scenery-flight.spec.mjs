import{test,expect}from'@playwright/test';import{existsSync,readFileSync,writeFileSync}from'node:fs';
const cases=[
 {"set":20,"kind":"entrance gap","map":255,"name":"manafort entrance middle seam","tile":119,"layer":0,"x":328,"y":408,"a":{"x":312,"y":408,"terrain":2},"b":{"x":360,"y":408,"terrain":2},"dx":1,"dy":0},
 {"set":20,"kind":"entrance gap","map":255,"name":"manafort entrance upper seam","tile":119,"layer":0,"x":360,"y":392,"a":{"x":360,"y":376,"terrain":2},"b":{"x":360,"y":408,"terrain":2},"dx":0,"dy":1},
 {"set":20,"kind":"entrance gap","map":255,"name":"manafort entrance side rim","tile":135,"layer":0,"x":248,"y":376,"a":{"x":216,"y":376,"terrain":2},"b":{"x":264,"y":376,"terrain":2},"dx":1,"dy":0},
 {"set":20,"kind":"entrance gap","map":255,"name":"manafort entrance long seam","tile":119,"layer":0,"x":296,"y":392,"a":{"x":248,"y":392,"terrain":2},"b":{"x":328,"y":392,"terrain":2},"dx":1,"dy":0},
 {"set":5,"kind":"bank","map":22,"name":"turtleisland exterior","tile":81,"layer":0,"x":216,"y":232,"a":{"x":216,"y":216,"terrain":1},"b":{"x":216,"y":264,"terrain":2},"dx":0,"dy":1},
 {"set":5,"kind":"small","map":22,"name":"turtleisland exterior","tile":127,"layer":0,"x":408,"y":264,"a":{"x":408,"y":248,"terrain":2},"b":{"x":408,"y":280,"terrain":2},"dx":0,"dy":1},
 {"set":31,"kind":"bank","map":47,"name":"windpalace exterior","tile":121,"layer":0,"x":232,"y":120,"a":{"x":216,"y":120,"terrain":1},"b":{"x":248,"y":120,"terrain":0},"dx":1,"dy":0},
 {"set":31,"kind":"small","map":47,"name":"windpalace exterior","tile":140,"layer":0,"x":104,"y":344,"a":{"x":88,"y":344,"terrain":1},"b":{"x":120,"y":344,"terrain":2},"dx":1,"dy":0},
 {"set":22,"kind":"bank","map":48,"name":"lunapalace normal","tile":111,"layer":0,"x":456,"y":280,"a":{"x":456,"y":264,"terrain":2},"b":{"x":456,"y":408,"terrain":2},"dx":0,"dy":1},
 {"set":22,"kind":"small","map":48,"name":"lunapalace normal","tile":175,"layer":0,"x":456,"y":392,"a":{"x":456,"y":264,"terrain":2},"b":{"x":456,"y":408,"terrain":2},"dx":0,"dy":1},
 {"set":12,"kind":"bank","map":61,"name":"shadepalace exterior","tile":42,"layer":0,"x":888,"y":72,"a":{"x":888,"y":56,"terrain":2},"b":{"x":888,"y":168,"terrain":2},"dx":0,"dy":1},
 {"set":8,"kind":"bank","map":64,"name":"mandala north","tile":64,"layer":0,"x":360,"y":696,"a":{"x":344,"y":696,"terrain":2},"b":{"x":376,"y":696,"terrain":2},"dx":1,"dy":0},
 {"set":3,"kind":"bank","map":67,"name":"desert a","tile":16,"layer":0,"x":328,"y":184,"a":{"x":312,"y":184,"terrain":2},"b":{"x":360,"y":184,"terrain":2},"dx":1,"dy":0},
 {"set":3,"kind":"small","map":67,"name":"desert a","tile":7,"layer":0,"x":344,"y":248,"a":{"x":344,"y":232,"terrain":2},"b":{"x":344,"y":264,"terrain":2},"dx":0,"dy":1},
 {"set":13,"kind":"bank","map":76,"name":"icecountry northwest","tile":37,"layer":0,"x":232,"y":120,"a":{"x":216,"y":120,"terrain":2},"b":{"x":248,"y":120,"terrain":1},"dx":1,"dy":0},
 {"set":13,"kind":"small","map":76,"name":"icecountry northwest","tile":141,"layer":0,"x":392,"y":296,"a":{"x":376,"y":296,"terrain":2},"b":{"x":424,"y":296,"terrain":2},"dx":1,"dy":0},
 {"set":25,"kind":"bank","map":89,"name":"kakkara","tile":99,"layer":0,"x":360,"y":296,"a":{"x":360,"y":280,"terrain":2},"b":{"x":360,"y":328,"terrain":2},"dx":0,"dy":1},
 {"set":24,"kind":"bank","map":113,"name":"goldcity","tile":184,"layer":0,"x":216,"y":600,"a":{"x":200,"y":600,"terrain":2},"b":{"x":280,"y":600,"terrain":2},"dx":1,"dy":0},
 {"set":9,"kind":"small","map":163,"name":"pandora ruins c","tile":203,"layer":1,"x":616,"y":328,"a":{"x":600,"y":328,"terrain":128},"b":{"x":632,"y":328,"terrain":130},"dx":1,"dy":0},
 {"set":11,"kind":"bank","map":170,"name":"pandora south","tile":126,"layer":0,"x":328,"y":24,"a":{"x":312,"y":24,"terrain":2},"b":{"x":344,"y":24,"terrain":2},"dx":1,"dy":0},
 {"set":30,"kind":"small","map":198,"name":"purelands a and mana tree","tile":137,"layer":0,"x":328,"y":328,"a":{"x":328,"y":312,"terrain":2},"b":{"x":328,"y":344,"terrain":2},"dx":0,"dy":1},
 {"set":30,"kind":"bank","map":198,"name":"purelands a and mana tree","tile":6,"layer":0,"x":248,"y":504,"a":{"x":248,"y":488,"terrain":2},"b":{"x":248,"y":552,"terrain":2},"dx":0,"dy":1},
 {"set":16,"kind":"bank","map":222,"name":"matango backyard","tile":39,"layer":1,"x":504,"y":152,"a":{"x":488,"y":152,"terrain":130},"b":{"x":552,"y":152,"terrain":129},"dx":1,"dy":0},
 {"set":17,"kind":"bank","map":232,"name":"bluedragon arena","tile":70,"layer":0,"x":344,"y":472,"a":{"x":328,"y":472,"terrain":2},"b":{"x":360,"y":472,"terrain":2},"dx":1,"dy":0},
 {"set":4,"kind":"small","map":257,"name":"potos interior a","tile":234,"layer":1,"x":264,"y":184,"a":{"x":264,"y":168,"terrain":130},"b":{"x":264,"y":200,"terrain":130},"dx":0,"dy":1},
 {"set":19,"kind":"small","map":271,"name":"sandship interior b","tile":119,"layer":0,"x":152,"y":152,"a":{"x":136,"y":152,"terrain":2},"b":{"x":168,"y":152,"terrain":2},"dx":1,"dy":0},
 {"set":27,"kind":"bank","map":432,"name":"undersea axe room a","tile":290,"layer":1,"x":360,"y":232,"a":{"x":344,"y":232,"terrain":130},"b":{"x":408,"y":232,"terrain":128},"dx":1,"dy":0},
 {"set":21,"kind":"chasm","map":248,"name":"manafort interior a","tile":15,"layer":0,"x":1064,"y":200,"a":{"x":1064,"y":168,"terrain":2},"b":{"x":1064,"y":232,"terrain":2},"dx":0,"dy":1},
 {"set":21,"kind":"chasm","map":249,"name":"manafort interior b","tile":15,"layer":0,"x":184,"y":232,"a":{"x":184,"y":184,"terrain":2},"b":{"x":184,"y":264,"terrain":2},"dx":0,"dy":1},
 {"set":21,"kind":"chasm","map":250,"name":"manafort interior c","tile":15,"layer":0,"x":200,"y":264,"a":{"x":200,"y":232,"terrain":2},"b":{"x":200,"y":312,"terrain":2},"dx":0,"dy":1},
 {"set":21,"kind":"chasm","map":251,"name":"manafort interior path to lich","tile":0,"layer":0,"x":56,"y":184,"a":{"x":40,"y":184,"terrain":2},"b":{"x":88,"y":184,"terrain":2},"dx":1,"dy":0}
];
for(const route of cases)test(`flight crosses ${route.kind} scenery in ${route.name} (${route.map})`,async({page})=>{
 test.skip(!existsSync('.local/graphics-audit/party.json')||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private native ROM and fixture required.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const base=JSON.parse(readFileSync('.local/graphics-audit/party.json'));
 const result=await page.evaluate(({base,route})=>{
  mana.pause();base.romHash=mana.hash(mana.snes.cart.data);mana.restore(base);const m=mana.mod,c=mana.snes.cart.data,r=mana.snes.ram,h=m.localFlightHook,word=a=>c[a]|c[a+1]<<8,{map,layer,a,b}=route;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});m.radio.restore({firstFlight:true});m.powerIntro.restore({flight:true,superSaiyan:true});
  const event=c.slice(0x742b0,0x742b5),door=c.slice(0x8300c,0x83010),start=0x80000+word(0x87000+map*2),end=0x80000+word(0x87002+map*2),objects=c.slice(start,end);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,(a.x>>4)*2+(map>>8),(a.y>>4)*2+layer,0],0x8300c);for(let at=start+8;at<end;at+=8)if(c[at+5]<128){c[at]=0;c[at+1]=0xff;}r.set([1,0xb0,0x42,0xc7],0xd0);mana.run(240);}finally{c.set(event,0x742b0);c.set(door,0x8300c);c.set(objects,start);}
  for(let i=1;i<12;i++)r[0xe000+i*512]=0;
  mana.write16(0xe002,a.x);mana.write16(0xe004,a.y);r[0xe00b]=a.terrain;m.teleport.follow({...a,layer});mana.run(70);
  let png=null,visible=0;
  const steer=target=>{let frames=0;while((Math.hypot(m.status.x-target.x,m.status.y-target.y)>2||!h.canLand())&&frames++<180){const dx=target.x-m.status.x,dy=target.y-m.status.y,button=Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4;mana.run(1,[...(Math.hypot(dx,dy)>12?[8]:[]),button]);if(m.localFlight&&Math.hypot(m.status.x-route.x,m.status.y-route.y)<20){png=document.querySelector('#screen').toDataURL();if(m.spriteLayer.plan?.sprite)visible++;}}mana.run(10);return{...m.status,land:h.canLand(),terrain:r[0xe00b],frames};};
  const across=steer(b),returned=steer(a);return{route,across,returned,png,visible,error:m.story.status.error};
 },{base,route});
 if(result.png)writeFileSync(test.info().outputPath('crossing.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
 writeFileSync(test.info().outputPath('route.json'),JSON.stringify(result,null,2));const detail=JSON.stringify(result);
 for(const[end,target]of[[result.across,route.b],[result.returned,route.a]]){expect(end.map,detail).toBe(route.map);expect(Math.hypot(end.x-target.x,end.y-target.y),detail).toBeLessThanOrEqual(5);expect(end.land,detail).toBe(true);expect(end.localFlight,detail).toBe(false);}expect(result.visible,detail).toBeGreaterThan(0);expect(result.error,detail).toBe(null);
});
