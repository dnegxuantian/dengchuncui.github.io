import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandCatalog} from './catalog.js';

test('lists actual script bodies in a stable order', () => {
  assert.deepEqual(commandCatalog({name: 'demo', scripts: {test: 'node --test', build: 'vite build'}}, '', 20), {
    project: 'demo', scripts: [{name: 'build', command: 'vite build'}, {name: 'test', command: 'node --test'}], total: 2, limited: false,
  });
});
test('filter and cap report the number of matches before truncation', () => {
  const result = commandCatalog({scripts: {test: 'node --test', 'test:unit': 'node --test unit', build: 'vite build'}}, 'test', 1);
  assert.equal(result.total, 2);
  assert.equal(result.limited, true);
  assert.deepEqual(result.scripts, [{name: 'test', command: 'node --test'}]);
});
test('empty catalog is not a guessed command', () => {
  assert.deepEqual(commandCatalog({}, '', 20), {project: '(unnamed)', scripts: [], total: 0, limited: false});
});
test('filter is case-insensitive in version 0.2', () => {
  assert.equal(commandCatalog({scripts: {test: 'node --test'}}, 'TEST', 20).total, 1);
});
test('rejects invalid manifest and script values', () => {
  for (const input of [null, [], {scripts: []}, {scripts: {test: false}}]) {
    assert.throws(() => commandCatalog(input, '', 20));
  }
});
