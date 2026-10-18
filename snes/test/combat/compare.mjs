// Trace comparison for the combat tests (browser jsref vs cartridge).
// The browser probes after every video frame; the cartridge probes once per
// completed field frame (00:B07D), with `vb` = field vblanks so far. Combat
// runs one step per vblank on both, but a lagging cartridge frame shows two
// steps at once. Each stream is reduced to its sequence of distinct states
// and the cartridge's must appear in the browser's, in order, within `slack`
// frames (by vblank index), skipping only where it caught up.
//
// The browser applies its hooks before each emulated frame, the cartridge at
// the end of the field frame, so the native engine consumes combat's queued
// damage one frame later on the cartridge and native height writes land
// differently: pending queues (q > 0) and launch heights are compared
// separately and leniently.

const actKey=f=>`${f.act??'-'}/${f.age??'-'}/${f.combo??'-'}/${f.pause|0}/${f.charge|0}/${f.ssj?1:0}`;
function runs(t,key){
  // i: frame of the run's first record; gap: frames since the record before
  // it (a lagging cartridge frame covers several browser frames)
  const out=[];let last=null,prev=null;
  for(const f of t){const k=key(f);if(k===null)continue;if(k!==last){out.push({k,i:f._i,gap:prev===null?1:f._i-prev});last=k;}prev=f._i;}
  return out;
}

function matchSequence(name,js,cart,key,{slack=3,maxSkip=2}={}){
  const a=runs(js,key),b=runs(cart,key),failures=[];
  let j=0,matched=0,skipped=0;
  for(const s of b){
    let k=j;
    while(k<a.length&&a[k].k!==s.k)k++;
    if(k>=a.length){failures.push(`${name}: cartridge state ${s.k} (frame ${s.i}) never seen in the browser`);break;}
    const skip=k-j-(matched?1:0);
    // one browser state per frame at most: a cartridge frame n vblanks after
    // the last record may skip n states (its steps count from the logic's
    // start, the record from its end), and maxSkip for input latency
    if(matched&&skip>Math.max(maxSkip,s.gap))failures.push(`${name}: ${skip} browser states skipped before ${s.k} (frame ${s.i}, ${s.gap} frames after the last record)`);
    if(Math.abs(a[k].i-s.i)>slack)failures.push(`${name}: ${s.k} at cartridge frame ${s.i}, browser frame ${a[k].i}`);
    skipped+=Math.max(0,skip);matched++;j=k;
  }
  // and it must get to the end: no browser states left over (a cartridge
  // that stops early otherwise matches the browser's idle states)
  if(!failures.length&&b.length&&a.length-1-j>maxSkip)failures.push(`${name}: the cartridge stopped at ${b[b.length-1].k} (frame ${b[b.length-1].i}); browser went on to ${a.slice(j+1,j+4).map(x=>x.k).join(', ')}`);
  return {failures,matched,skipped,states:a.length};
}

// A virtual target (frieza.js entity()/hit()): every hit() call in order
// (damage passed, melee, HP taken) within `slack` frames of the browser's,
// Frieza's settled HP, and nothing native: no launch, no queue. Combat's
// live ki shots (each spent at its first contact) and its impact sparks
// (positions) on every cartridge frame equal the browser's within `near`
// frames (a lag frame shows two steps at once, so counts are compared per
// frame, not as a sequence). Cartridge hits carry combat's step counter
// (cb_frame); a record's last step is its frame, earlier steps of a
// catch-up frame come before it.
function compareVirtual(js,cart,sc,failures){
  const slack=sc.slack??3,near=2;
  const hits=(t,cartridge)=>t.flatMap(f=>(f.vt??[]).map(h=>({...h,i:cartridge?f._i-((f.cbf-h.f)&0xffff):f._i})));
  const a=hits(js,false),b=hits(cart,true);
  if(a.length!==b.length)failures.push(`virtual hits: browser ${a.length}, cartridge ${b.length}`);
  for(let k=0;k<Math.min(a.length,b.length);k++){
    const x=a[k],y=b[k];
    if(x.dmg!==y.dmg||x.melee!==y.melee||x.taken!==y.taken)failures.push(`virtual hit ${k}: browser ${x.dmg}${x.melee?' melee':''} took ${x.taken}, cartridge ${y.dmg}${y.melee?' melee':''} took ${y.taken}`);
    if(Math.abs(x.i-y.i)>slack)failures.push(`virtual hit ${k} at cartridge frame ${y.i}, browser frame ${x.i}`);
  }
  const hp=matchSequence('frieza hp',js,cart,f=>String(f.fzhp),{slack,maxSkip:2});
  failures.push(...hp.failures);
  for(const [name,key] of [['ki shots',f=>f.kis],['impact sparks',f=>f.sparks]]){
    const bad=cart.filter(f=>!js.slice(Math.max(0,f._i-near),f._i+near+1).some(g=>key(g)===key(f)));
    if(bad.length)failures.push(`${name}: ${bad.length} cartridge frames differ, first ${bad[0]._i}: "${key(bad[0])}" (browser ${js.slice(Math.max(0,bad[0]._i-near),bad[0]._i+near+1).map(g=>`"${key(g)}"`).join(' ')})`);
  }
  if(cart.some(f=>f.kb))failures.push('a launch started (virtual targets never fly)');
  if(cart.some(f=>f.hits!==cart[0].hits))failures.push('combat queued native damage');
  const taken=b.reduce((n,h)=>n+h.taken,0);
  return `virtual hits ${b.length} (${b.filter(h=>h.melee).length} melee, ${taken} HP)`;
}

// combat_api_beam (test ROM, asked at every frame end) against mana-mod.js
// beamGeometry() of the browser's live beam with the same age: the palms
// relative to Goku (his walk may differ by a lagging frame), direction,
// length, half width (8.8), taper, flags and life; and no beam reported
// where the browser has none within a frame.
function compareBeamApi(js,cart,failures){
  const byAge=new Map();
  for(const f of js)if(f.beam&&!byAge.has(f.beam.age))byAge.set(f.beam.age,{...f.beam,rx:f.beam.x-f.gx,ry:f.beam.y-f.gy});
  let n=0;const bad=[];
  for(const f of cart){
    if(!f.beam){
      if(js.slice(Math.max(0,f._i-1),f._i+2).every(g=>g.beam))bad.push(`frame ${f._i}: no beam on the cartridge`);
      continue;
    }
    const b={...f.beam,rx:f.beam.x-f.gx,ry:f.beam.y-f.gy},g=byAge.get(b.age);
    if(!g){bad.push(`frame ${f._i}: beam age ${b.age} never seen in the browser`);continue;}
    for(const k of ['rx','ry','dx','dy','len','half','super','mega','life','taper'])if(g[k]!==b[k])bad.push(`age ${b.age}: ${k} cartridge ${b[k]}, browser ${g[k]}`);
    const facing=[[0,1],[1,0],[-1,0],[0,-1]].findIndex(([dx,dy])=>dx===g.dx&&dy===g.dy);
    if(b.a!==(facing|g.super<<8|g.mega<<9))bad.push(`age ${b.age}: A ${b.a.toString(16)}, expected ${(facing|g.super<<8|g.mega<<9).toString(16)}`);
    n++;
  }
  if(!n)bad.push('combat_api_beam never reported a beam');
  if(bad.length)failures.push(`beam API: ${bad.length} differences, ${bad.slice(0,4).join('; ')}`);
  return `beam API ${n} frames (browser ages ${byAge.size})`;
}

export function compare(js,cart,sc={}){
  const failures=[],notes=[];
  if(!cart.length)return {failures:['empty cartridge trace'],summary:''};
  js=js.map((f,i)=>({...f,_i:i}));
  // cartridge frame index from the vblank counter. The first record is the
  // first field frame of the script; the cartridge reads a frame's input at
  // the next vblank (auto-joypad), the browser before the frame: one frame.
  // A record's time is the vblank its logic started at plus one (vbl + 1;
  // the probe's own vblank for older traces): a long frame (destroy's band
  // growth, streaming) shows the state of steps taken at its start.
  cart=cart.filter(f=>!f.inRing||sc.ringProbes);
  const at=f=>f.vbl!==undefined&&!f.inRing?f.vbl+1:f.vb;
  const vb0=at(cart[0])-1,lag=sc.inputLag??1;
  cart=cart.map(f=>({...f,_i:((at(f)-vb0)&0xffff)-1-lag})).filter(f=>f._i>=0&&f._i<js.length);
  // Action clock (kind / age / combo / hold / charge / form)
  const act=matchSequence('action',js,cart,actKey,{slack:sc.slack??3});
  failures.push(...act.failures);
  notes.push(`action ${act.matched}/${act.states} states`+(act.skipped?` (${act.skipped} caught up)`:''));
  const slots=Math.max(...js.map(f=>f.e.length),...cart.map(f=>f.e.length));
  let dmg=0,path=0,queued=0;
  for(let s=0;s<slots;s++){
    // only actors combat touched (queue or launch); the rest are native-only
    // (boss explosions, NPCs) and follow the game's own, load-dependent pace
    const touched=t=>t.some(f=>f.e[s]&&(f.e[s].q||(f.kb>>s&1)));
    if(!touched(js)&&!touched(cart))continue;
    // settled life states (no queue pending)
    const life=f=>{const e=f.e[s];if(!e)return 'off';if(e.q)return null;return `${e.sp}/${e.hp}/${e.dead}`;};
    const r=matchSequence(`slot ${s+3} hp`,js,cart,life,{slack:sc.nativeSlack??10,maxSkip:3});
    failures.push(...r.failures);dmg+=r.matched;
    // queued damage (hp/queue) seen on both sides must agree; the native
    // consumer may take a queue within the frame on either side, so a queue
    // only one side observed is not a mismatch
    const q=t=>t.map(f=>f.e[s]&&f.e[s].q?`${f.e[s].hp}/${f.e[s].q}`:null).filter(Boolean);
    const qa=[...new Set(q(js))],qb=[...new Set(q(cart))];
    if(qa.length&&qb.length)for(const v of qb)if(!qa.includes(v))failures.push(`slot ${s+3}: cartridge queued ${v} (hp/queue), browser ${qa.join(' ')}`);
    queued+=Math.min(qa.length,qb.length);
    // launch path (x, y) while combat launches the actor
    // Relative to the launch start (native movement before the hit may
    // differ). Until the native engine consumes a lethal queue the actor's
    // own AI still steps it after combat's write, by its per-frame speed:
    // each cartridge point must lie within 3 px of a browser point, in order.
    const pts=t=>t.filter(f=>f.e[s]&&(f.kb>>s&1)&&f.k0&&f.k0[s]).map(f=>({i:f._i,dx:f.e[s].x-f.k0[s][0],dy:f.e[s].y-f.k0[s][1]}));
    let pa=pts(js),pb=pts(cart);
    if(sc.radial&&pb.length){
      // Radial launches start from where the native AI left each enemy, which
      // differs between emulators: check the cartridge against the browser's
      // formula on the cartridge's own geometry (x0 + 88 * ease * (x0 - goku) / d).
      const first=cart.find(f=>f.e[s]&&(f.kb>>s&1)&&f.k0&&f.k0[s]),[x0,y0]=first.k0[s];
      const gx=first.gx,gy=first.gy,vx=x0-gx,vy=y0-gy,dist=Math.hypot(vx,vy),D=sc.radial;
      const ease=a=>1-(1-Math.min(1,a/12))**2;
      pa=[];for(let a=1;a<=12;a++)pa.push({i:first._i+a-1,dx:Math.round(x0+vx/dist*D*ease(a))-x0,dy:Math.round(y0+vy/dist*D*ease(a))-y0});
    }
    let at=0;
    for(const b of pb){
      let k=at;
      while(k<pa.length&&(Math.abs(pa[k].dx-b.dx)>3||Math.abs(pa[k].dy-b.dy)>3))k++;
      if(k>=pa.length){failures.push(`slot ${s+3} launch: cartridge offset ${b.dx},${b.dy} (frame ${b.i}) not on the browser's arc`);break;}
      at=k;path++;
    }
    if(pa.length&&!pb.length)failures.push(`slot ${s+3}: the browser launched it, the cartridge did not`);
    // (no end check: the native death effect may end before the arc does)
  }
  notes.push(`enemy states ${dmg}`,`queues ${queued}`,`launch points ${path}`);
  if(sc.frieza)notes.push(compareVirtual(js,cart,sc,failures));
  if(sc.beamApi)notes.push(compareBeamApi(js,cart,failures));
  // Rewards
  const d=(t,k)=>t[t.length-1][k]-t[0][k];
  // (companions also fight on their own: scenarios without attacks skip it)
  if(sc.rewards!==false)for(const k of ['gp','xp'])if(d(js,k)!==d(cart,k))failures.push(`${k}: browser +${d(js,k)}, cartridge +${d(cart,k)}`);
  notes.push(`gp +${d(cart,'gp')} xp +${d(cart,'xp')}`);
  // Goku's stats once the power block ran (level 99, 999 HP, Saiyan strength,
  // Heavy Gi agility, Saiyan defense): the last frame of both
  // ... and every change on the way (form changes, gear), in order
  const statSeq=t=>{const o=[];for(const f of t){const k=`${f.str}/${f.agi}/${f.pdef}/${f.mdef}`;if(o[o.length-1]!==k)o.push(k);}return o;};
  const sj=statSeq(js),scs=statSeq(cart);
  if(sj.join()!==scs.join())failures.push(`str/agi/def sequence: browser ${sj.join(' > ')}, cartridge ${scs.join(' > ')}`);
  const lj=js[js.length-1],lc=cart[cart.length-1];
  for(const k of ['lvl','maxhp','str','agi','pdef','mdef'])if(lj[k]!==lc[k])failures.push(`${k}: browser ${lj[k]}, cartridge ${lc[k]}`);
  notes.push(`lvl ${lc.lvl+1} hp ${lc.ghp}/${lc.maxhp} str ${lc.str} agi ${lc.agi} def ${lc.pdef}/${lc.mdef}`);
  if(sc.check)failures.push(...sc.check(js,cart));
  return {failures,summary:notes.join(', ')};
}
