import z from '@deepseek-ai/schemastery';
import {SandboxProvider, writableRoots} from '@deepseek-ai/dsh-sandbox';

const literal = text => JSON.stringify(text);

// This is a macOS process provider, NOT isolation of Node plugins in the Host.
export default class TrialSandbox extends SandboxProvider {
  static Config = z.object({offline: z.boolean().default(true)});
  constructor(ctx, config) {
    super(ctx);
    if (process.platform !== 'darwin') throw new Error('本例只实现 macOS Seatbelt，不会退回无沙箱执行');
    this.offline = config.offline;
    this.trialSpace = true;
  }
  confine(argv, policy) {
    if (!['read-only', 'workspace-write'].includes(policy.mode)) {
      throw new Error('试验空间只接受受限文件模式');
    }
    const forms = ['(version 1)', '(allow default)', '(deny file-write*)',
      '(allow file-write* (literal "/dev/null"))'];
    const roots = writableRoots(policy);
    if (roots.length) forms.push(`(allow file-write* ${roots.map(p => `(subpath ${literal(p)})`).join(' ')})`);
    if (this.offline) forms.push('(deny network*)');
    return {
      argv: ['/usr/bin/sandbox-exec', '-p', forms.join(' '), '--', ...argv],
      enforcement: 'full',
      denialSignatures: ['operation not permitted'],
      runnerFailureRules: [{fatalSignatures: ['sandbox-exec: ']}],
    };
  }
}
