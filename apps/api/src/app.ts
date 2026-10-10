// app: handles this module with server validation and explicit trust boundaries.
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { loadConfig,type Config } from './config.js';
import { createDb,migrate,type Db } from './database/db.js';
import { seed } from './database/seed.js';
import { loadKeys,type Keys } from './auth/keys.js';
import { createJwt } from './auth/jwt.js';
import { authGuards,authRoutes } from './auth/routes.js';
import { catalogRoutes } from './catalog/routes.js';
import { orderRoutes } from './orders/routes.js';
import { adminRoutes } from './admin/routes.js';
import { AppError,fail } from './errors.js';
export async function buildApp(options:{config?:Config;db?:Db;keys?:Keys;fetcher?:typeof fetch;logger?:boolean}={}) {
  const config=options.config??loadConfig();
  if(config.hosted&&(config.lab||config.profile!=='secure')) throw new Error('Hosted mode cannot enable the lab');
  const db=options.db??await createDb(config); await migrate(db,config.root); await seed(db,config);
  const keys=options.keys??await loadKeys(config);
  const app=Fastify({bodyLimit:131072,logger:options.logger===false?false:{level:'info',redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie']}});
  app.decorateRequest('principal',null);
  await app.register(cookie); await app.register(rateLimit,{global:false});
  const jwt=createJwt(config,keys,event=>app.log.info(event,'jwt.resolver'),options.fetcher);
  const guards=authGuards(db,jwt);
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof ZodError) return reply.code(400).send({error:{code:'VALIDATION_ERROR',message:error.issues.map(i=>`${i.path.join('.')||'Input'}: ${i.message}`).join('; ')}});
    if(error instanceof AppError) return reply.code(error.status).send({error:{code:error.code,message:error.message}});
    if((error as {code?:string}).code==='23505') return reply.code(409).send({error:{code:'DUPLICATE',message:'Email, slug or variant already exists'}});
    const status=(error as {statusCode?:number}).statusCode;
    if(status&&status<500) return reply.code(status).send({error:{code:'REQUEST_ERROR',message:'Invalid request'}});
    app.log.error({requestId:request.id,errorName:(error as Error).name},'Internal error');
    return reply.code(500).send({error:{code:'INTERNAL_ERROR',message:'Unable to process this request'}});
  });
  app.get('/api/health',async()=>{await db.query('SELECT 1');return {status:'ok'};});
  await authRoutes(app,db,jwt,config);await catalogRoutes(app,db);await orderRoutes(app,db,guards);await adminRoutes(app,db,guards);
  if(config.lab) app.post('/api/lab/partner/preview',async req=>{
    const auth=req.headers.authorization;
    if(!auth?.startsWith('Bearer ')||auth.length>20000) fail(401,'AUTH_REQUIRED','Partner token required');
    try {const subject=await jwt.verify(auth.slice(7),true); if(subject!=='partner-demo') throw new Error('Unexpected partner subject');}
    catch {fail(401,'PARTNER_INVALID','Invalid partner token');}
    return {partner:'partner-demo',preview:[{sku:'PARTNER-SAMPLE',name:'Sample preview data',stock:10}]};
  });
  const webRoot=join(config.root,'apps/web/dist');
  if(existsSync(webRoot)) await app.register(staticFiles,{root:webRoot,prefix:'/'});
  app.setNotFoundHandler((req,reply)=>{
    if(!req.url.startsWith('/api/')&&req.method==='GET'&&req.headers.accept?.includes('text/html')&&existsSync(webRoot)) return reply.sendFile('index.html');
    return reply.code(404).send({error:{code:'NOT_FOUND',message:'Route not found'}});
  });
  app.addHook('onClose',async()=>{await db.close();});
  return {app,db,jwt,config,keys};
}
