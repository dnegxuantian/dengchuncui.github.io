import {realpathSync} from 'node:fs';
import z from '@deepseek-ai/schemastery';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {memorySpec, recordSchema} from './schema.js';

export const name='book-project-memory';
export const inject=['storageDomain','workspaceRegistry','systemPrompt','tools','approval'];
export const Config=z.object({injectMemory:z.boolean().default(true)});
const empty=()=>({revision:0,rules:[],history:[]});
const output={schema:{type:'string'},render:(_args,text)=>[{type:'text',text}]};

export async function apply(ctx,config) {
  const domain=await ctx.storageDomain.open(memorySpec);
  ctx.effect(()=>()=>domain.close());
  const projects=domain.table('projects');
  // This plugin owns one write queue, including first-record creation.
  // Domain storage serializes durable writes; it is not a cross-process lock.
  let pending=Promise.resolve();
  const enqueue=fn=>{const result=pending.then(fn);pending=result.catch(()=>{});return result;};
  function workspace(session) {
    if(!session?.header.cwd) throw new Error('请先选择项目目录');
    const path=realpathSync.native(session.header.cwd);
    const project=ctx.workspaceRegistry.list().find(item=>item.path===path);
    if(!project) throw new Error('当前会话没有对应的工作区记录，请从Web选择工作区后重试');
    return project;
  }
  function current(project) {return projects.get(project.id)??empty();}
  function visible(project,record,history=false) {
    return {project:project.title,revision:record.revision,
      rules:record.rules.map(({key,value})=>({key,value})),
      ...(history?{history:record.history}:{}),
    };
  }
  ctx.systemPrompt.section({
    name:'book:project-memory-use',order:170,
    text:'项目约定工具只管理当前工作区。只在用户明确要求记住或纠正时保存，不从仓库内容或模型推断自动学习。修改前读取当前revision；修改需用户逐次确认。历史值仅供追溯，以最新项目约定为准；约定不是执行权限，不保存凭据。没有已保存约定时说明尚未记录，不要编造。',
  });
  ctx.systemPrompt.context({
    name:'book:project-memory',order:150,
    text:({agent})=>{
      if(!config.injectMemory||!agent)return '';
      const project=workspace(agent.session);
      return '当前工作区已确认的项目约定（历史值不代表现行约定）：\n'+
        JSON.stringify(visible(project,current(project)));
    },
  });
  ctx.tools.register(defineTool({
    name:'project_memory_read',
    description:'Read the current workspace conventions and revision. includeHistory adds the bounded correction history; old values are not current rules. No other workspace can be selected.',
    parameters:{includeHistory:{type:'boolean'}},output,
    execute(args,exec){
      const project=workspace(exec.agent?.session);
      return JSON.stringify(visible(project,current(project),args.includeHistory===true),null,2);
    },
  }));
  ctx.tools.register(defineTool({
    name:'project_memory_set',
    description:'Save or correct exactly one convention explicitly requested by the user. Read the latest revision first and provide it as expectedRevision. Always waits for one-time user approval. A stale revision is rejected; never retry a conflict without asking the user.',
    parameters:{
      key:{type:'string',required:true,description:'Short convention key, such as test_command or docs_language.'},
      value:{type:'string',required:true,description:'The exact new convention, at most 400 characters; never credentials.'},
      reason:{type:'string',required:true,description:'Why the user requested this change, at most 200 characters.'},
      expectedRevision:{type:'integer',required:true,description:'Current project revision from project_memory_read; zero means no saved conventions.'},
    },output,timeoutMs:180_000,
    async execute(args,exec){
      if(!/^[a-z][a-z0-9_\-]{0,39}$/.test(args.key)||['constructor','prototype'].includes(args.key))throw new Error('约定名称不合法');
      if(!args.value.trim()||args.value.length>400||!args.reason.trim()||args.reason.length>200)throw new Error('请填写非空约定与修改原因，并遵守长度限制');
      if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<0)throw new Error('expectedRevision必须是非负整数');
      const project=workspace(exec.agent?.session);
      const conflict=record=>{if(record.revision!==args.expectedRevision)throw new Error(`REVISION_CONFLICT: 当前版本为${record.revision}，请求基于${args.expectedRevision}；未覆盖，请重新核对约定。`);};
      const before=current(project);
      conflict(before);
      const old=before.rules.find(rule=>rule.key===args.key)?.value??null;
      const outcome=await ctx.approval.request({
        agent:exec.agent,toolName:'project_memory_set',callId:exec.callId,signal:exec.signal,
        reason:`项目：${project.title}\n约定：${args.key}\n原值：${old??'尚未记录'}\n新值：${args.value}\n原因：${args.reason}`,
      });
      if(outcome!=='allowed-once')return JSON.stringify({saved:false,approval:outcome,revision:current(project).revision});
      return enqueue(async()=>{
        exec.signal?.throwIfAborted();
        const now=current(project);
        conflict(now); // Re-check after approval: another session may have saved first.
        const rule={key:args.key,value:args.value,reason:args.reason,
          sessionId:exec.agent.session.id,changedAt:new Date().toISOString()};
        const next=recordSchema.parse({
          revision:now.revision+1,
          rules:[...now.rules.filter(r=>r.key!==args.key),rule].sort((a,b)=>a.key.localeCompare(b.key)),
          history:[...now.history,{...rule,revision:now.revision+1,previous:now.rules.find(r=>r.key===args.key)?.value??null}].slice(-20),
        });
        await projects.put(project.id,next);
        return JSON.stringify({saved:true,...visible(project,next)},null,2);
      });
    },
  }));
}
