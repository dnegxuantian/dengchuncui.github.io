// Build a shareable reader from an explicit allowlist. Never copy runtime.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync,existsSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,'reader');mkdirSync(out,{recursive:true});
const retiredHeader=resolve(out,'tools/reader-head.html');
if(existsSync(retiredHeader))unlinkSync(retiredHeader);
function copy(dir){
  const src=resolve(root,dir),dst=resolve(out,dir);mkdirSync(dst,{recursive:true});
  for(const item of readdirSync(src,{withFileTypes:true})){
    if(item.isDirectory())throw new Error('Unexpected nested source directory: '+dir);
    if(!/\.(md|mjs|mts|js|json|png|svg|puml|yml|inc)$/.test(item.name)&&item.name!=='LICENSE')continue;
    copyFileSync(join(src,item.name),join(dst,item.name));
  }
}
for(const dir of ['screenshots','diagrams','chapters','community','evidence','tools','examples/job-summary','lab'])copy(dir);
let book='---\ntitle: "DeepSeek Harness：即插即用的实战指南"\nsubtitle: "从第一个任务到插件开发与故障排查 · 实测版 0.1"\nauthor: "邓明瑞（纯粹）"\ndate: "2026-09-08"\nlang: zh-CN\n---\n\n';
book+='本版包括十章、真实操作截图、PlantUML 架构图、完整教学插件与社区案例索引。macOS 实测；未通过和未测试的范围在对应章节明确保留。不代表 DeepSeek 官方文档或正式出版物。\n\n[下载 EPUB](deepseek-harness-guide.epub) · [下载教学插件](dsh-book-job-summary-0.1.1.tgz)\n\n';
const chapters=readdirSync(resolve(root,'chapters')).filter(f=>f.endsWith('.md')).sort();
for(const f of chapters)book+=readFileSync(resolve(root,'chapters',f),'utf8').replace(/\]\(\.\.\//g,'](')+'\n\n';
book+='\n# 附录 A：社区来源与复测状态\n\n'+readFileSync(resolve(root,'community/cases.md'),'utf8').replace(/^# 社区投稿与问题案例台账\n/,'')+'\n';
book+='\n# 附录 B：教学插件完整源码\n\n以下内容直接从配套源码生成，避免书中代码与实际测试版本不一致。\n\n';
for(const f of ['package.json','cordis.patch.yml','stats.js','index.js','stats.test.js','LICENSE']){
  const lang=f.endsWith('.js')?'js':f.endsWith('.json')?'json':f.endsWith('.yml')?'yaml':'text';
  book+=`\n## ${f}\n\n\`\`\`${lang}\n${readFileSync(resolve(root,'examples/job-summary',f),'utf8')}\n\`\`\`\n`;
}
book+='\n# 附录 C：实验记录\n\n'+readFileSync(resolve(root,'evidence/validation.md'),'utf8').replace(/^# .*\n/,'');
writeFileSync(resolve(out,'book.md'),book);
execFileSync('npm',['pack','--ignore-scripts',resolve(root,'examples/job-summary'),'--pack-destination',out],{stdio:'pipe'});
execFileSync('pandoc',['book.md','--standalone','--toc','--toc-depth=1','--include-in-header',resolve(root,'tools/reader-head.inc'),'--metadata','pagetitle=DeepSeek Harness 实战指南','-o','index.html'],{cwd:out});
// EPUB embeds images; supporting source is in Appendix B, not dangling local URLs.
const epubBook=book.replace(/^\[下载 EPUB\].*\n/m,'').replace(/(?<!!)\[([^\]]+)\]\((?!https?:|#)[^)]+\)/g,'$1');
execFileSync('pandoc',['--from=markdown','--toc','--toc-depth=2','-o','deepseek-harness-guide.epub'],{cwd:out,input:epubBook});
console.log(JSON.stringify({chapters:chapters.length,characters:book.length,output:out}));
