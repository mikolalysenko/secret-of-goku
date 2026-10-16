export const defaultRomPath='./rom/secret-of-mana-us.sfc';
const expectedHash='4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f';

export async function validateRom(source){
  let bytes=source instanceof Uint8Array?source:new Uint8Array(source);
  if(bytes.length%0x8000===512)bytes=bytes.slice(512);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  if(Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')!==expectedHash)throw Error('Use the original Secret of Mana (USA) ROM. Other versions are not supported.');
  return bytes;
}

// Resolve relative to the page, so project sites such as GitHub Pages work.
// A missing file, an HTML fallback, an unsupported ROM or an unresponsive
// server all lead to the manual chooser. No selected file is ever uploaded.
export async function fetchDefaultRom({baseUrl=location.href,fetchImpl=fetch,timeoutMs}={}){
  const base=new URL(baseUrl),urls=[new URL(defaultRomPath,base)];
  // Allow the bundled 2 MiB download to finish on a slower phone connection.
  // A cold packaged app (especially under Rosetta) gets a longer local read.
  const timeout=timeoutMs??(base.protocol==='goku:'?60000:30000);
  if(['localhost','127.0.0.1','[::1]'].includes(base.hostname))urls.push(new URL('/local-rom',base));
  for(const url of urls){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetchImpl(url.href,{signal:controller.signal,cache:'no-store'});
      if(!response.ok)continue;
      const bytes=await validateRom(await response.arrayBuffer());
      return {bytes,url:url.href};
    }catch{/* Try the next local candidate, then offer the file chooser. */}
    finally{clearTimeout(timer);}
  }
  return null;
}
