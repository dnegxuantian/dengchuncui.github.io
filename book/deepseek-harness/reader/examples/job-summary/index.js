import { summarizeJobs } from './stats.js';

export const name = 'book-job-summary';
export const inject = ['tools', 'fs'];

export function apply(ctx) {
  ctx.tools.register({
    name: 'book_job_summary',
    description: 'Read a JSON array of {name, durationSeconds} from the workspace and compute count, sum, average, min, max, median and nearest-rank p95. Sum is not wall-clock duration. Throws on invalid or empty data.',
    parameters: {
      type: 'object',
      properties: {file_path: {type: 'string', description: 'Absolute path to the task-duration JSON file'}},
      required: ['file_path'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          count: {type: 'integer'},
          totalSeconds: {type: 'number'},
          averageSeconds: {type: 'number'},
          minSeconds: {type: 'number'},
          maxSeconds: {type: 'number'},
          medianSeconds: {type: 'number'},
          p95Seconds: {type: 'number'},
          percentileMethod: {type: 'string'},
        },
        required: ['count', 'totalSeconds', 'averageSeconds', 'minSeconds', 'maxSeconds', 'medianSeconds', 'p95Seconds', 'percentileMethod'],
        additionalProperties: false,
      },
      render: (_args, value) => [{type: 'text', text: JSON.stringify(value)}],
    },
    async execute(args, exec) {
      if (typeof args.file_path !== 'string' || !args.file_path.startsWith('/')) {
        throw new TypeError('file_path must be an absolute POSIX path in this macOS example');
      }
      const cwd = exec.agent?.session.header.cwd;
      if (!cwd) throw new Error('A session workspace is required');
      const options = {cwd, signal: exec.signal};
      const workspace = await ctx.fs.resolve(cwd, options);
      const target = await ctx.fs.resolve(args.file_path, options);
      if (!ctx.fs.contains(workspace, target)) throw new Error('File is outside the session workspace');
      const info = await ctx.fs.stat(target, exec.signal);
      if (!info || info.type !== 'file') throw new Error('Expected an existing regular file');
      if (info.size === undefined || info.size > 1024 * 1024) throw new RangeError('Sample file size is unknown or exceeds 1 MiB');
      const text = await ctx.fs.readText(target, exec.signal);
      if (text.length > 1024 * 1024) throw new RangeError('Sample file exceeds one million characters');
      return summarizeJobs(JSON.parse(text));
    },
  });
}
