import {defineTool} from '@deepseek-ai/dsh-tools';
import {runner, sampleLines} from './templates.js';

export const name = 'book-experiment-workbench';
export const inject = ['tools', 'fs', 'shell', 'terminals'];
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'experiment_workbench',
    description: 'Local JSONL import-preview workbench. Prepare example files using Filesystem, validate config with Shell, and run an interactive preview using PTY. No network or database writes. Requires user authorization to create files and run the example. read/list do not imply the task completed; timeout is only the end of a wait. Close owned terminals after use. State survives browser reconnect only while its DSH Agent and Host are alive; Host restart does not restore a PTY.',
    parameters: {
      action: {type:'string',required:true,enum:['prepare','check','open','send','read','interrupt','close','list','result']},
      terminalId: {type:'string',description:'Copy the id returned by open, required for send/read/interrupt/close.'},
      input: {type:'string',enum:['launch','run','pause','status','quit'],description:'send only: launch starts the prepared program; other choices are interactive input.'},
    },
    output: {schema:{type:'string'},render:(_args,text)=>[{type:'text',text}]},
    timeoutMs: 45_000,
    async execute(args, exec) {
      const owner=exec.agent;
      const cwd=owner?.session.header.cwd;
      if(!owner || !cwd) throw new Error('请先选择本练习工作区');
      const root=await ctx.fs.resolve('.', {cwd,signal:exec.signal});
      const target=await ctx.fs.resolve('.dsh-workbench', {cwd,signal:exec.signal});
      if(!ctx.fs.contains(root,target)) throw new Error('工作台目录必须在当前工作区内');
      const directory=ctx.fs.processPath(target);
      const file=async name=>{
        const t=await ctx.fs.resolve(name,{cwd:directory,signal:exec.signal});
        if(!ctx.fs.contains(target,t)) throw new Error('文件越出工作台目录');
        return t;
      };
      let value;
      if(args.action==='prepare') {
        const contents={'preview.mjs':runner,'config.json':JSON.stringify({delayMs:500},null,2),'sample.jsonl':sampleLines()};
        const created=[], kept=[];
        for(const [name,text] of Object.entries(contents)) {
          const t=await file(name);
          if(await ctx.fs.stat(t,exec.signal)) {kept.push(name);continue;}
          await ctx.fs.writeText(t,text,{kind:'createIfAbsent'},exec.signal);
          created.push(name);
        }
        value={directory,created,kept,note:'已有文件保持不变；练习数据不来自生产。'};
      } else if(args.action==='check') {
        const result=await ctx.shell.run(ctx.shell.resolve({command:'node preview.mjs --check',workdir:directory,timeoutMs:10_000,signal:exec.signal}));
        value={exitCode:result.exitCode,signal:result.signal,timedOut:result.timedOut,aborted:result.aborted,stdout:result.stdout.text,stderr:result.stderr.text};
      } else if(args.action==='result') {
        value=JSON.parse(await ctx.fs.readText(await file('result.json'),exec.signal));
      } else if(args.action==='list') {
        value=ctx.terminals.list(owner);
      } else if(args.action==='open') {
        value=await ctx.terminals.spawn(owner,{type:'shell',name:'导入预检',cwd:directory},exec.signal);
      } else {
        if(!args.terminalId) throw new Error('需要 open 返回的 terminalId');
        if(args.action==='send') {
          if(!args.input) throw new Error('send 需要 input');
          const text=args.input==='launch'?'node '+quote('preview.mjs'):args.input;
          value=await ctx.terminals.startSend(owner,args.terminalId,{text,submit:true,signal:exec.signal}).done;
        } else if(args.action==='read') value=ctx.terminals.read(owner,args.terminalId,{count:24});
        else if(args.action==='interrupt') value=await ctx.terminals.signal(owner,args.terminalId,'SIGINT');
        else if(args.action==='close') value={closed:await ctx.terminals.kill(owner,args.terminalId,'用户关闭实验工作台')};
      }
      return JSON.stringify(value,null,2);
    },
  }));
}
