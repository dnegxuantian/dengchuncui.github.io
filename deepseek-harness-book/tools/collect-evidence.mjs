// Export structural evidence only; never publish raw sessions or request headers.
import {readdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
function walk(dir){return existsSync(dir)?readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):e.name==='session.jsonl.zstd'?[resolve(dir,e.name)]:[]):[];}
const output=[];
for(const home of ['official-home','experiments','community']){
  for(const path of walk(resolve(root,'runtime',home,'sessions'))){
    const rows=execFileSync('zstd',['-dc',path],{maxBuffer:64*1024*1024}).toString().trim().split('\n').map(JSON.parse);
    const events=rows.filter(r=>['tool/call','tool/result','turn/end','assistant/message'].includes(r.type)).map(r=>{
      const item={seq:r.seq,type:r.type,turn:r.data.turn,step:r.data.step};
      if(r.type==='tool/call')item.tool=r.data.name;
      if(r.type==='tool/result'){item.callEventSeqs=r.sourceEventSeqs;item.isError=r.data.message.content.some(c=>c.type==='tool-result'&&c.isError===true);}
      if(r.type==='turn/end')item.reason=r.data.reason.kind;
      if(r.type==='assistant/message'&&r.data.usage)item.usage=r.data.usage;
      return item;
    });
    output.push({home,session:path.split('/').at(-2),sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),events});
  }
}
writeFileSync(resolve(root,'evidence/experiments.json'),JSON.stringify(output,null,2)+'\n');
console.log(output.map(s=>({home:s.home,session:s.session,tools:s.events.filter(e=>e.tool).map(e=>e.tool),errors:s.events.filter(e=>e.isError).length})));
