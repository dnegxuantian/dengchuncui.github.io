import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkLinks(file) {
  const absolute = resolve(file);
  const markdown = readFileSync(absolute, 'utf8');
  const targets = [...markdown.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)]
    .map(match => match[1])
    .filter(target => !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target));
  return targets.map(target => {
    const pathname = decodeURIComponent(target.split(/[?#]/)[0]);
    return { target, exists: existsSync(resolve(dirname(absolute), pathname)) };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node check-links.mjs <Markdown 文件>');
    process.exitCode = 2;
  } else {
    try {
      const results = checkLinks(file);
      const missing = results.filter(result => !result.exists);
      for (const { target } of missing) console.log(`缺失：${target}`);
      console.log(`检查 ${results.length} 个本地链接，缺失 ${missing.length} 个。`);
      process.exitCode = missing.length ? 1 : 0;
    } catch (error) {
      console.error(`无法检查：${error.message}`);
      process.exitCode = 2;
    }
  }
}
