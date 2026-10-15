import test from 'node:test';
import assert from 'node:assert/strict';
import {readOnlyReason, apply} from './guard.js';

test('allow the four named read-only capabilities', () => {
  for (const name of ['skill', 'read', 'glob', 'grep']) assert.equal(readOnlyReason({name}), undefined);
});
test('deny commands regardless of how harmless their arguments look', () => {
  assert.match(readOnlyReason({name:'bash',arguments:{command:'pwd'}}), /拒绝 bash/);
});
test('deny writes, nested-code transport and unknown tools by default', () => {
  for (const name of ['write', 'edit', 'run_code', 'unknown']) assert.match(readOnlyReason({name}), /只读模式拒绝/);
});
test('register the guard as an owned Tool service contribution', () => {
  let registered;
  apply({tools:{guard: fn => {registered = fn;}}});
  assert.equal(registered, readOnlyReason);
});
