// server: handles this module with server validation and explicit trust boundaries.
import Fastify from 'fastify';
import { z } from 'zod';
import { importJWK,type JWK } from 'jose';
import { loadConfig } from '../api/src/config.js';
import { loadKeys } from '../api/src/auth/keys.js';
import { labUrl } from '../api/src/auth/jwt.js';
const config=loadConfig(); if(!config.lab||config.hosted) throw new Error('Key services are available only in the local lab');
const keys=await loadKeys(config);let attackerKeys:JWK[]=[keys.attacker!.jwk];
const trusted=Fastify({logger:true}),publisher=Fastify({logger:true,bodyLimit:65536});
trusted.get('/jwks.json',async()=>({keys:[keys.shop.jwk]}));
trusted.get('/redirect',async(req,reply)=>{try {const {to}=z.object({to:z.string()}).parse(req.query);const url=labUrl(to);if(url.port!=='3002')throw new Error();return reply.redirect(url.href);}catch{return reply.code(400).send({error:'Redirects are restricted to the lab publisher on port 3002'});}});
publisher.get('/partner/jwks.json',async()=>({keys:[keys.partner!.jwk]}));
publisher.get('/attacker/jwks.json',async()=>({keys:attackerKeys}));
publisher.put('/attacker/jwks',async(req,reply)=>{
  try {const body=z.object({keys:z.array(z.record(z.string(),z.unknown())).min(1).max(5)}).parse(req.body);
    for(const candidate of body.keys) {if(candidate.kty!=='RSA'||candidate.alg!=='RS256'||candidate.use!=='sig'||candidate.kid!==config.kid||candidate.d)throw new Error();await importJWK(candidate as JWK,'RS256');}
    attackerKeys=body.keys as JWK[];return {ok:true};
  } catch{return reply.code(400).send({error:'Provide a public RSA JWK with the configured kid, alg RS256 and use sig; do not submit private keys'});}
});
publisher.get('/',async(_,reply)=>reply.type('text/html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Lab key source</title><style>body{font:16px system-ui;max-width:780px;margin:50px auto;padding:20px}textarea{width:100%;height:340px}button{padding:12px;margin-top:12px}</style><h1>Lab key publisher</h1><p>Paste the public JWKS exported from JWT Editor. Keep private keys in Burp.</p><textarea id="keys"></textarea><button id="save">Update public JWKS</button><p id="result"></p><script>fetch('/attacker/jwks.json').then(r=>r.json()).then(v=>document.getElementById('keys').value=JSON.stringify(v,null,2));document.getElementById('save').onclick=async()=>{try{const r=await fetch('/attacker/jwks',{method:'PUT',headers:{'Content-Type':'application/json'},body:document.getElementById('keys').value});document.getElementById('result').textContent=r.ok?'Updated':'Invalid JWKS';}catch{document.getElementById('result').textContent='Unable to update';}}</script></html>`));
await trusted.listen({host:'127.0.0.1',port:3001});await publisher.listen({host:'127.0.0.1',port:3002});
for(const s of ['SIGINT','SIGTERM'] as const)process.on(s,()=>{void Promise.all([trusted.close(),publisher.close()]).then(()=>process.exit(0));});
