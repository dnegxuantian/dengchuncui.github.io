import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toSlug} from '../src/slug.mjs';

const delay=Number(process.env.DSH_BOOK_TEST_DELAY_MS||0);
if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
test('普通英文标题',()=>assert.equal(toSlug('Hello World'),'hello-world'));
test('重音、标点和边界空格',()=>assert.equal(toSlug('  Café & API: v2  '),'cafe-api-v2'));
test('连续分隔符合并',()=>assert.equal(toSlug('A___B---C'),'a-b-c'));
test('空结果被拒绝',()=>assert.throws(()=>toSlug('...'),RangeError));
test('非字符串被拒绝',()=>assert.throws(()=>toSlug(42),TypeError));
