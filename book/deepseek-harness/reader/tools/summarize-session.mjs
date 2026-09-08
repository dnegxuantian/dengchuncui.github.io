// Extract only structural evidence from this book's isolated session.
// Raw prompts, credentials, reasoning and request bodies are never exported.
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const sessionRoot = realpathSync(resolve(root, 'runtime/sessions'));
if (!process.argv[2]) throw new Error('Provide the experimental session.jsonl.zstd path');
const input = realpathSync(resolve(process.argv[2]));
const rel = relative(sessionRoot, input);
if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Only book runtime sessions are accepted');
// The persisted stream contains concatenated zstd frames. Decode all frames.
const raw = execFileSync('zstd', ['-dc', input], { maxBuffer: 32 * 1024 * 1024 });
const rows = raw.toString('utf8').trim().split('\n').map(JSON.parse);
const allowed = new Set(['turn/start', 'step/start', 'tool/call', 'tool/result', 'step/end', 'turn/end']);
const events = rows.filter(row => allowed.has(row.type)).map(row => {
  const d = row.data;
  const item = { seq: row.seq, type: row.type, turn: d.turn, step: d.step };
  if (row.type === 'tool/call') item.tool = d.name;
  if (row.type === 'tool/result') {
    item.callEventSeqs = row.sourceEventSeqs;
    item.isError = d.message.content.some(c => c.type === 'tool-result' && c.isError === true);
  }
  if (row.type === 'turn/end') {
    item.reason = d.reason.kind;
    if (d.reason.error?.code) item.code = d.reason.error.code;
  }
  return item;
});
const jobs = JSON.parse(readFileSync(resolve(root, 'lab/jobs.json'), 'utf8'));
const total = jobs.reduce((sum, j) => sum + j.durationSeconds, 0);
const output = JSON.stringify({
  extractedAt: new Date().toISOString(),
  compressedSha256: createHash('sha256').update(readFileSync(input)).digest('hex'),
  events,
  independentCheck: { count: jobs.length, totalSeconds: total, averageSeconds: total / jobs.length },
  probeExists: existsSync(resolve(root, 'lab/permission-probe.txt')),
  limitations: 'Structural event extraction, not an HTTP capture or a complete sandbox audit.'
}, null, 2) + '\n';
if (process.argv.includes('--save')) {
  writeFileSync(resolve(root, 'evidence/02-session-summary.json'), output);
}
console.log(output);
