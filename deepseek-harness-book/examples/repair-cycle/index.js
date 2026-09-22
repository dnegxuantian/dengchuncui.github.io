import {createHash} from 'node:crypto';
import {realpathSync, lstatSync} from 'node:fs';
import {join} from 'node:path';
import z from '@deepseek-ai/schemastery';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {createUserMessage} from '@deepseek-ai/dsh-llm';

export const name='book-repair-cycle';
export const inject=['tools','fs','shell','sandboxPolicy','systemPrompt'];
export const Config=z.object({
  maxRounds:z.number().min(1).max(5).default(2),
  maxSteps:z.number().min(3).max(30).default(14),
  testTimeoutMs:z.number().min(1000).max(30000).default(20000),
  testDelayMs:z.number().min(0).max(15000).default(0),
});
const names=['repair_start','repair_read','repair_write_source'];
const digest=text=>createHash('sha256').update(text).digest('hex');
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const output={schema:{type:'string'},render:(_args,text)=>[{type:'text',text}]};

export function apply(ctx,config){
  for(const [key,value] of Object.entries(config))if(!Number.isSafeInteger(value))throw new Error(key+' must be an integer');
  const states=new WeakMap();
  const owners=new Map();
  const stateOf=agent=>{const s=states.get(agent);if(!s)throw new Error('先调用repair_start开启本项目的修复');return s;};
  function release(agent,s){if(owners.get(s.cwd)===agent)owners.delete(s.cwd);}
  function notice(agent,summary,data,instruction){
    agent.steer(createUserMessage({
      source:{kind:'plugin',plugin:'dsh-book-repair-cycle',form:'notice',summary},
      content:[{type:'text',text:summary+'\n'+JSON.stringify(data,null,2)+'\n'+instruction}],
    }));
  }
  function finish(agent,s,status,result){
    s.phase='summary';s.status=status;s.result=result;
    notice(agent,'修复循环结束：'+status,{round:s.round,maxRounds:config.maxRounds,...result},
      '本轮不再修改文件，不调用工具。用中文向用户说明测试结果；失败就说明仍未修好与需要用户决定的事项，不宣称成功。');
  }
  async function target(cwd,file,signal){
    for(const part of [file.split('/')[0],file])if(lstatSync(join(cwd,part)).isSymbolicLink())throw new Error('练习文件不能是符号链接');
    const root=await ctx.fs.resolve(cwd,{signal});
    const t=await ctx.fs.resolve(file,{cwd,signal});
    if(!ctx.fs.contains(root,t))throw new Error('文件越出练习目录');
    return t;
  }
  async function text(s,file,signal){return ctx.fs.readText(await target(s.cwd,file,signal),signal);}
  async function test(agent,s,signal){
    signal?.throwIfAborted();
    if(digest(await text(s,'tests/slug.test.mjs',signal))!==s.testHash)throw new Error('测试文件已变化，停止验证；不能用修改后的测试证明修复');
    const spec=ctx.shell.resolve({
      command:'env -i PATH=/usr/bin:/bin DSH_BOOK_TEST_DELAY_MS='+config.testDelayMs+' '+quote(process.execPath)+' --test --test-reporter=tap tests/slug.test.mjs',
      workdir:s.cwd,timeoutMs:config.testTimeoutMs,stdoutMaxBytes:16000,signal,
      sandboxPolicy:ctx.sandboxPolicy.resolve({session:agent.session,mode:'read-only'}),
    });
    const result=await ctx.shell.run(spec);
    const stdout=result.stdout.text,stderr=result.stderr.text;
    const complete=!result.stdout.truncated&&!result.stderr.truncated;
    const count=Number(stdout.match(/^# tests (\d+)$/m)?.[1]??0);
    return {passed:result.exitCode===0&&!result.aborted&&!result.timedOut&&complete&&count===s.testCount,
      exitCode:result.exitCode,aborted:result.aborted,timedOut:result.timedOut,testCount:count,
      expectedTestCount:s.testCount,stdout,stderr,testSandbox:result.sandbox};
  }
  ctx.systemPrompt.section({name:'book:repair-cycle',order:175,text:
    '这是有限次代码修复练习。用户要求修复时先调用repair_start；用repair_read读取要求、源码和测试，repair_write_source只修改src/slug.mjs。不要把测试命令交给其他工具。修改后说明完成本次修改，循环插件会在轮次准备结束时复测并给出结果。不要自己反复调用repair_start。遇到测试要求矛盾时明确说明。插件宣布循环结束后只总结，不再调用工具。'});
  ctx.on('agent/created',({agent})=>{
    agent.ctx.tools.restrict({allow:names});
  });
  ctx.tools.guard(exec=>{
    if(!exec.agent)return '修复工具需要会话';
    if(!names.includes(exec.name))return '本练习只允许项目修复工具';
    const s=states.get(exec.agent);
    if(s?.phase==='summary')return '循环已经结束，本步只允许总结';
  });
  ctx.tools.register(defineTool({name:'repair_start',parameters:{},output,
    description:'Start one bounded repair cycle for the selected teaching project. Runs the initial tests. Call once only when the user asks to repair.',
    timeoutMs:35000,
    async execute(_args,exec){
      const agent=exec.agent;
      const old=states.get(agent);
      if(old&&old.phase!=='done')throw new Error('已有修复流程，请等待结束');
      const cwd=realpathSync.native(agent.session.header.cwd);
      if(owners.has(cwd))throw new Error('另一个会话正在修复此目录，请先结束它');
      const s={cwd,phase:'repair',status:'running',round:0,steps:0};
      const meta=JSON.parse(await text(s,'exercise.json',exec.signal));
      if(meta.kind!=='dsh-book-slug-repair-v1'||![5,6].includes(meta.testCount))throw new Error('请选择本节的练习目录');
      s.testCount=meta.testCount;s.testHash=digest(await text(s,'tests/slug.test.mjs',exec.signal));
      // File reads above yield; another session may have claimed the directory meanwhile.
      if(owners.has(cwd))throw new Error('另一个会话正在修复此目录，请先结束它');
      states.set(agent,s);owners.set(cwd,agent);
      try{
        const result=await test(agent,s,exec.signal);s.result=result;
        if(result.passed){s.phase='summary';s.status='already-passed';}
        return JSON.stringify({started:true,maxRounds:config.maxRounds,result},null,2);
      }catch(error){s.phase='done';s.status='start-error';release(agent,s);throw error;}
    },
  }));
  ctx.tools.register(defineTool({name:'repair_read',parameters:{},output,
    description:'Read README, src/slug.mjs, immutable tests and the source hash for a running repair cycle.',
    async execute(_args,exec){
      const s=stateOf(exec.agent);const source=await text(s,'src/slug.mjs',exec.signal);
      return JSON.stringify({requirements:await text(s,'README.md',exec.signal),source,sourceHash:digest(source),
        tests:await text(s,'tests/slug.test.mjs',exec.signal)},null,2);
    },
  }));
  ctx.tools.register(defineTool({name:'repair_write_source',output,
    description:'Replace only src/slug.mjs. Provide the full source and the hash from repair_read. Tests are not writable. After editing, finish your explanation so the loop can retest.',
    parameters:{source:{type:'string',required:true},expectedHash:{type:'string',required:true}},
    async execute(args,exec){
      const s=stateOf(exec.agent);if(s.phase!=='repair')throw new Error('当前不是修改阶段');
      const policy=ctx.sandboxPolicy.resolve({session:exec.agent.session});
      if(policy.mode==='read-only')throw new Error('当前会话为只读，不能修改源码');
      if(args.source.length>16000||!args.source.trim())throw new Error('源码必须为非空且不超过16000字符');
      const t=await target(s.cwd,'src/slug.mjs',exec.signal),info=await ctx.fs.stat(t,exec.signal);
      const old=await ctx.fs.readText(t,exec.signal);
      if(digest(old)!==args.expectedHash)throw new Error('源码已改变，请重新读取后修改');
      await ctx.fs.writeText(t,args.source,{kind:'replaceIfVersion',version:info.version},exec.signal,policy);
      return JSON.stringify({saved:true,path:'src/slug.mjs',sourceHash:digest(args.source)});
    },
  }));
  ctx.on('agent/pre-step',async({agent},next)=>{
    const s=states.get(agent);
    if(s&&s.phase!=='done'&&++s.steps>config.maxSteps){
      s.status='step-budget';s.phase='done';release(agent,s);
      agent.cancel({kind:'hook',reason:'修复循环达到最大模型步骤数，交还用户'});
      return {kind:'reject'};
    }
    return next();
  });
  ctx.on('agent/turn-stopping',async({agent,signal})=>{
    const s=states.get(agent);if(!s||s.phase==='done')return;
    if(s.phase==='summary'){s.phase='done';release(agent,s);return;}
    const result=await test(agent,s,signal);s.result=result;s.round++;
    signal.throwIfAborted();
    if(result.passed)return finish(agent,s,'passed',result);
    if(result.timedOut||result.aborted)return finish(agent,s,'test-interrupted',result);
    if(s.round>=config.maxRounds)return finish(agent,s,'round-budget',result);
    notice(agent,'第'+s.round+'次复测仍失败，继续修复',result,
      '还剩'+(config.maxRounds-s.round)+'次复测。依据失败与项目要求修复源码；不修改测试。修改后结束说明，等待插件复测。');
  });
  ctx.on('agent/status',({agent,status})=>{
    const s=states.get(agent);if(status==='idle'&&s&&s.phase!=='done'){
      s.status='stopped';s.phase='done';release(agent,s);
    }
  });
  ctx.on('agent/disposed',({agent})=>{const s=states.get(agent);if(s)release(agent,s);});
}
