// password: handles this module with server validation and explicit trust boundaries.
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
function derive(password:string,salt:string):Promise<Buffer> { return new Promise((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1},(e,key)=>e?reject(e):resolve(key))); }
export async function hashPassword(password:string):Promise<string> { const salt=randomBytes(16).toString('hex'); return `${salt}:${(await derive(password,salt)).toString('hex')}`; }
export async function verifyPassword(password:string,hash:string):Promise<boolean> { const [salt,value]=hash.split(':'); if(!salt||!value) return false; const expected=Buffer.from(value,'hex'); const result=await derive(password,salt); return result.length===expected.length && timingSafeEqual(result,expected); }
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
