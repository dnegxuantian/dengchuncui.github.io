import http from 'node:http';
let hits=0;
http.createServer((req,res)=>{
  if(req.url!=='/ping'){res.writeHead(404);res.end();return;}
  hits++;
  console.log(JSON.stringify({event:'ping',hits,time:new Date().toISOString()}));
  res.setHeader('Content-Type','text/plain');res.end('trial-pong');
}).listen(43117,'127.0.0.1',()=>console.log('Trial HTTP server listening at 127.0.0.1:43117'));
