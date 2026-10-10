// jwt: handles this module with server validation and explicit trust boundaries.
import { SignJWT, jwtVerify, importJWK, type JWK, type JWTHeaderParameters } from 'jose';
import type { Config } from '../config.js';
import { SHOP_ISSUER, PARTNER_ISSUER, SHOP_AUDIENCE, PARTNER_AUDIENCE } from '../config.js';
import type { Keys } from './keys.js';
export type Trace = (event: Record<string,unknown>) => void;
export function labUrl(input:string):URL {
  const u=new URL(input);
  if(u.protocol!=='http:' || u.hostname!=='127.0.0.1' || !['3001','3002'].includes(u.port) || u.username || u.password) throw new Error('Key source is outside the lab network');
  return u;
}
export function createJwt(config:Config,keys:Keys,trace:Trace=()=>{},fetcher:typeof fetch=fetch) {
  const cache=new Map<string,{key:CryptoKey;issuer:string;expires:number}>();
  async function fetchKeys(input:string,redirects:boolean):Promise<JWK[]> {
    let url=labUrl(input);
    for(let step=0;step<4;step++) {
      trace({event:'jwks.fetch',origin:url.origin,path:url.pathname,step});
      const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(3000)});
      if([301,302,303,307,308].includes(response.status)) {
        if(!redirects) throw new Error('JWKS redirects are rejected');
        const location=response.headers.get('location');
        if(!location) throw new Error('Redirect has no Location header');
        // jwt: handles this module with server validation and explicit trust boundaries.
        url=labUrl(new URL(location,url).href); continue;
      }
      if(!response.ok) throw new Error('Key source unavailable');
      const reader=response.body?.getReader(); if(!reader) throw new Error('Empty JWKS');
      let total=0; const chunks:Uint8Array[]=[];
      try { for(;;) { const {value,done}=await reader.read(); if(done) break; total+=value.byteLength; if(total>65536) throw new Error('JWKS size limit exceeded'); chunks.push(value); } } finally { await reader.cancel(); }
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {keys?:JWK[]};
      if(!Array.isArray(body.keys)||body.keys.length>20) throw new Error('Invalid JWKS');
      return body.keys;
    }
    throw new Error('Too many redirects');
  }
  async function importPublic(jwk:JWK,kid:string):Promise<CryptoKey> {
    if(jwk.kty!=='RSA'||jwk.kid!==kid||jwk.alg!=='RS256'||jwk.use!=='sig'||jwk.d) throw new Error('Invalid key metadata');
    return await importJWK(jwk,'RS256') as CryptoKey;
  }
  async function resolve(header:JWTHeaderParameters,partner:boolean):Promise<CryptoKey> {
    if(header.alg!=='RS256'||header.kid!==config.kid) throw new Error('Algorithm or KID is outside policy');
    const issuer=partner?PARTNER_ISSUER:SHOP_ISSUER;
    const known=partner?keys.partner:keys.shop; if(!known) throw new Error('Issuer is not configured');
    if(config.profile==='jwk'&&!partner&&header.jwk) {
      trace({event:'key.embedded.accepted',issuer,kid:header.kid});
      return importPublic(header.jwk,header.kid);
    }
    if(config.profile==='jku-redirect'&&!partner&&header.jku) {
      const url=labUrl(header.jku);
      if(url.origin!==labUrl(config.shopKeysUrl).origin) throw new Error('Initial key source is not trusted');
      const jwks=await fetchKeys(url.href,true);
      const jwk=jwks.find(k=>k.kid===header.kid); if(!jwk) throw new Error('KID not found');
      return importPublic(jwk,header.kid);
    }
    if(header.jwk||header.jku||header.x5u||header.x5c) throw new Error('Headers cannot add trusted key sources');
    const cacheKey=config.profile==='kid-cache'?header.kid:`${issuer}|${header.kid}`;
    const cached=cache.get(cacheKey);
    // jwt: handles this module with server validation and explicit trust boundaries.
    if(!partner && cached && cached.expires>Date.now()) {
      trace({event:'key.cache.hit',issuer,cachedIssuer:cached.issuer,cacheKey});
      return cached.key; // Intentional kid-cache flaw: cachedIssuer is not checked.
    }
    let key=known.publicKey;
    if(config.profile==='kid-cache') {
      const jwks=await fetchKeys(partner?config.partnerKeysUrl:config.shopKeysUrl,false);
      const jwk=jwks.find(k=>k.kid===header.kid); if(!jwk) throw new Error('Key not found');
      key=await importPublic(jwk,header.kid);
    }
    cache.set(cacheKey,{key,issuer,expires:Date.now()+300000});
    trace({event:'key.cache.write',issuer,cacheKey});
    return key;
  }
  async function verify(token:string,partner=false):Promise<string> {
    const result=await jwtVerify(token,h=>resolve(h,partner),{algorithms:['RS256'],issuer:partner?PARTNER_ISSUER:SHOP_ISSUER,audience:partner?PARTNER_AUDIENCE:SHOP_AUDIENCE,typ:'at+jwt',requiredClaims:['sub','iat','exp','iss','aud'],clockTolerance:5,maxTokenAge:'15m'});
    if(typeof result.payload.sub!=='string') throw new Error('Subject is required');
    return result.payload.sub;
  }
  async function sign(sub:string):Promise<string> { return new SignJWT({}).setProtectedHeader({alg:'RS256',typ:'at+jwt',kid:config.kid}).setSubject(sub).setIssuer(SHOP_ISSUER).setAudience(SHOP_AUDIENCE).setIssuedAt().setExpirationTime('15m').sign(keys.shop.privateKey); }
  return {verify,sign,clearCache:()=>cache.clear()};
}
