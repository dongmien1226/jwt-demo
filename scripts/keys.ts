// keys: handles this module with server validation and explicit trust boundaries.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ensureLocalKeys} from '../apps/api/src/auth/keys.js';
const dir=resolve('.lab/hosting-keys');await ensureLocalKeys(dir);
await writeFile(join(dir,'JWT_PRIVATE_KEY_B64.txt'),Buffer.from(await readFile(join(dir,'shop-private.pem'))).toString('base64'),{mode:0o600});
console.log('Hosted signing key saved in .lab/hosting-keys/JWT_PRIVATE_KEY_B64.txt. Set its value in Render Environment.');
