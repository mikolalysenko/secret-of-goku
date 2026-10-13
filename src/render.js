import { WIDTH as W, HEIGHT as H, ASSETS, POTOS_WORLD } from './data.js';
import { clamp, lerp, seededRandom } from './math.js';

export async function loadAssets(onProgress=()=>{}) {
  const entries=Object.entries(ASSETS), assets={}; let done=0;
  await Promise.all(entries.map(async([name,url])=>{
    const img=new Image(); img.src=url;
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error(`Could not load ${url}`));});
    assets[name]=img;onProgress(++done/entries.length);
  }));
  return assets;
}

const rect = (ctx,x,y,w,h,color) => {ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};

export class Renderer {
  constructor(canvas,assets) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.assets=assets;
    canvas.width=W;canvas.height=H;this.ctx.imageSmoothingEnabled=false;
    this.camera={x:0,y:0};this.lastMap=null;this.frame=0;
    this.worldCanvas=document.createElement('canvas');this.worldCanvas.width=1024;this.worldCanvas.height=1024;
    const worldCtx=this.worldCanvas.getContext('2d',{willReadFrequently:true});
    worldCtx.imageSmoothingEnabled=false;worldCtx.drawImage(assets.world,0,0,1024,1024);
    this.worldPixels=new Uint32Array(worldCtx.getImageData(0,0,1024,1024).data.buffer);
    this.mode7Canvas=document.createElement('canvas');this.mode7Canvas.width=W/2;this.mode7Canvas.height=100;
    this.mode7Ctx=this.mode7Canvas.getContext('2d');this.mode7Image=this.mode7Ctx.createImageData(W/2,100);
    this.mode7Pixels=new Uint32Array(this.mode7Image.data.buffer);
    const rng=seededRandom(541);
    this.motes=Array.from({length:42},()=>({x:rng()*832,y:180+rng()*620,speed:1+rng()*3,phase:rng()*10}));
  }

  draw(g,dt=.016) {
    const c=this.ctx;this.frame++;
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
    rect(c,0,0,W,H,'#091719');
    if(g.mode==='flight') this.drawFlight(g);
    else this.drawGround(g,dt);
    if(g.flash>0) {c.globalAlpha=clamp(g.flash*.7,0,.32);rect(c,0,0,W,H,g.player.super?'#fff2b6':'#d4faff');c.globalAlpha=1;}
    if(g.transition>0) {c.globalAlpha=Math.min(.7,g.transition*1.6);rect(c,0,0,W,H,'#081514');c.globalAlpha=1;}
    // The subtle vignette stays clear in the center where combat happens.
    const shade=c.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,W*.66);
    shade.addColorStop(0,'#08131a00');shade.addColorStop(1,'#08131a68');c.fillStyle=shade;c.fillRect(0,0,W,H);
  }

  drawGround(g,dt) {
    const c=this.ctx,m=g.level,p=g.player;
    let tx,ty;
    if(g.mode==='title') {tx=200+Math.sin(g.time*.05)*30;ty=280+Math.cos(g.time*.05)*24;}
    else {tx=m.width<W?(m.width-W)/2:clamp(p.x-W/2,0,m.width-W);ty=m.height<H?(m.height-H)/2:clamp(p.y-H/2+15,0,m.height-H);}
    if(this.lastMap!==g.map||g.transition>.25) {this.camera.x=tx;this.camera.y=ty;this.lastMap=g.map;}
    this.camera.x=lerp(this.camera.x,tx,Math.min(1,dt*8));this.camera.y=lerp(this.camera.y,ty,Math.min(1,dt*8));
    const shakeX=g.shake?Math.sin(g.time*140)*g.shake*.45:0,shakeY=g.shake?Math.cos(g.time*121)*g.shake*.3:0;
    c.save();c.translate(-Math.round(this.camera.x)+Math.round(shakeX),-Math.round(this.camera.y)+Math.round(shakeY));
    const img=this.assets[m.asset];
    if(m.crop)c.drawImage(img,...m.crop,0,0,m.width,m.height);else c.drawImage(img,0,0);
    if(g.map==='potos') {
      for(const o of g.destroyed) this.drawRubble(g,o);
      this.drawPit(g);
    }
    if(g.map==='store') this.drawChest(92,141,g.flags.chest);
    const actors=[];
    for(const n of g.activeNPCs) actors.push({y:n.y,draw:()=>this.drawNPC(g,n)});
    for(const e of g.enemies) actors.push({y:e.state==='launched'?10000:e.y,draw:()=>this.drawEnemy(g,e)});
    for(const o of g.activeObstacles) actors.push({y:o.y+4,draw:()=>this.drawObstacle(o)});
    for(const o of m.occluders||[]) actors.push({y:o.y,draw:()=>c.drawImage(img,...o.rect,...o.rect)});
    if(g.mode!=='title')actors.push({y:p.y,draw:()=>this.drawGoku(g,p)});
    actors.sort((a,b)=>a.y-b.y);for(const a of actors)a.draw();
    if(g.map==='potos') {
      for(const mote of this.motes) {
        const x=mote.x+Math.sin(g.time*.5+mote.phase)*12,y=mote.y-Math.sin(g.time*.15+mote.phase)*20;
        c.globalAlpha=.2+Math.sin(g.time*1.3+mote.phase)*.15;rect(c,x,y,1,1,'#fff5bb');
      }c.globalAlpha=1;
    }
    for(const e of g.effects)this.drawEffect(g,e);
    for(const s of g.projectiles)this.drawProjectile(g,s);
    if(g.spirit) {
      const sp=g.spirit,t=1-sp.life/sp.max,r=10+t*32;
      c.save();c.shadowColor='#77deff';c.shadowBlur=18;c.fillStyle='#c4f5ff';c.beginPath();c.arc(sp.x,sp.y-30-t*10,r,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle='#fff';c.beginPath();c.arc(sp.x-r*.2,sp.y-32-t*10,r*.6,0,Math.PI*2);c.fill();c.restore();
    }
    const hint=g.context();
    if(hint&&!g.frozen&&g.mode==='play') {
      const pulse=Math.sin(g.time*5)*1.5;
      this.badge(p.x,p.y-43+pulse,'E','#eff6da');
    }
    c.restore();
  }

  shadow(x,y,w=11) {const c=this.ctx;c.fillStyle='#10202466';c.beginPath();c.ellipse(Math.round(x),Math.round(y),w,3,0,0,Math.PI*2);c.fill();}

  drawGoku(g,p,options={}) {
    const c=this.ctx;const x=Math.round(p.x),y=Math.round(p.y);
    if(!options.ghost)this.shadow(x,y);
    if(p.super&&!options.ghost)this.aura(x,y,g.time,p.charging?1.3:.8);
    const rows={down:0,right:2,left:1,up:3};
    let col=0;
    if(p.charging&&p.charge>.05)col=p.super?19+Math.floor(g.time*12)%2:22+Math.floor(g.time*12)%2;
    else if(p.attack>.28)col=p.super?21:24;
    else if(p.attack>0)col=10+Math.max(0,Math.floor((.22-p.attack)*20))%3;
    else if(p.moving)col=2+Math.floor(g.time*(p.super?15:10))%4;
    else col=Math.floor(g.time*2)%2;
    if(options.flight)col=(p.super?36:40)+Math.floor(g.time*7)%4;
    // Both source sheets leave the second rear-facing idle cell empty.
    if(p.facing==='up'&&col===1)col=0;
    if(p.invulnerable>0&&Math.floor(g.time*20)%2)c.globalAlpha=.5;
    c.drawImage(this.assets[p.super?'ssj':'goku'],Math.max(0,col)*32,32+(rows[p.facing]||0)*32,32,32,x-16,y-32,32,32);
    c.globalAlpha=1;
    if(p.charging&&p.charge>.1&&!options.ghost) {
      const r=3+g.chargeFraction*7,dir={down:[4,-7],up:[-5,-22],left:[6,-13],right:[-6,-13]}[p.facing];
      c.save();c.globalCompositeOperation='lighter';c.shadowColor=p.super?'#ffd160':'#58cfff';c.shadowBlur=12;c.fillStyle=p.super?'#ffe88d':'#adf7ff';c.beginPath();c.arc(x+dir[0],y+dir[1],r+Math.sin(g.time*45),0,Math.PI*2);c.fill();c.fillStyle='#fff';c.beginPath();c.arc(x+dir[0],y+dir[1],r*.52,0,Math.PI*2);c.fill();c.restore();
      for(let i=0;i<7;i++){const a=g.time*4+i*Math.PI*2/7,d=26-(g.time*36+i*8)%22;rect(c,x+Math.cos(a)*d,y-15+Math.sin(a)*d,1,3,p.super?'#ffe28b':'#b4f5ff');}
    }
  }

  aura(x,y,time,strength=1) {
    const c=this.ctx;c.save();c.globalCompositeOperation='lighter';
    c.fillStyle='#ffc92830';c.beginPath();c.moveTo(x-18*strength,y+1);
    for(let i=0;i<15;i++){const a=Math.PI+(i/14)*Math.PI,r=(i%2?1:.78)+Math.sin(time*14+i)*.1;c.lineTo(x+Math.cos(a)*22*strength*r,y+Math.sin(a)*49*strength*r);}
    c.lineTo(x+18*strength,y+1);c.closePath();c.fill();
    c.strokeStyle='#ffe68388';c.lineWidth=1;c.stroke();
    for(let i=0;i<5;i++){const yy=(time*48+i*11)%50;rect(c,x+Math.sin(i*4+time)*19,y-yy,1,4,'#ffe681');}
    c.restore();
  }

  drawNPC(g,n) {
    const c=this.ctx;this.shadow(n.x,n.y,9);
    c.drawImage(this.assets[n.sheet],...n.rect,Math.round(n.x-n.rect[2]/2),Math.round(n.y-n.rect[3]),n.rect[2],n.rect[3]);
    if(n.marker&&!g.flags.banished&&(g.flags.bossDefeated||!g.flags.metElder))this.badge(n.x,n.y-43+Math.sin(g.time*3)*2,'!','#ffe092');
  }

  drawEnemy(g,e) {
    const c=this.ctx;this.shadow(e.x,e.y,e.type==='mantis'?25:9);
    c.save();c.translate(Math.round(e.x),Math.round(e.y-(e.z||0)));
    if(e.state==='launched'){c.rotate((1.1-e.launched)*12);c.globalAlpha=Math.min(1,e.launched*3);}
    if(e.type==='mantis') {
      const frames=[[67,0,81,54],[150,0,80,54],[231,0,81,54]];
      const r=frames[Math.floor(e.age*5)%3];c.drawImage(this.assets.mantis,...r,-r[2]/2,-r[3]+6,r[2],r[3]);
    } else {
      const frames=[[4,120,25,22],[32,120,25,22],[62,120,30,22],[91,120,29,22]];
      const r=frames[Math.floor(e.age*5)%4],hop=e.state==='launched'?0:Math.max(0,Math.sin(e.age*6))*3;
      c.drawImage(this.assets.rabite,...r,-r[2]/2,-r[3]-hop,r[2],r[3]);
    }
    c.restore();
  }

  badge(x,y,text,color) {
    const c=this.ctx;rect(c,x-5,y-6,11,12,'#0b222ddd');rect(c,x-4,y-7,9,1,color);
    c.font='bold 9px monospace';c.textAlign='center';c.fillStyle=color;c.fillText(text,Math.round(x),Math.round(y+3));c.textAlign='left';
  }

  drawPit(g) {
    const c=this.ctx,x=488,y=467;
    if(!g.flags.bossDefeated){c.globalAlpha=.35+Math.sin(g.time*3)*.2;c.fillStyle='#8de8ed';c.beginPath();c.ellipse(x,y,12,4,0,0,Math.PI*2);c.fill();c.globalAlpha=1;}
  }

  drawChest(x,y,open) {
    const c=this.ctx;this.shadow(x,y);rect(c,x-10,y-14,20,13,'#613c22');rect(c,x-9,y-17-(open?4:0),18,7,'#d5a451');rect(c,x-8,y-9,16,5,'#976337');rect(c,x-10,y-8,20,2,'#e6be67');rect(c,x-2,y-12,4,5,'#ffda83');if(open)rect(c,x-8,y-14,16,5,'#2b251b');
  }

  drawObstacle(o) {
    const c=this.ctx;this.shadow(o.x,o.y,o.radius);
    if(o.kind==='rock'){
      c.fillStyle='#515d64';c.beginPath();c.moveTo(o.x-18,o.y-4);c.lineTo(o.x-16,o.y-20);c.lineTo(o.x-7,o.y-31);c.lineTo(o.x+9,o.y-28);c.lineTo(o.x+18,o.y-12);c.lineTo(o.x+14,o.y);c.closePath();c.fill();
      c.fillStyle='#8c989c';c.beginPath();c.moveTo(o.x-15,o.y-20);c.lineTo(o.x-6,o.y-28);c.lineTo(o.x+8,o.y-25);c.lineTo(o.x+3,o.y-14);c.lineTo(o.x-11,o.y-10);c.closePath();c.fill();
      rect(c,o.x-3,o.y-22,3,9,'#b7d9c2');rect(c,o.x-6,o.y-17,9,2,'#c5e8d0');
    } else {
      for(let i=0;i<5;i++){const x=o.x-22+i*9;rect(c,x,o.y-27,7,28,'#654525');rect(c,x+1,o.y-27,3,26,'#c49352');rect(c,x+1,o.y-28,5,3,'#e1be78');}
      rect(c,o.x-24,o.y-20,48,5,'#876034');rect(c,o.x-23,o.y-20,46,1,'#e4bd75');rect(c,o.x-24,o.y-8,48,5,'#876034');
      if(o.kind==='log'){rect(c,o.x-24,o.y-29,48,17,'#93652f');rect(c,o.x-22,o.y-28,44,4,'#bc9259');rect(c,o.x-19,o.y-21,36,2,'#63492b');}
    }
  }

  drawRubble(g,id) {
    const positions={gate:[535,672],boulder:[519,350],log:[285,426]},point=positions[id];if(!point)return;
    const [x,y]=point,c=this.ctx;this.shadow(x,y,18);
    for(let i=0;i<7;i++)rect(c,x+Math.sin(i*5)*20,y+Math.cos(i*4)*6,3+i%3,2+i%2,id==='boulder'?'#69736d':'#9d773d');
  }

  drawEffect(g,e) {
    const c=this.ctx,t=1-e.life/e.max;
    c.save();
    if(e.type==='particle'){c.globalAlpha=Math.min(1,e.life*3);rect(c,e.x,e.y,e.size,e.size,e.color);}
    else if(e.type==='text') {
      c.globalAlpha=Math.min(1,e.life*4);c.font='bold 12px monospace';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#10232c';c.strokeText(e.text,Math.round(e.x),Math.round(e.y));c.fillStyle=e.color;c.fillText(e.text,Math.round(e.x),Math.round(e.y));
    } else if(e.type==='beam') {
      const alpha=Math.min(1,e.life*5),width=e.width*(.8+Math.sin(g.time*80)*.12);c.globalAlpha=alpha;c.lineCap='round';
      c.globalCompositeOperation='lighter';c.shadowColor=e.super?'#e7ba37':'#37bdec';c.shadowBlur=15;
      for(const [scale,color] of [[1.6,e.super?'#e7a91c44':'#289ee955'],[1,e.super?'#ffda72':'#6cdaff'],[.55,'#eeffff'],[.22,'#ffffff']]) {
        c.strokeStyle=color;c.lineWidth=width*scale;c.beginPath();c.moveTo(e.a.x,e.a.y);c.lineTo(e.b.x,e.b.y);c.stroke();
      }
      c.shadowBlur=0;
      for(let i=0;i<7;i++){const u=(i/7+g.time*2)%1;const x=lerp(e.a.x,e.b.x,u),y=lerp(e.a.y,e.b.y,u);c.strokeStyle='#ffffffaa';c.lineWidth=1;c.beginPath();c.ellipse(x,y,width*.6,width*.28,e.a.x===e.b.x?0:Math.PI/2,0,Math.PI*2);c.stroke();}
    } else if(e.type==='punch') {
      c.strokeStyle=e.super?'#ffeab7':'#e9faff';c.lineWidth=2;c.globalAlpha=e.life/e.max;
      c.beginPath();c.arc(e.x,e.y,8+t*14,-.7,2.8);c.stroke();
      for(let i=0;i<4;i++)rect(c,e.x+(i-2)*4,e.y-10+i*3,12,1,'#fbffec');
    } else if(e.type==='shockwave') {
      c.globalAlpha=(1-t)*.8;c.lineWidth=2;c.strokeStyle=e.color;c.beginPath();c.ellipse(e.x,e.y,t*e.radius,t*e.radius*.45,0,0,Math.PI*2);c.stroke();
    } else if(e.type==='afterimage') {
      c.globalAlpha=e.life/e.max*.25;this.drawGoku(g,{...e,attack:0,moving:true},{ghost:true});
    }
    c.restore();
  }

  drawProjectile(g,s) {
    const c=this.ctx;c.save();c.globalCompositeOperation='lighter';c.fillStyle=s.hostile?'#ffc066':s.super?'#ffea9c':'#b9f7ff';
    c.shadowColor=s.hostile?'#ff7138':s.super?'#ffbd46':'#73dcff';c.shadowBlur=8;
    c.beginPath();c.arc(s.x,s.y,s.hostile?3:s.super?5:3,0,Math.PI*2);c.fill();
    c.strokeStyle=c.fillStyle;c.lineWidth=2;c.beginPath();c.moveTo(s.x,s.y);c.lineTo(s.x-s.vx*.03,s.y-s.vy*.03);c.stroke();c.restore();
  }

  drawFlight(g) {
    const c=this.ctx,f=g.flight,sky=c.createLinearGradient(0,0,0,105);
    sky.addColorStop(0,'#092c4d');sky.addColorStop(.65,'#437e99');sky.addColorStop(1,'#f4d5a1');c.fillStyle=sky;c.fillRect(0,0,W,110);
    c.fillStyle='#fff0b0';c.beginPath();c.arc(357,51,14,0,Math.PI*2);c.fill();
    for(let i=0;i<6;i++){const x=((i*98-g.time*(3+i%2))%650+650)%650-70,y=34+i%3*15;rect(c,x,y,53,2,'#b4d5d833');rect(c,x+13,y-2,24,2,'#cde1d433');}
    const fw=W/2,fh=100,cos=Math.cos(f.angle),sin=Math.sin(f.angle);
    for(let y=0;y<fh;y++) {
      const depth=f.altitude*65/(y+5), span=depth*1.08,centerX=f.x+cos*depth,centerY=f.y+sin*depth;
      const stepX=-sin*span*2/fw,stepY=cos*span*2/fw;
      let wx=centerX+sin*span,wy=centerY-cos*span;
      for(let x=0;x<fw;x++){const sx=Math.floor(wx)&1023,sy=Math.floor(wy)&1023;this.mode7Pixels[y*fw+x]=this.worldPixels[sy*1024+sx];wx+=stepX;wy+=stepY;}
    }
    this.mode7Ctx.putImageData(this.mode7Image,0,0);c.drawImage(this.mode7Canvas,0,80,W,200);
    const fog=c.createLinearGradient(0,79,0,132);fog.addColorStop(0,'#d4dca6ff');fog.addColorStop(.3,'#c8d8b3aa');fog.addColorStop(1,'#a7cebe00');c.fillStyle=fog;c.fillRect(0,79,W,55);
    c.save();c.translate(W/2,H*.61+Math.sin(g.time*3)*2);c.rotate(Math.sin(g.time*.7)*.025);
    c.globalCompositeOperation='lighter';
    for(let i=0;i<9;i++){const a=g.time*4+i,y=(g.time*90+i*17)%90;c.globalAlpha=(1-y/95)*.3;rect(c,Math.sin(a)*10,7+y,1,16,g.player.super?'#ffe383':'#b1ecff');}
    c.globalAlpha=1;c.globalCompositeOperation='source-over';c.scale(1.8,1.8);
    this.drawGoku(g,{x:0,y:0,facing:'up',super:g.player.super,moving:true},{flight:true,ghost:true});
    if(g.player.super)this.aura(0,0,g.time,.9);c.restore();
    // A compact original-world map, with an honest landing target.
    c.fillStyle='#081e2bc9';c.fillRect(W-94,12,82,82);c.drawImage(this.worldCanvas,W-92,14,78,78);
    rect(c,W-92+POTOS_WORLD.x/1024*78-1,14+POTOS_WORLD.y/1024*78-1,3,3,'#ffe18b');
    rect(c,W-92+f.x/1024*78-1,14+f.y/1024*78-1,3,3,'#fff');
  }

  drawMinimap(canvas,g) {
    const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,96,96);
    c.drawImage(this.assets.potos,0,0,96,96);
    const p=g.map==='potos'?g.player:{x:583,y:289};
    const x=p.x/832*96,y=p.y/832*96;
    c.fillStyle='#061519';c.fillRect(x-3,y-3,7,7);c.fillStyle=g.player.super?'#ffe27c':'#fff4d9';c.fillRect(x-1,y-1,3,3);
  }
}
