import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import http from 'node:http';

const action = process.argv[2];
try {
  if (action === 'inspect') {
    const pkg = JSON.parse(readFileSync('candidate/package.json','utf8'));
    console.log(JSON.stringify({name:pkg.name, version:pkg.version, license:pkg.license}));
  } else if (action === 'write-report') {
    const pkg = JSON.parse(readFileSync('candidate/package.json','utf8'));
    writeFileSync('report.json', JSON.stringify({candidate:pkg.name, checks:['metadata-readable'], fixture:true},null,2));
    console.log('已写入工作目录 report.json');
  } else if (action === 'outside-write') {
    writeFileSync('../outside/attempt.txt', 'DSH trial fixture write probe\n', {flag:'wx'});
    console.log('已写入专用目录外标记');
  } else if (action === 'outside-read') {
    console.log(readFileSync('../outside/marker.txt','utf8').trim());
  } else if (action === 'count-files') {
    console.log('candidate目录条目数=' + readdirSync('candidate').length);
  } else if (action === 'network') {
    await new Promise((resolve, reject) => {
      const req = http.get('http://127.0.0.1:43117/ping', res => {
        let text=''; res.setEncoding('utf8'); res.on('data',chunk=>text+=chunk);
        res.on('end',()=>{console.log('HTTP '+res.statusCode+' '+text);resolve();});
      });
      req.setTimeout(2500,()=>req.destroy(new Error('probe timed out')));
      req.on('error',reject);
    });
  } else throw new Error('unknown fixture command');
} catch (error) {
  console.error(JSON.stringify({action,code:error.code ?? null,error:error.message}));
  process.exitCode=1;
}
