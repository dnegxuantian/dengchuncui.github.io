'use strict';
// The separately built book is static: never pass its source through post filters.
const fs = require('fs');
const path = require('path');
hexo.extend.generator.register('harness-book-reader', function () {
  const root = path.join(hexo.base_dir, 'book/deepseek-harness/reader');
  if (!fs.existsSync(path.join(root, 'index.html'))) return [];
  function walk(dir) {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
      if (dir === root && entry.name === 'edition-2') return []; // Local rewrite preview, not a release.
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Book reader must not contain symlinks');
      if (entry.isDirectory()) return walk(file);
      return [{path: 'deepseek-harness-book/' + path.relative(root, file).split(path.sep).join('/'), data: () => fs.createReadStream(file)}];
    });
  }
  return walk(root);
});
