import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.argv.includes('--dist')?'dist':'.'),port=Number(process.env.PORT||5173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8','.wasm':'application/wasm','.sfc':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');let pathname=decodeURIComponent(url.pathname);
    // This one endpoint intentionally streams the local ROM only to the local dev browser.
    // It is never copied to dist, and all other hidden files are unavailable over HTTP.
    let file;
    if(pathname==='/local-rom'&&root===resolve('.'))file=resolve('.local/rom/secret-of-mana-us.sfc');
    else{
      if(pathname.split('/').some(p=>p.startsWith('.')||p==='node_modules'))throw new Error('Forbidden');
      if(pathname==='/')pathname='/index.html';
      file=resolve(root,`.${pathname}`);if(!file.startsWith(root+sep))throw new Error('Forbidden');
    }
    const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Secret of Goku: http://127.0.0.1:${port}`));
