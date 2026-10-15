import test from 'node:test';
import assert from 'node:assert/strict';
import {describeConfig} from '../src/cli.mjs';

test('accept endpoint and supply default timeout', () => {
  assert.deepEqual(describeConfig({endpoint: 'https://service.example.invalid'}), {
    endpoint: 'https://service.example.invalid', timeoutMs: 5000,
  });
});
test('reject missing endpoint', () => {
  assert.throws(() => describeConfig({apiBase: 'https://service.example.invalid'}), /endpoint/);
});
