import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const editionTwo=process.argv.includes('--edition-two');
const dir=resolve(root,editionTwo?'reader/edition-2':'reader');
const html=readFileSync(resolve(dir,'index.html'),'utf8');
const issues=[];
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)){
  const url=m[1];if(/^(https?:|data:|mailto:)/.test(url))continue;
  if(url.startsWith('#')){if(!ids.has(url.slice(1)))issues.push('Missing anchor: '+url);continue;}
  const path=resolve(dir,decodeURIComponent(url.split('#')[0]));
  if(!existsSync(path))issues.push('Missing local asset: '+url);
  if(relative(dir,path).startsWith('..'))issues.push('Escaped reader: '+url);
}
function walk(d){return readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(d,e.name)):[resolve(d,e.name)]);}
const secrets=['/tmp/deepseek','/tmp/pass'].filter(existsSync).map(p=>readFileSync(p,'utf8').trim()).filter(s=>s.length>=8);
for(const file of walk(dir)){
  if(file.includes('/runtime/'))issues.push('Runtime leaked');
  const bytes=readFileSync(file);for(const secret of secrets)if(bytes.includes(Buffer.from(secret)))issues.push('Credential match in '+relative(dir,file));
}
const chapterDir=resolve(root,editionTwo?'edition-2':'chapters');
const result={checkedAt:new Date().toISOString(),htmlLocalLinks:'checked',chapterCount:readdirSync(chapterDir).filter(f=>editionTwo?/^\d\d-.*\.md$/.test(f):f.endsWith('.md')).length,credentialMatches:issues.filter(i=>i.startsWith('Credential')).length,issues};
writeFileSync(resolve(root,editionTwo?'edition-2/reader-check.json':'evidence/reader-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(result);if(issues.length)process.exitCode=1;
