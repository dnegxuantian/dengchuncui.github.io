// Run only the book's isolated Harness homes; keep model credentials in env.
import { readFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const homeName = process.env.HARNESS_BOOK_HOME || 'experiments';
if (!/^[a-z0-9-]+$/.test(homeName)) throw new Error('Use a simple experimental home name');
const home = resolve(root, 'runtime', homeName);
mkdirSync(home, {recursive: true});
const runtime = realpathSync(resolve(root, 'runtime'));
const rel = relative(runtime, realpathSync(home));
if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Home must stay inside book/runtime');
const key = process.env.HARNESS_BOOK_KEY_FILE
  ? readFileSync(process.env.HARNESS_BOOK_KEY_FILE, 'utf8').trim()
  : process.env.DEEPSEEK_API_KEY;
const cli = process.env.HARNESS_BOOK_CLI || '/Users/rui/project/github/deepseek-harness/apps/cli/lib/bin.js';
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: resolve(root, 'lab'),
  env: {...process.env, DSH_HOME: home, ...(key ? {DEEPSEEK_API_KEY:key} : {})},
  stdio: ['ignore', 'pipe', 'pipe'],
});
// Buffered redaction also catches credentials split across output chunks.
function pipeSafe(stream, destination) {
  let pending = '';
  stream.on('data', chunk => {
    pending += chunk.toString();
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) destination.write((key ? line.split(key).join('[REDACTED]') : line) + '\n');
  });
  stream.on('end', () => {if(pending) destination.write(key ? pending.split(key).join('[REDACTED]') : pending);});
}
pipeSafe(child.stdout, process.stdout); pipeSafe(child.stderr, process.stderr);
process.on('SIGINT', () => child.kill('SIGTERM'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', error => {console.error(error.message); process.exitCode = 1;});
child.on('exit', code => {process.exitCode = code ?? 1;});
