// config: handles this module with server validation and explicit trust boundaries.
import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';
export const SHOP_ISSUER = 'urn:dasani:shop';
export const PARTNER_ISSUER = 'urn:dasani:partner';
export const SHOP_AUDIENCE = 'dasani-api';
export const PARTNER_AUDIENCE = 'dasani-partner-preview';
export const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
export const CUSTOMER_ID = '00000000-0000-4000-8000-000000000002';
export type JwtProfile = 'secure' | 'jwk' | 'jku-redirect' | 'kid-cache';
export interface Config { root: string; hosted: boolean; profile: JwtProfile; lab: boolean; host: string; port: number; origin: string; databaseUrl: string; databaseSsl: boolean; dataDir: string; keysDir: string; kid: string; privateKeyB64: string; shopKeysUrl: string; partnerKeysUrl: string; adminEmail: string; adminPassword: string }
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const hosted = env.APP_ENV === 'hosted' || Boolean(env.RENDER);
  const profile = z.enum(['secure','jwk','jku-redirect','kid-cache']).parse(env.JWT_PROFILE ?? 'secure');
  const lab = env.LAB_ENABLED === 'true';
  const root = resolve(env.PROJECT_ROOT ?? process.cwd());
  const config: Config = { root, hosted, profile, lab, host: env.HOST ?? (hosted ? '0.0.0.0' : '127.0.0.1'), port: z.coerce.number().int().min(1).max(65535).parse(env.PORT ?? 3000), origin: env.WEB_ORIGIN ?? 'http://127.0.0.1:5173', databaseUrl: env.DATABASE_URL ?? '', databaseSsl: env.DATABASE_SSL === 'true', dataDir: resolve(root, env.DATA_DIR ?? '.data/shop'), keysDir: resolve(root, env.KEYS_DIR ?? '.lab/keys'), kid: env.JWT_KID ?? 'rotation-2026-01', privateKeyB64: env.JWT_PRIVATE_KEY_B64 ?? '', shopKeysUrl: env.SHOP_KEYS_URL ?? 'http://127.0.0.1:3001/jwks.json', partnerKeysUrl: env.PARTNER_KEYS_URL ?? 'http://127.0.0.1:3002/partner/jwks.json', adminEmail: env.INITIAL_ADMIN_EMAIL ?? '', adminPassword: env.INITIAL_ADMIN_PASSWORD ?? '' };
  if (hosted && (lab || profile !== 'secure')) throw new Error('Hosted requires JWT_PROFILE=secure and LAB_ENABLED=false');
  if (hosted && (!config.databaseUrl || !config.databaseSsl || !config.privateKeyB64 || !config.origin.startsWith('https://'))) throw new Error('Hosted requires PostgreSQL TLS, a signing key and an HTTPS WEB_ORIGIN');
  if (!lab && profile !== 'secure') throw new Error('Vulnerable resolvers require LAB_ENABLED=true');
  if (lab && config.host !== '127.0.0.1' && config.host !== 'localhost') throw new Error('Lab services must listen on loopback');
  return config;
}
