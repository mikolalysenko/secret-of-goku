import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fetchDefaultRom,validateRom} from '../engine/rom-loader.js';
const file='.local/rom/secret-of-mana-us.sfc';

test('default ROM lookup respects a hosted project path and falls back on 404 or HTML',async()=>{
  for(const response of [new Response('missing',{status:404}),new Response('<html>Not found</html>')]){
    const urls=[];
    const result=await fetchDefaultRom({baseUrl:'https://example.test/secret-of-goku/?start=sword',fetchImpl:async url=>{urls.push(url);return response;}});
    assert.equal(result,null);assert.deepEqual(urls,['https://example.test/secret-of-goku/rom/secret-of-mana-us.sfc']);
  }
});
test('a stalled ROM request times out so the manual chooser can open',async()=>{
  let aborted=false;
  const result=await fetchDefaultRom({baseUrl:'https://example.test/',timeoutMs:10,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);} ))});
  assert.equal(result,null);assert.equal(aborted,true);
});
test('loopback lookup retains the private development endpoint as a fallback',async()=>{
  const urls=[];
  const result=await fetchDefaultRom({baseUrl:'http://127.0.0.1:5173/',fetchImpl:async url=>{urls.push(url);return new Response('',{status:404});}});
  assert.equal(result,null);assert.deepEqual(urls,['http://127.0.0.1:5173/rom/secret-of-mana-us.sfc','http://127.0.0.1:5173/local-rom']);
});
test('valid default ROMs and copier headers use the same validation as manual files',{skip:!existsSync(file)},async()=>{
  const original=readFileSync(file),headered=Buffer.concat([Buffer.alloc(512),original]),urls=[];
  assert.deepEqual(Buffer.from(await validateRom(headered)),original);
  const found=await fetchDefaultRom({baseUrl:'http://localhost:5173/',fetchImpl:async url=>{urls.push(url);return new Response(headered);}});
  assert.deepEqual(Buffer.from(found.bytes),original);assert.equal(urls.length,1);
  const changed=original.slice();changed[0]^=1;await assert.rejects(validateRom(changed),/original Secret of Mana/);
});
