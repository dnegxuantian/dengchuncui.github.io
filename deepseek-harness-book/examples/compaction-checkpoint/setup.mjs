import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';

const cliRoot = resolve(process.argv[2] || 'runner/node_modules/@deepseek-ai/dsh');
const home = process.env.DSH_HOME;
if (!home || !isAbsolute(home)) throw new Error('请先把 DSH_HOME 设置为独立目录的绝对路径');
const pkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8'));
if (pkg.version !== '0.1.1-rc.2') throw new Error(`此示例按 0.1.1-rc.2 编写，实际为 ${pkg.version}`);
const target = join(home, '.agent-presets', 'checkpoint');
if (existsSync(target)) throw new Error(`保留已有配置，不覆盖：${target}`);
const original = readFileSync(join(cliRoot, 'config/agent-presets/standard/agent.cordis.yml'), 'utf8');
const needle = "    - id: compaction-basic\n      name: '@deepseek-ai/dsh-compaction-basic'";
if (original.split(needle).length !== 2) throw new Error('官方标准模式的压缩配置结构已改变，请核对后再适配');
const configured = original.replace(needle,
  "    - id: compaction-basic\n      name: 'dsh-book-compaction-checkpoint'\n      config:\n        maxTokens: 2048");
mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'agent.cordis.yml'), configured);
writeFileSync(join(target, 'preset.yml'), 'name: 任务交接单\ndescription: 使用结构化压缩摘要，其余沿用官方标准模式。\norder: 8\n');
console.log(`已创建任务交接单模式：${target}`);
