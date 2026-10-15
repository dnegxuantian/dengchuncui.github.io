import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, summary } from './core.js';

const source = 'There is no disk cache and no sharing between hosts.';
const card = { title: '缓存', purpose: '缓存模板', configuration: '默认128项', limits: '不跨进程共享', quote: source };
test('保留完整卡片与真实原文引用', () => assert.deepEqual(parseCard(JSON.stringify(card), source), card));
test('拒绝不存在于原文的引句', () => assert.throws(() => parseCard(JSON.stringify({...card, quote:'The cache survives every process restart.'}), source), /引用/));
test('缺少配置字段时不计完成', () => assert.throws(() => parseCard(JSON.stringify({...card, configuration:''}), source), /configuration/));
test('允许英文排版换行变空格，但不允许换词', () => {
  assert.deepEqual(parseCard(JSON.stringify(card), source.replace('and no', 'and\nno')), card);
  assert.throws(() => parseCard(JSON.stringify({...card, quote:source.replace('no disk', 'a disk')}), source), /引用/);
});
test('未知用量不显示成零，失败尝试仍占预算', () => {
  const value = summary({stage:'failed',items:[{file:'cache.md',status:'failed'}],attempts:[{file:'cache.md',status:'failed'}]}, 2);
  assert.equal(value.attemptsUsed,1); assert.equal(value.usage[0].usage,null); assert.equal(value.completed,0);
});
