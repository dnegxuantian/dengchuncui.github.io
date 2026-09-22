import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { checkFile, findLinks } from '../src/check-links.mjs';

test('提取普通行内链接', () => {
  assert.deepEqual(findLinks('[开始](start.md) [说明](guide.md)'), ['start.md', 'guide.md']);
});

test('本地已有文件能找到', async () => {
  const results = await checkFile(resolve('docs/start.md'));
  assert.equal(results.find(item => item.target === 'guide.md').status, 'ok');
});

test('缺失文件标成broken', async () => {
  const results = await checkFile(resolve('docs/start.md'));
  assert.equal(results.find(item => item.target === 'missing.md').status, 'broken');
});
