#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function describeConfig(value) {
  if (typeof value.endpoint !== 'string' || !value.endpoint) throw new Error('endpoint is required');
  if (value.timeoutMs !== undefined && (!Number.isInteger(value.timeoutMs) || value.timeoutMs <= 0)) {
    throw new Error('timeoutMs must be a positive integer');
  }
  return {endpoint: value.endpoint, timeoutMs: value.timeoutMs ?? 5000};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error('Usage: release-lens CONFIG.json');
    console.log(JSON.stringify(describeConfig(JSON.parse(readFileSync(process.argv[2], 'utf8')))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
