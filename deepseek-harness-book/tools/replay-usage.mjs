// Recheck counters from the fixed community experiment. Zero rates are deliberate.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const lib=resolve(root,'runtime/community/profiles/web/node_modules/dsh-usage/lib');
const {resolveConfig}=await import(pathToFileURL(resolve(lib,'pricing.js')));
const {foldModelCostEvents}=await import(pathToFileURL(resolve(lib,'projection.js')));
const session=resolve(root,'runtime/community/sessions/--Users-rui-Documents-ChatGPT-blog-book-deepseek-harness-lab--/session-4cfc84e2-e71b-4587-856a-0592062a552e/session.jsonl.zstd');
const events=execFileSync('zstd',['-dc',session],{maxBuffer:32*1024*1024}).toString().trim().split('\n').map(JSON.parse);
const config=resolveConfig({currency:'USD',rates:[{provider:'deepseek-official',model:'deepseek-v4-flash',uncachedInput:0,cacheRead:0,cacheWrite:0,output:0}]});
const result={note:'Zero-rate counter experiment, not actual cost or invoice',pluginVersion:'0.2.5',result:foldModelCostEvents(config,events)};
writeFileSync(resolve(root,'evidence/usage-replay.json'),JSON.stringify(result,null,2)+'\n');
console.log({requests:result.result.requests,input:result.result.uncachedInputTokens,output:result.result.outputTokens});
