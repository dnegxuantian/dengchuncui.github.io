// Verify the fixed second-edition run; never export request headers or reasoning.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const policy=JSON.parse(readFileSync(new URL('lab/daily-policy.json',root)));
const runs=JSON.parse(readFileSync(new URL('lab/daily-runs.json',root)));
assert.equal(policy.date,runs.date);
const classified=policy.jobs.map(job=>{
  const row=runs.runs.find(r=>r.id===job.id);
  return {id:job.id,category:!row?'missing':row.status==='failed'?'failed':row.durationSeconds>job.maxSeconds?'over-limit':'normal'};
});
assert.deepEqual(classified,[{id:'orders',category:'over-limit'},{id:'products',category:'failed'},{id:'customers',category:'normal'},{id:'inventory',category:'missing'}]);
const session='session-046d6508-4f00-49fb-97a3-c19c2c5afb35';
const path=new URL(`runtime/book-v2/sessions/--Users-rui-Documents-ChatGPT-blog-book-deepseek-harness-lab--/${session}/session.jsonl.zstd`,root);
const rows=execFileSync('zstd',['-dc',path.pathname],{maxBuffer:32*1024*1024}).toString().trim().split('\n').map(JSON.parse);
const calls=rows.filter(r=>r.type==='tool/call').map(r=>({seq:r.seq,name:r.data.name}));
assert(calls.length>0);
assert(calls.every(c=>['read','glob'].includes(c.name)), 'Unexpected tool call');
const results=rows.filter(r=>r.type==='tool/result').map(r=>({seq:r.seq,isError:r.data.message.content.some(c=>c.type==='tool-result'&&c.isError===true)}));
assert(results.every(r=>!r.isError));
const message=rows.filter(r=>r.type==='assistant/message').at(-1);
const content=message?.data?.message?.content;
assert(Array.isArray(content),'Expected assistant message content');
const answer=content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
assert(answer.length>100);
for(const secretFile of ['/tmp/deepseek','/tmp/pass']){
  const secret=readFileSync(secretFile,'utf8').trim();
  assert(!secret||!answer.includes(secret),'Credential in answer');
}
const evidence={session,sessionSha256:createHash('sha256').update(readFileSync(path)).digest('hex'),classified,calls,results,note:'Classification independently checked. Prose reviewed manually; not a general automated semantic evaluator.'};
writeFileSync(new URL('edition-2/daily-task-evidence.json',root),JSON.stringify(evidence,null,2)+'\n');
writeFileSync(new URL('edition-2/daily-task-actual.md',root),'# 首次日报任务的实际回答\n\n'+answer+'\n');
console.log(evidence);
