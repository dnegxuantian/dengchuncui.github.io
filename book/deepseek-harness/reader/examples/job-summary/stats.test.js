import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeJobs } from './stats.js';
import { apply, inject } from './index.js';

const jobs = [12, 8, 10].map((durationSeconds, i) => ({name: `job-${i}`, durationSeconds}));
test('three jobs and nearest-rank p95', () => {
  assert.deepEqual(summarizeJobs(jobs), {count: 3, totalSeconds: 30, averageSeconds: 10, minSeconds: 8, maxSeconds: 12, medianSeconds: 10, p95Seconds: 12, percentileMethod: 'nearest-rank'});
});
test('does not change input ordering', () => {
  const before = structuredClone(jobs); summarizeJobs(jobs); assert.deepEqual(jobs, before);
});
test('zero duration and even median', () => {
  assert.equal(summarizeJobs([{name:'a',durationSeconds:0},{name:'b',durationSeconds:10}]).medianSeconds,5);
});
for (const [name, value] of Object.entries({empty: [], object: {}, null: null, negative: [{name:'a',durationSeconds:-1}], string: [{name:'a',durationSeconds:'3'}], missing: [{name:'a'}], nan: [{name:'a',durationSeconds:NaN}], infinity: [{name:'a',durationSeconds:Infinity}], blank: [{name:' ',durationSeconds:1}]})) {
  test(`rejects ${name}`, () => assert.throws(() => summarizeJobs(value), TypeError));
}
test('rejects overflow', () => assert.throws(() => summarizeJobs([{name:'a',durationSeconds:Number.MAX_VALUE},{name:'b',durationSeconds:Number.MAX_VALUE}]), RangeError));
function fakeFs(readText) {
  return {
    async resolve(path) {return {displayPath:path, marker:'resolved'};},
    contains(parent,child) {return child.displayPath.startsWith(parent.displayPath + '/');},
    async stat() {return {type:'file',size:100};},
    readText,
  };
}
const agent = {session:{header:{cwd:'/lab'}}};
test('plugin reads a resolved target and propagates signal', async () => {
  let definition; const signal = new AbortController().signal;
  apply({tools:{register(d){definition=d;}},fs:fakeFs(async (target,actualSignal)=>{assert.deepEqual(target,{displayPath:'/lab/jobs.json',marker:'resolved'});assert.equal(actualSignal,signal);return JSON.stringify(jobs);})});
  assert.deepEqual(inject,['tools','fs']);
  assert.equal((await definition.execute({file_path:'/lab/jobs.json'},{signal,agent})).totalSeconds,30);
  await assert.rejects(definition.execute({file_path:'jobs.json'},{signal,agent}),/absolute/);
  await assert.rejects(definition.execute({file_path:'/other/jobs.json'},{signal,agent}),/outside/);
  await assert.rejects(definition.execute({file_path:'/lab/jobs.json'},{signal}),/workspace is required/);
});
test('does not swallow filesystem denial', async () => {
  let definition;apply({tools:{register(d){definition=d;}},fs:fakeFs(async()=>{throw new Error('fixture-denied');})});
  await assert.rejects(definition.execute({file_path:'/lab/jobs.json'},{signal:new AbortController().signal,agent}),/fixture-denied/);
});
