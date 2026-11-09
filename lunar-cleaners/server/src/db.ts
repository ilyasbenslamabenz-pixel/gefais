// Persistance des profils : PostgreSQL si DATABASE_URL est défini, sinon SQLite (node:sqlite).
import fs from 'node:fs';
import path from 'node:path';
import type { Profile } from '../../shared/protocol';

export interface LeaderRow { id: string; name: string; level: number; totalEarned: number }

interface Backend {
  name: string;
  load(token: string): Promise<Profile | null>;
  save(token: string, p: Profile): Promise<void>;
  top(limit: number): Promise<LeaderRow[]>;
}

function parse(data: string | null | undefined): Profile | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as Profile;
  } catch {
    return null;
  }
}

async function postgresBackend(url: string): Promise<Backend> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 10, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      token TEXT PRIMARY KEY,
      id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      total_earned BIGINT NOT NULL DEFAULT 0,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_players_earned ON players(total_earned DESC);
  `);
  return {
    name: 'PostgreSQL',
    async load(token) {
      const r = await pool.query('SELECT data FROM players WHERE token = $1', [token]);
      return (r.rows[0]?.data as Profile) ?? null;
    },
    async save(token, p) {
      await pool.query(
        `INSERT INTO players (token, id, name, level, total_earned, data) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (token) DO UPDATE SET name = EXCLUDED.name, level = EXCLUDED.level,
           total_earned = EXCLUDED.total_earned, data = EXCLUDED.data, updated_at = now()`,
        [token, p.id, p.name, p.level, Math.floor(p.stats.totalEarned), JSON.stringify(p)],
      );
    },
    async top(limit) {
      const r = await pool.query('SELECT id, name, level, total_earned FROM players ORDER BY total_earned DESC LIMIT $1', [limit]);
      return r.rows.map((x) => ({ id: x.id, name: x.name, level: x.level, totalEarned: Number(x.total_earned) }));
    },
  };
}

async function sqliteBackend(): Promise<Backend> {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = process.env.DATA_DIR || path.resolve(process.cwd(), 'server/data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'lunar.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS players (
      token TEXT PRIMARY KEY, id TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1, total_earned INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_players_earned ON players(total_earned DESC);
  `);
  const sel = db.prepare('SELECT data FROM players WHERE token = ?');
  const ups = db.prepare(`
    INSERT INTO players (token, id, name, level, total_earned, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET name = excluded.name, level = excluded.level,
      total_earned = excluded.total_earned, data = excluded.data, updated_at = excluded.updated_at`);
  const top = db.prepare('SELECT id, name, level, total_earned FROM players ORDER BY total_earned DESC LIMIT ?');
  return {
    name: 'SQLite',
    async load(token) {
      return parse((sel.get(token) as { data: string } | undefined)?.data);
    },
    async save(token, p) {
      const now = Date.now();
      ups.run(token, p.id, p.name, p.level, Math.floor(p.stats.totalEarned), JSON.stringify(p), now, now);
    },
    async top(limit) {
      return (top.all(limit) as { id: string; name: string; level: number; total_earned: number }[]).map((r) => ({
        id: r.id, name: r.name, level: r.level, totalEarned: r.total_earned,
      }));
    },
  };
}

const backendPromise: Promise<Backend> = process.env.DATABASE_URL ? postgresBackend(process.env.DATABASE_URL) : sqliteBackend();
backendPromise.then((b) => console.log(`💾 Base de données : ${b.name}`)).catch((e) => {
  console.error('Impossible d\'ouvrir la base de données :', e);
  process.exit(1);
});

export const loadProfile = async (token: string) => (await backendPromise).load(token);
export const saveProfile = async (token: string, p: Profile) => (await backendPromise).save(token, p);
export const leaderboard = async (limit = 20) => (await backendPromise).top(limit);
