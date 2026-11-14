export const name = 'book-workbench-only';
export const inject = ['tools'];
export function apply(ctx) {
  ctx.tools.guard(exec => exec.name === 'experiment_workbench' ? undefined : '本次接口实验仅允许 experiment_workbench。不要搜索其他目录或自行创建替代程序。');
}
