// api: handles this module with server validation and explicit trust boundaries.
import type {User} from '../../../../packages/contracts/index.js';
type Session={user:User;accessToken:string};
let accessToken='';let refreshing:Promise<Session>|null=null;
const listeners=new Set<(user:User|null)=>void>();
export function subscribeSession(fn:(user:User|null)=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function setSession(session:Session|null){accessToken=session?.accessToken??'';for(const fn of listeners)fn(session?.user??null);}
export async function api<T>(path:string,options:RequestInit={},retry=true):Promise<T>{
  const headers=new Headers(options.headers);if(options.body)headers.set('Content-Type','application/json');if(accessToken)headers.set('Authorization',`Bearer ${accessToken}`);
  const response=await fetch(path,{...options,headers,credentials:'include'});
  if(response.status===401&&retry&&!path.startsWith('/api/auth/')){
    try{await refreshSession();return api<T>(path,options,false);}catch{setSession(null);}
  }
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error?.message??'Unable to connect to the service');
  return body as T;
}
export async function refreshSession(){if(!refreshing)refreshing=api<Session>('/api/auth/refresh',{method:'POST'},false).then(s=>{setSession(s);return s;}).finally(()=>{refreshing=null;});return refreshing;}
export const json=(value:unknown)=>JSON.stringify(value);
