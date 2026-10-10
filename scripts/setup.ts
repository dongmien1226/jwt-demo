// setup: handles this module with server validation and explicit trust boundaries.
import { copyFile,access } from 'node:fs/promises';
try{await access('.env');}catch{await copyFile('.env.example','.env');}
const {loadConfig}=await import('../apps/api/src/config.js');
const config=loadConfig();if(config.hosted)throw new Error('setup:local is available only on local machines');
const {loadKeys}=await import('../apps/api/src/auth/keys.js');await loadKeys(config);
const {createDb,migrate}=await import('../apps/api/src/database/db.js');
const {seed}=await import('../apps/api/src/database/seed.js');
const db=await createDb(config);try{await migrate(db,config.root);await seed(db,config);}finally{await db.close();}
console.log('Dasani Store is ready. Customer: an@dasani.test / DasaniBuyer!2026. Admin: admin@dasani.test / DasaniAdmin!2026.');
