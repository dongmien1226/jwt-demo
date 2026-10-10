// server: handles this module with server validation and explicit trust boundaries.
import { buildApp } from './app.js';
const {app,config}=await buildApp();
await app.listen({host:config.host,port:config.port});
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
