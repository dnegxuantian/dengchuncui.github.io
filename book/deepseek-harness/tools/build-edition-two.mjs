// Local second-edition preview. This is not part of the production generator.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const source=new URL('edition-2/',root),out=new URL('reader/edition-2/',root);
mkdirSync(out,{recursive:true});
for(const file of readdirSync(source))if(/\.(md|json|png)$/.test(file))copyFileSync(new URL(file,source),new URL(file,out));
for(const name of ['daily-policy.json','daily-runs.json'])copyFileSync(new URL(`lab/${name}`,root),new URL(name,out));
const chapters=readdirSync(source).filter(n=>/^\d\d-.*\.md$/.test(n)).sort();
const md='---\ntitle: "DeepSeek Harness：即插即用的实战指南"\nsubtitle: "第二版重写样章 · 从一份作业日报开始"\nauthor: "邓明瑞（纯粹）"\nlang: zh-CN\n---\n\n本页是重写中的前两章，不是完成版。\n\n'+chapters.map(f=>readFileSync(new URL(f,source),'utf8')).join('\n\n');
execFileSync('pandoc',['--from=markdown','--standalone','--toc','--toc-depth=2','--include-in-header',new URL('tools/reader-head.inc',root).pathname,'-o',new URL('index.html',out).pathname],{input:md});
let html=readFileSync(new URL('index.html',out),'utf8').replace('</head>','<meta name="robots" content="noindex,nofollow">\n</head>');
html=html.replace(/<img\b[^>]*src="([^"]+)"[^>]*>/g,(tag,src)=>`<a class="book-image-link" href="${src}" target="_blank" rel="noopener">${tag}</a><a class="book-image-help" href="${src}" target="_blank" rel="noopener">查看原尺寸图片 ↗</a>`);
// Detail screenshots are smaller than a full desktop: never stretch them wider than text.
html=html.replace('</head>','<style>figure{width:100%;left:auto;transform:none}figure img{width:auto;max-width:100%}</style></head>');
writeFileSync(new URL('index.html',out),html);
console.log({chapters:chapters.length,url:'http://127.0.0.1:56800/edition-2/'});
