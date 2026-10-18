// Browser-mod reference for the menu tests (menu.lua, file.lua): the same
// states and inputs through engine/sprite-layer.js on the vendored core
// (jsref.mjs). Compares the figure's position, sheet and cell with the
// cartridge's, checks that the cartridge's figures and GAME FILE face line up
// with the browser's pixel for pixel (best whole-pixel shift (0,0)), and
// writes side-by-side crops to <out>/menu-compare.png.
import {existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {renderJsRef,BUTTONS as B} from './jsref.mjs';
import {readPng,writePng,blank} from '../../tools/gfx.mjs';

// The reference runs sprite-layer.js without mana-mod.js's input layer, so it
// presses the native buttons behind the player's: X -> native Y (the
// controlled character's ring), which natively opens on the weapon ring.
const ring=rot=>[{buttons:B.y,frames:6},{frames:50},{buttons:B.down,frames:4},{frames:40},
  ...Array.from({length:rot},()=>[{buttons:B.left,frames:4},{frames:30}]).flat(),{buttons:B.b,frames:4},{frames:150,shot:'menu'}];

// Cartridge shots of Mode 5 screens are 512x448: sample (2x, 2y) like jsref.
const pixel=(img,x,y)=>{const fx=img.width>=512?2:1,fy=img.height>=448?2:1,i=((y*fy)*img.width+x*fx)*4;return [img.data[i],img.data[i+1],img.data[i+2]];};
function bestShift(cart,js,x,y,w,h){
  let best=null;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    let sum=0;
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const p=pixel(cart,x+xx+dx,y+yy+dy),q=pixel(js,x+xx,y+yy);sum+=Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])+Math.abs(p[2]-q[2]);}
    if(!best||sum<best.sum)best={dx,dy,sum};
  }
  return best;
}

export async function menuRef({outRoot,local,cart}){
  const cases=[];
  const probe=join(local,'barrier-audit/potos-probe.json'),save0=join(local,'power-flight-fixes/save-0.json'),save3=join(local,'power-flight-fixes/save-3.json');
  if(cart.menu&&existsSync(probe)){
    cases.push({name:'status',run:{state:probe,steps:ring(2)},shot:'js-001_menu.png',cartShot:'menu/status_goku.png',want:cart.menu.status});
    cases.push({name:'status-ssj',run:{state:probe,steps:ring(2),superSaiyan:true},shot:'js-001_menu.png',cartShot:'menu/status_ssj.png',want:cart.menu.status_ssj});
    cases.push({name:'grid',run:{state:probe,steps:ring(4)},shot:'js-001_menu.png',cartShot:'menu/grid_goku.png',want:cart.menu.grid,noPixels:true});
  }
  if(cart.file&&existsSync(save0)&&existsSync(save3)){
    const steps=[{frames:5},{buttons:B.b,frames:4},{frames:150,shot:'file'},{buttons:B.b,frames:4},{frames:150,shot:'confirm'}];
    cases.push({name:'save',run:{state:save0,sramState:save3,steps},shots:{file:'js-001_file.png',confirm:'js-002_confirm.png'},cart:cart.file});
  }
  const lines=[],failures=[],crops=[];
  for(const c of cases){
    const dir=join(outRoot,'menu-js',c.name);
    const log=await renderJsRef({outDir:dir,...c.run});
    if(c.name==='save'){
      const conf=log.find(l=>l.name.startsWith('js-002'))?.sprite;
      const want=c.cart.confirm;
      const same=conf&&conf.x===want.x&&conf.y===want.y&&conf.sheet===want.sheet&&conf.row===0;
      lines.push(`confirm: browser ${conf?`${conf.sheet}:${conf.column}:${conf.row} @${conf.x},${conf.y}`:'-'}, cartridge ${want.sheet}:${want.column}:0 @${want.x},${want.y}`);
      if(!same)failures.push('confirm figure differs from the browser mod');
      const jsConfirm=readPng(join(dir,c.shots.confirm)),cartConfirm=readPng(join(outRoot,'file/confirm_goku.png'));
      const s1=bestShift(cartConfirm,jsConfirm,want.x,want.y,32,32);
      lines.push(`confirm pixels: best shift ${s1.dx},${s1.dy}`);
      if(s1.dx||s1.dy)failures.push(`confirm figure is offset ${s1.dx},${s1.dy} from the browser's`);
      crops.push({cart:cartConfirm,js:jsConfirm,x:want.x-8,y:want.y-8,w:48,h:48});
      const jsFile=readPng(join(dir,c.shots.file)),cartFile=readPng(join(outRoot,'file/file_goku.png'));
      const s2=bestShift(cartFile,jsFile,94,31,16,16);
      lines.push(`GAME FILE face pixels (94,31 16x16): best shift ${s2.dx},${s2.dy}`);
      if(s2.dx||s2.dy)failures.push(`GAME FILE face is offset ${s2.dx},${s2.dy} from the browser's`);
      crops.push({cart:cartFile,js:jsFile,x:62,y:18,w:80,h:40});
      continue;
    }
    const sp=log[log.length-1]?.sprite,want=c.want;
    const same=sp&&sp.x===want.x&&sp.y===want.y&&sp.sheet===want.sheet&&sp.row===0;
    lines.push(`${c.name}: browser ${sp?`${sp.sheet}:${sp.column}:${sp.row} @${sp.x},${sp.y}`:'-'}, cartridge ${want.sheet}:${want.column}:0 @${want.x},${want.y}`+
      (sp&&sp.column!==want.column?' (blink phase differs)':''));
    if(!same)failures.push(`${c.name} figure differs from the browser mod`);
    if(!c.noPixels){
      const js=readPng(join(dir,c.shot)),ca=readPng(join(outRoot,c.cartShot));
      const s=bestShift(ca,js,want.x,want.y,32,32);
      lines.push(`${c.name} pixels: best shift ${s.dx},${s.dy}`);
      if(s.dx||s.dy)failures.push(`${c.name} figure is offset ${s.dx},${s.dy} from the browser's`);
      crops.push({cart:ca,js,x:want.x-8,y:want.y-8,w:48,h:48});
    }
  }
  if(crops.length){
    const S=3,W=Math.max(...crops.map(c=>c.w))*S*2+12,H=crops.reduce((t,c)=>t+c.h*S+6,0),o=blank(W,H);
    let oy=0;
    for(const c of crops){
      for(let y=0;y<c.h*S;y++)for(let x=0;x<c.w*S;x++){
        const X=c.x+Math.floor(x/S),Y=c.y+Math.floor(y/S);
        for(const [img,ox] of [[c.cart,0],[c.js,c.w*S+6]]){const p=pixel(img,X,Y),d=((oy+y)*W+ox+x)*4;o.data[d]=p[0];o.data[d+1]=p[1];o.data[d+2]=p[2];o.data[d+3]=255;}
      }
      oy+=c.h*S+6;
    }
    writeFileSync(join(outRoot,'menu-compare.png'),writePng(o));
  }
  return {lines,failures};
}
