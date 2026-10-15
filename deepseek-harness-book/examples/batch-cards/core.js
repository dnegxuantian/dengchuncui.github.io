import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, lstatSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export const hash = text => createHash('sha256').update(text).digest('hex');

export function readDocument(root, file) {
  if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(file)) throw new Error('文档名只允许小写字母、数字、短横线和 .md');
  const path = join(root, file);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error('只接受 64 KiB 以内的普通 Markdown 文件');
  if (dirname(realpathSync(path)) !== realpathSync(root)) throw new Error('文档不在已配置目录');
  return readFileSync(path, 'utf8');
}

export function atomicJson(path, value) {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  renameSync(temp, path);
}

export function parseCard(text, source) {
  const clean = text.trim().replace(/^```(?:json)?\s*\n/, '').replace(/\n```$/, '');
  const value = JSON.parse(clean);
  for (const key of ['title', 'purpose', 'configuration', 'limits', 'quote']) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 2000) {
      throw new Error(`卡片缺少有效的 ${key}`);
    }
  }
  const normalizeSpace = value => value.replace(/\s+/g, ' ').trim();
  if (normalizeSpace(value.quote).length < 12 || !normalizeSpace(source).includes(normalizeSpace(value.quote))) throw new Error('引用未在源文件中找到');
  return Object.fromEntries(['title', 'purpose', 'configuration', 'limits', 'quote'].map(k => [k, value[k]]));
}

export function summary(state, maxAttempts) {
  return {
    savedStage: state.stage, completed: state.items.filter(i => i.status === 'done').length,
    total: state.items.length, attemptsUsed: state.attempts.length, maxAttempts,
    budgetUnit: 'model-request-attempts; excludes the conversation and Schedule',
    items: state.items.map(i => ({ file: i.file, status: i.status, error: i.error ?? null })),
    // Null means no final usage was received, not a free model call.
    usage: state.attempts.map(a => ({ file: a.file, status: a.status, usage: a.usage ?? null })),
  };
}
