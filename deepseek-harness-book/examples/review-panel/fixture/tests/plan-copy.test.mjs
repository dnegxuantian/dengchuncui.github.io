import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { planCopy } from '../src/plan-copy.mjs';

test('允许调整资源目标名', () => {
  const result = planCopy([{ source: 'logo.svg', target: 'images/brand.svg' }], 'dist');
  assert.equal(result[0].destination, resolve('dist', 'images/brand.svg'));
});
test('空清单返回空数组', () => {
  assert.deepEqual(planCopy([], 'dist'), []);
});
test('不是数组时拒绝', () => {
  assert.throws(() => planCopy(null, 'dist'), TypeError);
});
