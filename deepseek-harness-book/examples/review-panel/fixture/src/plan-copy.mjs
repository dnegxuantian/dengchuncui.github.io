import { resolve } from 'node:path';

export function planCopy(items, outputDir) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  return items.map(({ source, target }) => ({
    source,
    destination: resolve(outputDir, target),
  }));
}
