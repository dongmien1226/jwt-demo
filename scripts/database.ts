// database: handles this module with server validation and explicit trust boundaries.
import {loadConfig} from '../apps/api/src/config.js';
import {createDb,migrate} from '../apps/api/src/database/db.js';
import {seed} from '../apps/api/src/database/seed.js';
const config=loadConfig();
if(process.argv[2]==='seed'&&config.hosted&&(!config.adminEmail||!config.adminPassword))throw new Error('Hosted seeding requires INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD');
const db=await createDb(config);try{await migrate(db,config.root);if(process.argv[2]==='seed')await seed(db,config);}finally{await db.close();}
console.log('Completed',process.argv[2]);
