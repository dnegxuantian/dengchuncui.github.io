import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLinks } from './check-links.mjs';

test('按 Markdown 所在目录解析，并跳过网络链接和纯锚点', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-book-links-'));
  try {
    writeFileSync(join(directory, 'exists.md'), '# 已存在');
    const input = join(directory, 'input.md');
    writeFileSync(input, '[有效](exists.md#标题) [失效](gone.md) [网页](https://example.com) [锚点](#标题)');
    assert.deepEqual(checkLinks(input), [
      { target: 'exists.md#标题', exists: true },
      { target: 'gone.md', exists: false },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('支持 URL 编码的文件名和查询参数', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-book-links-'));
  try {
    writeFileSync(join(directory, 'my note.md'), '# 笔记');
    const input = join(directory, 'input.md');
    writeFileSync(input, '[笔记](my%20note.md?view=1)');
    assert.deepEqual(checkLinks(input), [{ target: 'my%20note.md?view=1', exists: true }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
