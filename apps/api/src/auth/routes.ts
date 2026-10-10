// routes: handles this module with server validation and explicit trust boundaries.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { User } from '../../../../packages/contracts/index.js';
import type { Db } from '../database/db.js';
import type { Config } from '../config.js';
import type { createJwt } from './jwt.js';
import { hashPassword, verifyPassword, tokenHash } from './password.js';
import { fail } from '../errors.js';
declare module 'fastify' { interface FastifyRequest { principal: User | null } }
type Jwt = ReturnType<typeof createJwt>;
const credentials=z.object({email:z.email().max(200).transform(v=>v.toLowerCase()),password:z.string().min(8).max(128)}).strict();
export function authGuards(db:Db,jwt:Jwt) {
  async function auth(request:FastifyRequest):Promise<void> {
    const value=request.headers.authorization;
    if(!value?.startsWith('Bearer ')||value.length>20000) fail(401,'AUTH_REQUIRED','Please sign in');
    let id:string;
    try { id=await jwt.verify(value.slice(7)); z.uuid().parse(id); } catch { fail(401,'TOKEN_INVALID','Invalid or expired token'); }
    const [user]=await db.query<User>('SELECT id,email,name,role,created_at FROM dasani.users WHERE id=$1',[id]);
    if(!user) fail(401,'USER_NOT_FOUND','Account not found');
    request.principal=user;
  }
  async function admin(request:FastifyRequest):Promise<void> { await auth(request); if(request.principal?.role!=='admin') fail(403,'FORBIDDEN','Administrator access required'); }
  return {auth,admin};
}
export async function authRoutes(app:FastifyInstance,db:Db,jwt:Jwt,config:Config):Promise<void> {
  const guards=authGuards(db,jwt);
  const cookieOptions={httpOnly:true,secure:config.hosted,sameSite:'lax' as const,path:'/api/auth',maxAge:7*86400};
  function checkOrigin(req:FastifyRequest) { if(req.headers.origin && req.headers.origin!==config.origin) fail(403,'ORIGIN_DENIED','Request origin is not allowed'); }
  async function session(user:User,reply:FastifyReply,tx:Db=db) { const raw=randomBytes(32).toString('base64url'); await tx.query('INSERT INTO dasani.sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,tokenHash(raw),new Date(Date.now()+7*86400000).toISOString()]); reply.setCookie('dasani_refresh',raw,cookieOptions); return {user,accessToken:await jwt.sign(user.id)}; }
  app.post('/api/auth/register',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{
    checkOrigin(req); const body=credentials.extend({name:z.string().trim().min(2).max(100)}).parse(req.body);
    if((await db.query('SELECT id FROM dasani.users WHERE email=$1',[body.email])).length) fail(409,'EMAIL_EXISTS','Email is already registered');
    const user:User={id:randomUUID(),email:body.email,name:body.name,role:'customer'};
    await db.query('INSERT INTO dasani.users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[user.id,user.email,user.name,await hashPassword(body.password),user.role]);
    reply.code(201); return session(user,reply);
  });
  app.post('/api/auth/login',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{
    checkOrigin(req); const body=credentials.parse(req.body);
    const [row]=await db.query<User&{passwordHash:string}>('SELECT id,email,name,role,password_hash FROM dasani.users WHERE email=$1',[body.email]);
    if(!row||!await verifyPassword(body.password,row.passwordHash)) fail(401,'BAD_CREDENTIALS','Incorrect email or password');
    const {passwordHash:_,...user}=row; return session(user,reply);
  });
  app.post('/api/auth/refresh',async(req,reply)=>{
    checkOrigin(req); const raw=req.cookies.dasani_refresh; if(!raw) fail(401,'SESSION_EXPIRED','Session expired');
    return db.transaction(async tx=>{
      const [row]=await tx.query<{id:string;userId:string}>('SELECT id,user_id FROM dasani.sessions WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',[tokenHash(raw)]);
      if(!row) {reply.clearCookie('dasani_refresh',{path:'/api/auth'});fail(401,'SESSION_EXPIRED','Session expired');}
      const [user]=await tx.query<User>('SELECT id,email,name,role FROM dasani.users WHERE id=$1',[row.userId]);
      await tx.query('DELETE FROM dasani.sessions WHERE id=$1',[row.id]); return session(user,reply,tx);
    });
  });
  app.post('/api/auth/logout',async(req,reply)=>{checkOrigin(req); const raw=req.cookies.dasani_refresh; if(raw) await db.query('DELETE FROM dasani.sessions WHERE token_hash=$1',[tokenHash(raw)]); reply.clearCookie('dasani_refresh',{path:'/api/auth'}); return {ok:true};});
  app.get('/api/auth/me',{preHandler:guards.auth},async req=>({user:req.principal}));
}
