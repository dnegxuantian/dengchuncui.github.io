import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {lookup, parseGrep, validateLimit, renderLookup} from './lookup.js';

const root = await mkdtemp(join(tmpdir(), 'dsh-repo-lookup-test-'));
const git = args => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'});
git(['init', '-q']);
await mkdir(join(root, 'tests'));
await writeFile(join(root, 'adapter.ts'), 'export class DemoAdapter {}\nconst other = new DemoAdapter();\n');
await writeFile(join(root, 'tests', 'adapter.spec.ts'), "import {DemoAdapter} from '../adapter';\nnew DemoAdapter();\n");
await writeFile(join(root, 'untracked.ts'), 'class DemoAdapter {}\n');
git(['add', 'adapter.ts', 'tests']);
git(['-c', 'user.name=Book Test', '-c', 'user.email=book@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Add example adapter']);

test('real Git results include definition, references, tests and commit; no untracked file', async () => {
  const result = await lookup(root, 'DemoAdapter');
  assert.equal(result.definitions.total, 1);
  assert.equal(result.references.total, 3);
  assert.equal(result.tests.total, 2);
  assert.equal(result.commits.length, 1);
  assert.equal(result.definitions.items[0].path, 'adapter.ts');
  assert.equal(result.definitions.items[0].line, 1);
  assert.equal(JSON.stringify(result).includes('untracked.ts'), false);
});
test('group limits retain full counts and indicate omitted results', async () => {
  const result = await lookup(root, 'DemoAdapter', 1);
  assert.equal(result.references.total, 3);
  assert.equal(result.references.items.length, 1);
  assert.equal(result.references.limited, true);
  assert.equal(result.tests.items.length, 1);
});
test('unknown identifier is a valid empty result', async () => {
  const result = await lookup(root, 'NoSuchAdapter');
  assert.equal(result.definitions.total, 0);
  assert.equal(result.references.total, 0);
  assert.deepEqual(result.commits, []);
});
test('reject invalid identifier before running Git', async () => {
  for (const symbol of ['', '-n', 'Foo;pwd', '../Foo', 'x\ny', 123]) {
    await assert.rejects(lookup(root, symbol), /symbol must/);
  }
});
test('do not expand a selected subdirectory into the whole repository', async () => {
  await assert.rejects(lookup(join(root, 'tests'), 'DemoAdapter'), /repository root/);
});
test('cancelled call never begins a search', async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(lookup(root, 'DemoAdapter', 12, abort.signal), {name: 'AbortError'});
});
test('filenames containing colons and newlines are parsed without losing line numbers', () => {
  assert.deepEqual(parseGrep('src/a:b\nc.ts\x0012\x00class DemoAdapter {}\n'), [
    {path: 'src/a:b\nc.ts', line: 12, text: 'class DemoAdapter {}'},
  ]);
});
test('invalid limits fail at plugin configuration time', () => {
  for (const value of [0, 41, 1.2, '12']) assert.throws(() => validateLimit(value), /maxPerGroup/);
});
test('reader-facing render keeps locations, omitted counts and empty groups explicit', async () => {
  const result = await lookup(root, 'DemoAdapter', 1);
  const text = renderLookup(result);
  assert.match(text, /adapter.ts:1 \| export class DemoAdapter/);
  assert.match(text, /文本引用：3 处，显示 1 处（还有未显示结果）/);
  assert.match(text, /Add example adapter/);
  assert.match(renderLookup(await lookup(root, 'NoSuchAdapter')), /未找到/);
  assert.doesNotMatch(renderLookup(await lookup(root, 'NoSuchAdapter')), /继续 read/);
});
