export const name = 'book-release-read-only';
export const inject = ['tools'];

const allowed = new Set(['skill', 'read', 'glob', 'grep']);

export function readOnlyReason(exec) {
  if (!allowed.has(exec.name)) {
    return `发布审查只读模式拒绝 ${exec.name}；仅允许 skill、read、glob、grep。请不要换用其他工具执行命令或写文件。`;
  }
}

export function apply(ctx) {
  ctx.tools.guard(readOnlyReason);
}
