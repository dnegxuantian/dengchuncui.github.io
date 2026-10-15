// Fictional JSONL import preview. It never contacts a database or network.
export const runner = String.raw`import {readFileSync, writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
const config = JSON.parse(readFileSync('config.json', 'utf8'));
if (!Number.isInteger(config.delayMs) || config.delayMs < 50 || config.delayMs > 5000) {
  console.error('delayMs 必须为 50 到 5000 的整数'); process.exit(2);
}
if (process.argv.includes('--check')) {
  console.log('配置可用，delayMs=' + config.delayMs); process.exit(0);
}
const lines = readFileSync('sample.jsonl', 'utf8').trim().split('\n');
const rl = createInterface({input: process.stdin});
let cursor = 0, running = false, good = 0, bad = 0, timer;
function save(reason) {
  writeFileSync('result.json', JSON.stringify({reason, processed:cursor, total:lines.length, good, bad}, null, 2));
}
function tick() {
  if (!running) return;
  try { const row = JSON.parse(lines[cursor]); if (!row.id || typeof row.email !== 'string' || !row.email.includes('@')) throw new Error('缺少 id 或有效 email'); good++; console.log('第 ' + (cursor+1) + ' 行：通过'); }
  catch (error) { bad++; console.log('第 ' + (cursor+1) + ' 行：拒绝，' + error.message); }
  cursor++; save('running');
  if (cursor >= lines.length) { running=false; save('completed'); console.log('检查完毕：通过 '+good+'，拒绝 '+bad+'。quit 退出。'); return; }
  timer = setTimeout(tick, config.delayMs);
}
console.log('JSONL 导入预检：'+lines.length+' 行。输入 run 开始，pause 暂停，status 查看，quit 退出。');
rl.on('line', line => {
  const command=line.trim();
  if (command==='run') { if (!running && cursor<lines.length) {running=true;tick();} }
  else if(command==='pause') {running=false;clearTimeout(timer);save('paused');console.log('已暂停于 '+cursor+'/'+lines.length);}
  else if(command==='status') console.log('进度 '+cursor+'/'+lines.length+'；通过 '+good+'；拒绝 '+bad+'；运行中 '+running);
  else if(command==='quit') {save('closed');rl.close();}
  else console.log('支持 run / pause / status / quit');
});
rl.on('close',()=>{clearTimeout(timer);process.exit(0);});
process.on('SIGINT',()=>{running=false;clearTimeout(timer);save('interrupted');console.log('收到 SIGINT，保存统计后退出。');process.exit(130);});
`;
export function sampleLines() {
  return Array.from({length: 120}, (_, i) => JSON.stringify({id:i+1,email:(i+1)%17===0?'invalid':'reader'+(i+1)+'@example.invalid'})).join('\n')+'\n';
}
