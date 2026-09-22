import {z} from 'zod';
import {defineDomain, domainTable} from '@deepseek-ai/dsh-storage-domain';

const rule = z.object({
  key:z.string(), value:z.string(), reason:z.string(),
  sessionId:z.string(), changedAt:z.string(),
}).strict();
export const recordSchema = z.object({
  revision:z.number().int().nonnegative(),
  rules:z.array(rule).max(20),
  history:z.array(rule.extend({revision:z.number().int().positive(), previous:z.string().nullable()})).max(20),
}).strict();
export const memorySpec = defineDomain({
  name:'book_project_memory', version:1,
  tables:{projects:domainTable(recordSchema)},
});
