// dev: handles this module with server validation and explicit trust boundaries.
import {spawn,type ChildProcess} from 'node:child_process';
import {loadConfig} from '../apps/api/src/config.js';
const profile=process.argv[2]??'secure',lab=process.argv[3]==='lab';
const env={...process.env,APP_ENV:'local',JWT_PROFILE:profile,LAB_ENABLED:String(lab),HOST:'127.0.0.1',PORT:'3000',WEB_ORIGIN:'http://127.0.0.1:5173',...(lab?{DATA_DIR:'.data/lab'}:{})};
loadConfig(env);const children:ChildProcess[]=[];
const run=(args:string[])=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:'inherit'});children.push(child);child.on('exit',code=>{if(code&&code!==0)stop(code);});};
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();setTimeout(()=>process.exit(code),300).unref();}
if(lab)run(['--import','tsx','apps/lab-keyserver/server.ts']);
run(['--import','tsx','apps/api/src/server.ts']);
run(['node_modules/vite/bin/vite.js','--config','apps/web/vite.config.ts','--host','127.0.0.1']);
for(const s of ['SIGINT','SIGTERM'] as const)process.on(s,()=>stop());
console.log(`Dasani Store: http://127.0.0.1:5173 | JWT profile: ${profile} | lab: ${lab}`);
