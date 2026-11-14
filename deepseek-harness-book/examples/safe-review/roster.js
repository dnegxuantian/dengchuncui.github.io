import AgentPresets from '@deepseek-ai/dsh-agent-presets';
import { fileURLToPath } from 'node:url';

// Retain the official discovery, scope binding, settings and cleanup behavior.
export default class ReviewPresets extends AgentPresets {
  static inject = [...AgentPresets.inject, 'permissionPresets'];
  constructor(ctx, config) {
    super(ctx, {...config, roots: [
      {path: fileURLToPath(new URL('./config/agent-presets/', import.meta.resolve('@deepseek-ai/dsh/package.json'))), trust: 'system'},
      ...config.roots,
      {path: fileURLToPath(new URL('./presets/', import.meta.url)), trust: 'system'},
    ]});
  }

  async recompose(agentCtx, id) {
    const preset = await super.recompose(agentCtx, id);
    if (preset.id === 'book-safe-review') {
      this.ctx.permissionPresets.set(agentCtx.agent.session, 'read-only');
    }
    return preset;
  }
}
