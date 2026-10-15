import { basename, resolve } from 'node:path';

export function planCopy(sources, outputDir) {
  return sources.map(source => ({ source, destination: resolve(outputDir, basename(source)) }));
}
