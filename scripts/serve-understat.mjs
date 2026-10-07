// Local adapter for the Vercel handler, plus a static app preview. Bind only to loopback.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {handleVercelUnderstat} from '../server/vercel-understat.mjs';
const port=Number(process.env.PORT || 8007),origin=`http://localhost:${port}`,root=resolve('dist');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/understat'){
    const result=await handleVercelUnderstat(new Request(url,{method:req.method,headers:req.headers}));
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
  }
  const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  try{const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Understat + app preview: ${origin}`));
