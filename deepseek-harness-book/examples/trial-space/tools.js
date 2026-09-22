import z from '@deepseek-ai/schemastery';
import {defineTool} from '@deepseek-ai/dsh-tools';

export const name = 'book-trial-tools';
export const inject = ['tools', 'shell', 'sandboxPolicy', 'sandbox', 'approval', 'fs'];
const commands = ['inspect', 'write-report', 'outside-write', 'outside-read', 'network', 'count-files'];
export const Config = z.object({
  allowedCommands: z.array(z.string()).default(commands.filter(x => x !== 'count-files')),
});
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

export function apply(ctx, config) {
  if (ctx.sandbox.trialSpace !== true) throw new Error('试验空间的 SandboxProvider 未装配，拒绝加载工具');
  const allowed = new Set(config.allowedCommands);
  ctx.tools.guard(exec => {
    if (exec.name !== 'trial_run') return '本练习只允许 trial_run，请勿另写程序或改用其他工具。';
    if (!allowed.has(exec.arguments?.command)) return '该命令未列入试验空间的 allowedCommands，未启动进程。';
    if (ctx.sandboxPolicy.resolve({session: exec.agent?.session}).mode === 'danger-full-access') {
      return '试验空间拒绝在 danger-full-access 下运行，请选择受限模式。';
    }
  });
  ctx.tools.register(defineTool({
    name: 'trial_run',
    description: 'Run a fixed test command in the dedicated DSH trial fixture. inspect reads fictional package metadata; write-report asks for one-time approval before writing report.json; outside-write and outside-read touch only the dedicated sibling outside marker; network contacts only 127.0.0.1:43117; count-files is initially denied by the command allow-list. Never substitute other programs, escalate, or retry denied commands.',
    parameters: {command: {type: 'string', required: true, enum: commands}},
    output: {schema: {type: 'string'}, render: (_args, text) => [{type:'text', text}]},
    timeoutMs: 90_000,
    async execute(args, exec) {
      const session = exec.agent?.session;
      const cwd = session?.header.cwd;
      if (!cwd) throw new Error('请先选择专用试验目录');
      const marker = await ctx.fs.resolve('.trial-fixture.json', {cwd, signal:exec.signal});
      const meta = JSON.parse(await ctx.fs.readText(marker, exec.signal));
      if (meta.kind !== 'dsh-book-trial-space-v1') throw new Error('当前目录不是本节的专用试验目录');
      let approval;
      if (args.command === 'write-report') {
        approval = await ctx.approval.request({
          agent: exec.agent, toolName:'trial_run', callId:exec.callId,
          reason:'本次将覆盖专用练习目录中的 report.json，内容仅为虚构插件检查报告。不会写入其他目录。',
          signal:exec.signal,
        });
        if (approval !== 'allowed-once') return JSON.stringify({executed:false, approval});
      }
      const policy = ctx.sandboxPolicy.resolve({session});
      const result = await ctx.shell.run(ctx.shell.resolve({
        command: `${quote(process.execPath)} ${quote('probe.mjs')} ${quote(args.command)}`,
        workdir:cwd, timeoutMs:8000, signal:exec.signal, sandboxPolicy:policy,
      }));
      return JSON.stringify({command:args.command, mode:policy.mode, approval,
        exitCode:result.exitCode, timedOut:result.timedOut, aborted:result.aborted,
        stdout:result.stdout.text, stderr:result.stderr.text, sandbox:result.sandbox}, null, 2);
    },
  }));
}
