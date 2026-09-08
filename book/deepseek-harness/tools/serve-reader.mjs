import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../reader/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.epub':'application/epub+zip','.md':'text/plain; charset=utf-8','.js':'text/plain; charset=utf-8','.json':'application/json'};
createServer((req,res)=>{try{
  let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(relative(root,file).startsWith('..')){res.writeHead(403).end();return;}
  if(statSync(file).isDirectory())file=resolve(file,'index.html');
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain; charset=utf-8'});res.end(readFileSync(file));
}catch{res.writeHead(404).end('Not found');}}).listen(56800,'127.0.0.1',()=>console.log('Book reader: http://127.0.0.1:56800/'));
