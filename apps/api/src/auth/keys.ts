// keys: handles this module with server validation and explicit trust boundaries.
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { mkdir, access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { importPKCS8, importSPKI, exportJWK, type JWK } from 'jose';
import type { Config } from '../config.js';
export interface KeyPair { privateKey: CryptoKey; publicKey: CryptoKey; jwk: JWK }
export interface Keys { shop: KeyPair; partner?: KeyPair; attacker?: KeyPair }
export async function ensureLocalKeys(dir:string):Promise<void> {
  await mkdir(dir,{recursive:true});
  for(const name of ['shop','partner','attacker']) {
    const file=join(dir,`${name}-private.pem`);
    try { await access(file); } catch {
      const pair=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
      await writeFile(file,pair.privateKey,{mode:0o600});
    }
    const privatePem=await readFile(file,'utf8');
    await writeFile(join(dir,`${name}-public.pem`),createPublicKey(privatePem).export({type:'spki',format:'pem'}));
  }
}
async function pair(pem:string,kid:string):Promise<KeyPair> {
  const privateKey=await importPKCS8(pem,'RS256',{extractable:true});
  const publicKey=await importSPKI(createPublicKey(pem).export({type:'spki',format:'pem'}).toString(),'RS256',{extractable:true});
  const jwk={...await exportJWK(publicKey),kid,alg:'RS256',use:'sig'};
  return {privateKey,publicKey,jwk};
}
export async function loadKeys(config:Config):Promise<Keys> {
  if(config.hosted) return {shop:await pair(Buffer.from(config.privateKeyB64,'base64').toString('utf8'),config.kid)};
  await ensureLocalKeys(config.keysDir);
  const shop=await pair(await readFile(join(config.keysDir,'shop-private.pem'),'utf8'),config.kid);
  if(!config.lab) return {shop};
  return {shop,partner:await pair(await readFile(join(config.keysDir,'partner-private.pem'),'utf8'),config.kid),attacker:await pair(await readFile(join(config.keysDir,'attacker-private.pem'),'utf8'),config.kid)};
}
