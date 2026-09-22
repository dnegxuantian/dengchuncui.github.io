import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function findLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
}

export async function checkFile(file) {
  const markdown = await readFile(file, 'utf8');
  const results = [];
  for (const target of findLinks(markdown)) {
    const absolute = resolve(dirname(file), target);
    try {
      await access(absolute);
      results.push({ target, status: 'ok' });
    } catch {
      results.push({ target, status: 'broken' });
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node src/check-links.mjs <file>');
    process.exitCode = 2;
  } else {
    const results = await checkFile(resolve(file));
    for (const result of results) console.log(`${result.status}: ${result.target}`);
  }
}
