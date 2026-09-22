import {fileURLToPath} from 'node:url';
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem';

export const name = 'book-release-review';
export const inject = ['skills', 'systemPrompt'];

export function apply(ctx) {
  ctx.plugin(SkillFilesystem, {
    providerName: 'book-release-review-files',
    includeDefaultRoots: false,
    customSkillDirs: [fileURLToPath(new URL('./skills', import.meta.url))],
  });
  ctx.systemPrompt.section({
    name: 'book:release-review',
    order: 40,
    text: '当用户要求对 Node.js 项目做发布前审查时，先通过 skill 工具加载 project-release-review，再按其检查步骤工作。默认只读审查；执行命令或修改需要用户授权，不执行发布。其他任务不套用发布审查清单。',
  });
}
