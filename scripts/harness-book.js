'use strict';

// Serve only the reviewed public tree. The book is generated before Hexo runs;
// this plugin never walks the private reader/source tree.
const fs = require('node:fs');
const path = require('node:path');

hexo.extend.generator.register('harness-book-reader', function () {
  const root = path.join(hexo.base_dir, 'publication/deepseek-harness/dist/book');
  const file = path.join(root, 'index.html');
  if (!fs.existsSync(file)) {
    hexo.log.warn(`DeepSeek Harness public book missing: ${file}`);
    return [];
  }
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Public book must not contain symlinks');
      if (entry.isDirectory()) return walk(absolute);
      return [{
        path: `deepseek-harness-book/${path.relative(root, absolute).split(path.sep).join('/')}`,
        data: fs.readFileSync(absolute),
        layout: false
      }];
    });
  }
  return walk(root);
});

hexo.extend.generator.register('harness-book-sitemap', function () {
  const urls = [
    'https://blog.chuncui.icu/deepseek-harness-book/',
    'https://blog.chuncui.icu/deepseek-harness-guide/',
    'https://blog.chuncui.icu/about/'
  ].map((loc) => `  <url><loc>${loc}</loc><lastmod>2026-09-22</lastmod></url>`).join('\n');
  return [{
    path: 'book-sitemap.xml',
    data: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}\n</urlset>`,
    layout: false
  }];
});
