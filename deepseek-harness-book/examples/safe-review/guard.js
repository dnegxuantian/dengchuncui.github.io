import { realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

export const name = 'book-safe-review-guard';
export const inject = ['tools', 'permissionPresets'];

export function apply(ctx) {
  // The preset owns this scope. It does not install a process-wide guard.
  ctx.tools.guard(exec => {
    if (!['read', 'glob', 'grep'].includes(exec.name)) {
      return `安全审阅模式拒绝 ${exec.name}：仅允许 read、glob、grep。请在对话中给出建议。`;
    }
    const cwd = exec.agent.session.header.cwd;
    if (!cwd) return '安全审阅缺少工作区，拒绝访问文件';
    const input = exec.name === 'read' ? exec.arguments.file_path : (exec.arguments.path ?? '.');
    if (typeof input !== 'string') return '安全审阅要求明确的文件或目录路径';
    try {
      const root = realpathSync(cwd);
      const target = realpathSync(resolve(root, input));
      const part = relative(root, target);
      if (part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) return '安全审阅只读取当前工作区，拒绝越界路径';
    } catch {
      return '安全审阅无法确认路径位于工作区内';
    }
  });
  // Match the visible permission selector to newly created review sessions.
  // A later UI permission change does not remove the guard above.
  ctx.on('agent/created', ({ agent }) => ctx.permissionPresets.set(agent.session, 'read-only'));
}
