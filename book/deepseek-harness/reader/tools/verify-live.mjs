import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='https://blog.chuncui.icu/deepseek-harness-book/';
const html=readFileSync(resolve(root,'reader/index.html'),'utf8');
const files=['index.html','deepseek-harness-guide.epub','dsh-book-job-summary-0.1.1.tgz',...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m=>m[1]))];
const results=[];
for(const file of files){
  const response=await fetch(new URL(file,base),{signal:AbortSignal.timeout(15000)});
  const data=Buffer.from(await response.arrayBuffer());
  const expected=readFileSync(resolve(root,'reader',file));
  const hash=b=>createHash('sha256').update(b).digest('hex');
  results.push({file,status:response.status,sha256:hash(data),matchesLocal:hash(data)===hash(expected)});
}
const guide=await fetch('https://blog.chuncui.icu/deepseek-harness-guide/',{signal:AbortSignal.timeout(15000)});
const guideText=await guide.text();
const result={checkedAt:new Date().toISOString(),results,guideStatus:guide.status,guideLinksBook:guideText.includes('href="/deepseek-harness-book/"')};
writeFileSync(resolve(root,'evidence/live-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(result);
if(results.some(r=>r.status!==200||!r.matchesLocal)||guide.status!==200||!result.guideLinksBook)process.exitCode=1;
