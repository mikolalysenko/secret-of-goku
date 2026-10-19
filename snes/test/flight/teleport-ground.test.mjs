// Execute the assembled ground landing query. The independent model covers
// descriptor rules, all terrain bands, footprint edges and live cache keys.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const ram=Buffer.alloc(0x22000);
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  (a>>>16)===0x33&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const cpu=new context.Cpu({
  cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;},
});
function invoke(name,{a=0,x=0}={}){
  const entry=symbols.get(name);assert(entry,`missing ${name}`);
  cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
  cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
  cpu.br.set([a,x,0xABCD,0x1FFD,entry&65535,0]);
  ram.writeUInt16LE(0x6FFF,0x1FFE);
  let n=0,cycles=0;
  while(cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16){
    assert(++n<100000,`${name} did not return`);
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
  }
  assert.equal(cpu.br[3],0x1FFF,'balanced stack');assert.equal(cpu.br[5],0,'D preserved');
  assert.equal(cpu.r[0],0x7E,'DB preserved');assert(!cpu.m&&!cpu.x,'register widths preserved');
  return {pass:cpu.c,value:cpu.br[0],cycles};
}
function setup(){
  ram.fill(0);
  ram.writeUInt16LE(130,0xDC);ram.writeUInt16LE(130,0xD906);
  for(const p of [0xD912,0xD914])ram.writeUInt16LE(16,p);
  for(const p of [0xD916,0xD918])ram.writeUInt16LE(256,p);
  ram.writeUInt16LE(0xFFFF,0x21B84); // no hero grid, for the slow comparison path
  invoke('fl_cache_clear');
}
function descriptor(id,{flags=0,beh=0,code=0,rep=0}={},layer=0){
  ram.set([flags,beh,code,rep],0x1B800+layer*0x400+id*4);
}
function clearAt({x,y,layer=0,terrain=0,stairs=0}){
  let expected=x>=8&&y>=8&&x<=248&&y<=248;
  if(expected)for(let ty=(y-4)>>4;ty<=(y+4)>>4;ty++)for(let tx=(x-6)>>4;tx<=(x+6)>>4;tx++){
    const id=ram[0x10000+layer*0x4000+ty*128+tx],p=0x1B800+layer*0x400+id*4;
    const [flags,beh,code,rep]=ram.subarray(p,p+4),height=flags&7;
    const floor=code===0||(code&0xF0)===0x20||(code&0xF0)===0x30||(code===0xC1&&rep===0);
    expected&&=!(flags&8)&&height<3&&(!height||(height^terrain)!==3)&&floor&&!(beh&(stairs?0x10:0x90))&&(stairs||(code&0xF0)!==0x20);
  }
  return !!expected;
}
function query({x=24,y=24,layer=0,terrain=0,stairs=0}={}){
  ram.writeUInt16LE(x&65535,0xD940);ram.writeUInt16LE(y&65535,0xD942);
  ram.writeUInt16LE(layer,0xD944);ram.writeUInt16LE(terrain,0x21B74);
  const expected=clearAt({x,y,layer,terrain,stairs});
  const before=Buffer.from(ram),result=invoke('fl_tp_clear',{a:stairs});
  assert.equal(result.pass,!!expected,JSON.stringify({x,y,layer,terrain,stairs}));
  assert.equal(ram.readUInt16LE(0xD940),x&65535,'query x preserved');
  assert.equal(ram.readUInt16LE(0xD942),y&65535,'query y preserved');
  // Only terrain/query scratch, cache/grid bookkeeping and dead stack may change.
  const actual=Buffer.from(ram);
  for(const b of [before,actual]){
    b.fill(0,0x1F00,0x2000);b.fill(0,0xD934,0xD964);
    b.fill(0,0x21800,0x21980);b.fill(0,0x21B80,0x21BA6);
  }
  assert(actual.equals(before),'query changed actor, map or unrelated memory');
  return result.cycles;
}
test('ground teleport agrees with descriptor rules for every flag, code and behaviour byte',t=>{
  for(const layer of [0,1]){
    setup();ram[0x10000+layer*0x4000+129]=1;
    for(let flags=0;flags<256;flags++){
      descriptor(1,{flags},layer);invoke('fl_cache_clear');
      for(const terrain of [0,1,2,3])for(const stairs of [0,1])query({layer,terrain,stairs});
    }
    for(let code=0;code<256;code++)for(const rep of [0,7]){
      descriptor(1,{code,rep},layer);invoke('fl_cache_clear');
      for(const stairs of [0,1])query({layer,stairs});
    }
    for(let beh=0;beh<256;beh++)for(const code of [0,0x21,0x30]){
      descriptor(1,{beh,code},layer);invoke('fl_cache_clear');
      for(const stairs of [0,1])query({layer,stairs});
    }
  }
  setup();const cold=query(),warm=query();
  t.diagnostic(`single-cell ground endpoint: ${cold} cold / ${warm} warm CPU cycles`);
});
test('all footprint cells, map boundaries and height transitions constrain landing',()=>{
  for(const layer of [0,1])for(const blocked of [0,1,2,3]){
    setup();descriptor(1,{beh:0x10},layer);
    const cells=[129,130,257,258];ram[0x10000+layer*0x4000+cells[blocked]]=1;
    for(const terrain of [0,1,2,3])for(const stairs of [0,1])query({x:31,y:31,layer,terrain,stairs});
  }
  setup();
  for(const x of [-1,0,7,8,9,15,16,17,247,248,249,255,256])
    for(const y of [-1,0,7,8,9,15,16,17,247,248,249,255,256])query({x,y});
  setup();descriptor(1,{flags:1});descriptor(2,{flags:2});
  ram[0x10000+129]=1;ram[0x10000+130]=2;
  for(const terrain of [0,1,2,3])query({x:31,terrain});
});
test('teleport facts survive other classifiers and expire on tile changes or cache collisions',()=>{
  // Special geometry keeps the shared location cache; ordinary outdoors
  // reads live descriptors directly. Exercise both paths.
  for(const context of [0,1]){
    setup();descriptor(1,{beh:0x10});descriptor(2,{code:0x21});descriptor(3,{flags:2});
    ram.writeUInt16LE(context,0xD910);
    for(const tile of [0,1,0,2,3,0]){
      ram[0x10000+129]=tile;
      for(const terrain of [0,1,2,3])for(const stairs of [0,1]){
        query({terrain,stairs});invoke('fl_class',{x:129});query({terrain,stairs});
      }
    }
    // A location 64 columns away has the same cache slot but a different key.
    ram[0x10000+193]=1;
    for(let i=0;i<3;i++){
      invoke('fl_class',{x:193});query();
      invoke('fl_cache_clear');query();
    }
  }
});
test('special geometry retains cached checks and outdoor queries read live descriptors',()=>{
  for(const [flags,tileset]of [[1,0],[2,0],[0,10]])for(const layer of [0,1]){
    setup();ram.writeUInt16LE(flags,0xD910);ram.writeUInt16LE(tileset,0xD908);
    ram[0x10000+layer*0x4000+129]=1;
    for(const fields of [{},{flags:1},{flags:2},{flags:8},{beh:0x90},{code:0x21},{code:0xC1,rep:0},{code:0xC1,rep:7}]){
      descriptor(1,fields,layer);invoke('fl_cache_clear');
      for(const terrain of [0,1,2,3])for(const stairs of [0,1]){
        query({layer,terrain,stairs});query({layer,terrain,stairs});
      }
    }
  }
  setup();ram[0x10000+129]=1;
  for(const fields of [{},{flags:8},{},{code:0x21},{beh:0x90},{flags:2}]){
    descriptor(1,fields);
    for(const stairs of [0,1])query({stairs});
  }
});

function landing({x,y,ox,oy,terrain}){
  const layer=terrain>>7,t=terrain&3,dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  const preferred=Math.abs(ox-x)>=Math.abs(oy-y)?(ox<x?1:0):(oy<y?3:2);
  const order=[preferred,...[0,1,2,3].filter(i=>i!==preferred)];
  for(const distance of [26,22,18,32,38,46,54])for(const direction of order){
    const [dx,dy]=dirs[direction],lx=x+dx*distance,ly=y+dy*distance;
    if(!clearAt({x:lx,y:ly,layer,terrain:t}))continue;
    let connected=true;
    for(let step=6;step<distance&&connected;step+=4)
      connected=clearAt({x:x+dx*step,y:y+dy*step,layer,terrain:t,stairs:1});
    if(!connected)continue;
    const tile=ram[0x10000+layer*0x4000+(ly>>4)*128+(lx>>4)];
    const height=ram[0x1B800+layer*0x400+tile*4]&3;
    return [lx,ly,height===1||height===2?(terrain&0xFC)|height:terrain,[2,1,3,0][direction],0];
  }
  return null;
}
test('joined footprints retain every path cell, including longer gaps and stair endpoints',t=>{
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]],distances=[18,22,26,32,38,46,54];
  const obstructions=[{flags:8},{flags:1},{flags:2},{beh:0x80},{code:0x21}];
  let count=0,gaps=0;
  for(let phase=0;phase<16;phase++)for(let direction=0;direction<4;direction++){
    const x=96+phase,y=96+(phase*7)%16,[dx,dy]=dirs[direction];
    const cellsAt=step=>{
      const px=x+dx*step,py=y+dy*step,cells=[];
      for(let ty=(py-4)>>4;ty<=(py+4)>>4;ty++)for(let tx=(px-6)>>4;tx<=(px+6)>>4;tx++)cells.push(ty*128+tx);
      return cells;
    };
    for(const distance of distances){
      const path=new Set(cellsAt(distance));
      for(let step=6;step<distance;step+=4)for(const cell of cellsAt(step))path.add(cell);
      const ends=new Set([...cellsAt(6),...cellsAt(distance)]);
      if([...path].some(c=>!ends.has(c)))gaps++;
      for(const cell of path)for(const fields of obstructions)for(const terrain of [0,1,2,0x80,0x81,0x82]){
        setup();const layer=terrain>>7;
        descriptor(1,fields,layer);ram[0x10000+layer*0x4000+cell]=1;
        ram.writeUInt16LE(x,0x21B70);ram.writeUInt16LE(y,0x21B72);
        ram.writeUInt16LE(terrain,0x21B74);ram.writeUInt16LE(layer,0xD944);
        ram.writeUInt16LE(distance,0xD95A);
        let expected=clearAt({x:x+dx*distance,y:y+dy*distance,layer,terrain:terrain&3});
        for(let step=6;step<distance&&expected;step+=4)
          expected=clearAt({x:x+dx*step,y:y+dy*step,layer,terrain:terrain&3,stairs:1});
        const result=invoke('fl_tp_candidate',{a:direction});count++;
        assert.equal(result.pass,expected,JSON.stringify({phase,direction,distance,cell,fields,terrain}));
      }
    }
  }
  assert(gaps>100,'longer paths must contain unchecked interior cells');
  setup();ram.writeUInt16LE(96,0x21B70);ram.writeUInt16LE(96,0x21B72);ram.writeUInt16LE(26,0xD95A);
  for(let off=0;off<8;off+=2)ram.writeUInt16LE(0x8000,0x21A96+off);
  ram.writeUInt16LE(1,0x21A9E);
  const result=invoke('fl_tp_candidate',{a:0});assert(result.pass);
  t.diagnostic(`${count} individual path obstructions; open 26px candidate ${result.cycles} CPU cycles`);
});
test('failed endpoint intervals preserve candidate order, direction and height rules',t=>{
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]],distances=[26,22,18,32,38,46,54];
  let count=0,remembered=0;
  for(let phase=0;phase<16;phase++)for(let direction=0;direction<4;direction++){
    const x=96+phase,y=96+(phase*7)%16,[dx,dy]=dirs[direction];
    for(const first of distances){
      const px=x+dx*first,py=y+dy*first;
      for(let ty=(py-4)>>4;ty<=(py+4)>>4;ty++)for(let tx=(px-6)>>4;tx<=(px+6)>>4;tx++)
        for(const fields of [{flags:8},{flags:1},{flags:2},{beh:0x80},{code:0x21}])for(const terrain of [0,1,2,0x80,0x81,0x82]){
          setup();const layer=terrain>>7;
          descriptor(1,fields,layer);ram[0x10000+layer*0x4000+ty*128+tx]=1;
          ram.writeUInt16LE(x,0x21B70);ram.writeUInt16LE(y,0x21B72);
          ram.writeUInt16LE(terrain,0x21B74);ram.writeUInt16LE(layer,0xD944);
          for(let off=0;off<8;off+=2)ram.writeUInt16LE(0x8000,0x21A96+off);
          ram.writeUInt16LE(1,0x21A9E);
          ram.fill(0x53,0x21A8E,0x21A96);ram.fill(0xA7,0x21AA0,0x21AA8);
          for(const distance of [first,...distances]){
            ram.writeUInt16LE(distance,0xD95A);
            let expected=clearAt({x:x+dx*distance,y:y+dy*distance,layer,terrain:terrain&3});
            for(let step=6;step<distance&&expected;step+=4)
              expected=clearAt({x:x+dx*step,y:y+dy*step,layer,terrain:terrain&3,stairs:1});
            assert.equal(invoke('fl_tp_candidate',{a:direction}).pass,expected,
              JSON.stringify({phase,direction,first,distance,tx,ty,fields,terrain}));
            count++;
          }
          if(ram.readUInt16LE(0x21A96+direction*2)!==0x8000)remembered++;
          assert(ram.subarray(0x21A8E,0x21A96).every(v=>v===0x53),'crossing state changed');
          assert(ram.subarray(0x21AA0,0x21AA8).every(v=>v===0xA7),'test mailbox changed');
        }
    }
  }
  if(symbols.has('fl_tp_spot_seen'))assert(remembered>1000,'failed-cell intervals were not exercised');
  t.diagnostic(`${count} candidate queries with reused intervals; ${remembered} recorded cells`);
});
test('landing searches preserve candidate order and connected paths around blocked targets',t=>{
  let random=0x73412,count=0,found=0,worst=0,cutoffs=0;
  const next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return random>>>0;};
  for(let scene=0;scene<24;scene++){
    setup();
    for(const layer of [0,1]){
      [{},{flags:8},{flags:1},{flags:2},{code:0x21},{beh:0x80},{beh:0x10},{code:0xC1,rep:3}]
        .forEach((fields,id)=>descriptor(id,fields,layer));
      for(let ty=0;ty<16;ty++)for(let tx=0;tx<16;tx++)
        ram[0x10000+layer*0x4000+ty*128+tx]=scene===0?0:scene===1?1:next()%12%8;
    }
    for(let n=0;n<96;n++)for(const terrain of [0,1,2,0x80,0x81,0x82]){
      const x=next()%248+4,y=next()%248+4;
      const ox=Math.max(0,x+[-60,60,0,0][n&3]),oy=Math.max(0,y+[0,0,-50,50][n&3]);
      const input={x,y,ox,oy,terrain},expected=landing(input);
      ram.writeUInt16LE(ox,0x21B58);ram.writeUInt16LE(oy,0x21B5A);
      ram.writeUInt16LE(x,0x21B70);ram.writeUInt16LE(y,0x21B72);
      ram.writeUInt16LE(terrain,0x21B74);ram.writeUInt16LE(0,0x21B78);
      const result=invoke('fl_tp_landing');worst=Math.max(worst,result.cycles);count++;
      if(symbols.has('fl_tp_spot_seen'))assert.equal(ram.readUInt16LE(0x21A9E),0,'interval reuse leaked outside its search');
      assert.equal(result.pass,expected!==null,JSON.stringify(input));
      if(expected){
        found++;assert.deepEqual([0,2,4,6,8].map(off=>ram.readUInt16LE(0x21BA6+off)),expected,JSON.stringify(input));
      }
      if(symbols.has('fl_tp_candidate_blocked_path'))for(let direction=0;direction<4;direction++){
        const cutoff=ram[0x21B7C+direction];
        if(cutoff<18||cutoff>54)continue;
        cutoffs++;
        const [dx,dy]=[[1,0],[-1,0],[0,1],[0,-1]][direction];
        for(const distance of [18,22,26,32,38,46,54].filter(d=>d>=cutoff)){
          let connected=true;
          for(let step=6;step<distance&&connected;step+=4)
            connected=clearAt({x:x+dx*step,y:y+dy*step,layer:terrain>>7,terrain:terrain&3,stairs:1});
          assert(!connected,`cutoff rejected a connected path: ${JSON.stringify({input,direction,cutoff,distance})}`);
        }
      }
    }
  }
  assert(found>500&&found<count/2,`landing coverage ${found}/${count}`);
  if(symbols.has('fl_tp_candidate_blocked_path'))assert(cutoffs>100,'failed-path cutoffs were not exercised');
  t.diagnostic(`${count} target/origin/terrain searches, ${found} landings, ${cutoffs} path cutoffs, worst ${worst} CPU cycles`);
});
