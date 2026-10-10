// db: handles this module with server validation and explicit trust boundaries.
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../config.js';
export type Row = Record<string, unknown>;
export interface Db { query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>; exec(sql: string): Promise<void>; transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>; close(): Promise<void> }
function normalize<T>(rows: unknown[]): T[] {
  return rows.map(row => Object.fromEntries(Object.entries(row as Row).map(([key,value]) => [key.replace(/_([a-z])/g, (_,c:string) => c.toUpperCase()), value instanceof Date ? value.toISOString() : value]))) as T[];
}
export async function createDb(config: Pick<Config,'databaseUrl'|'databaseSsl'|'dataDir'>): Promise<Db> {
  if (config.databaseUrl) {
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5, ssl: config.databaseSsl ? { rejectUnauthorized: true } : false });
    const adapter = (client: pg.Pool | pg.PoolClient): Db => ({
      query: async <T>(sql: string, params: unknown[] = []) => normalize<T>((await client.query(sql,params)).rows),
      exec: async sql => { await client.query(sql); },
      transaction: async fn => { const c = await pool.connect(); try { await c.query('BEGIN'); const result=await fn(adapter(c)); await c.query('COMMIT'); return result; } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } },
      close: async () => { if (client === pool) await pool.end(); }
    });
    await pool.query('SELECT 1');
    return adapter(pool);
  }
  if (config.dataDir !== ':memory:') await mkdir(config.dataDir,{recursive:true});
  const client = new PGlite(config.dataDir === ':memory:' ? undefined : config.dataDir);
  await client.waitReady;
  type PgLiteClient = Pick<PGlite,'query'|'exec'>;
  const adapter = (connection: PgLiteClient): Db => ({
    query: async <T>(sql:string,params:unknown[]=[]) => normalize<T>((await connection.query(sql,params)).rows),
    exec: async sql => { await connection.exec(sql); },
    transaction: async fn => client.transaction(tx => fn(adapter(tx))),
    close: async () => { if(connection===client) await client.close(); }
  });
  return adapter(client);
}
export async function migrate(db: Db, root: string): Promise<void> {
  await db.exec('CREATE SCHEMA IF NOT EXISTS dasani; CREATE TABLE IF NOT EXISTS dasani.migrations (name text PRIMARY KEY)');
  const names=(await readdir(join(root,'database/migrations'))).filter(n=>n.endsWith('.sql')).sort();
  for(const name of names) {
    if((await db.query('SELECT name FROM dasani.migrations WHERE name=$1',[name])).length) continue;
    const sql=await readFile(join(root,'database/migrations',name),'utf8');
    await db.transaction(async tx=>{ await tx.exec(sql); await tx.query('INSERT INTO dasani.migrations(name) VALUES($1)',[name]); });
  }
}
