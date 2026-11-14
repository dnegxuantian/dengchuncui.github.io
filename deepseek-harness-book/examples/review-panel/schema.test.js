import test from 'node:test';
import assert from 'node:assert/strict';
import {attachQuotes, disagreements} from './schema.js';

const review = {checks:{parent_path:{behavior:'returns_plan',file:'a.js',line:2,reason:'分析'}}};
test('引用保留原始缩进，不要求模型抄写',()=>{
  assert.equal(attachQuotes(review,{'a.js':'// a\n  return value;'},['a.js']).checks.parent_path.quote,'  return value;');
});
for (const line of [0,3,1.5]) test(`拒绝无效行号 ${line}`,()=>{
  assert.throws(()=>attachQuotes({checks:{parent_path:{...review.checks.parent_path,line}}},{'a.js':'// a\nreturn value;'},['a.js']));
});
test('拒绝角色之外的文件',()=>assert.throws(()=>attachQuotes(review,{'a.js':'// a\nreturn value;'},[])));
test('拒绝空行',()=>assert.throws(()=>attachQuotes(review,{'a.js':'// a\n'},['a.js'])));
test('冲突保留双方意见，不以多数票覆盖',()=>{
  const make=(role,behavior,status='completed')=>({role,status,review:{checks:Object.fromEntries(['parent_path','duplicate_target','empty_input'].map(t=>[t,{behavior}]))}});
  const result=disagreements([make('code','returns_plan'),make('tests','unknown'),make('docs','throws_error')]);
  assert.equal(result.length,3);
  assert.deepEqual(result[0].claims.map(c=>c.role),['code','docs']);
  assert.equal(disagreements([make('code','returns_plan'),make('docs','throws_error','aborted')]).length,0);
});
