// Keep the emulator's function closures and loaded cartridge; serialize only state.
export function hash(bytes){let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619);return(h>>>0).toString(16);}
export function snapshot(snes){
  const seen=new Map(),nodes=[];
  function visit(value){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return {$ref:seen.get(value)};
    const id=nodes.length;seen.set(value,id);nodes.push(null);
    if(ArrayBuffer.isView(value))nodes[id]={typed:value.constructor.name,values:Array.from(value)};
    else{
      const props={};nodes[id]={array:Array.isArray(value),props};
      for(const key of Object.keys(value)){
        const child=value[key];
        if(typeof child==='function'||child===undefined||child===snes.cart.data)continue;
        props[key]=visit(child);
      }
    }
    return {$ref:id};
  }
  return {format:'SnesJs-probe-v1',core:'b904fdb63be15dc0470b69091622ba5b1bde7275',romHash:hash(snes.cart.data),root:visit(snes),nodes};
}
export function restore(snes,state){
  if(state.format!=='SnesJs-probe-v1'||state.romHash!==hash(snes.cart.data))throw Error('Checkpoint belongs to a different ROM or engine version.');
  const visited=new Set();
  function apply(ref,target){
    if(visited.has(ref.$ref))return;visited.add(ref.$ref);const node=state.nodes[ref.$ref];
    if(node.typed){if(!ArrayBuffer.isView(target)||target.length!==node.values.length)throw Error('Checkpoint array mismatch');target.set(node.values);return;}
    for(const[key,value]of Object.entries(node.props)){
      if(value&&typeof value==='object'&&'$ref'in value)apply(value,target[key]);
      else target[key]=value;
    }
  }
  apply(state.root,snes);
  // Derived per-frame caches (e.g. sprite geometry) follow restored OAM.
  snes.ppu?.invalidateLineCaches?.();
}
export async function checkpointStore(value,key='potos'){
  const db=await new Promise((resolve,reject)=>{
    const r=indexedDB.open('secret-of-goku-engine',1);r.onupgradeneeded=()=>r.result.createObjectStore('checkpoints');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('checkpoints',value===undefined?'readonly':'readwrite'),store=tx.objectStore('checkpoints');
    const request=value===undefined?store.get(key):store.put(value,key);let result;
    request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
}
