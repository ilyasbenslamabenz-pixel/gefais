// Persistance SQLite (module natif node:sqlite, aucune compilation requise).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { Profile } from '../../shared/protocol';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'server/data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'lunar.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS players (
    token TEXT PRIMARY KEY,
    id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    total_earned INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_players_earned ON players(total_earned DESC);
`);

const selectStmt = db.prepare('SELECT data FROM players WHERE token = ?');
const upsertStmt = db.prepare(`
  INSERT INTO players (token, id, name, level, total_earned, data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(token) DO UPDATE SET name = excluded.name, level = excluded.level,
    total_earned = excluded.total_earned, data = excluded.data, updated_at = excluded.updated_at
`);
const topStmt = db.prepare('SELECT id, name, level, total_earned FROM players ORDER BY total_earned DESC LIMIT ?');

export function loadProfile(token: string): Profile | null {
  const row = selectStmt.get(token) as { data: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as Profile;
  } catch {
    return null;
  }
}

export function saveProfile(token: string, p: Profile) {
  const now = Date.now();
  upsertStmt.run(token, p.id, p.name, p.level, Math.floor(p.stats.totalEarned), JSON.stringify(p), now, now);
}

export function leaderboard(limit = 20) {
  return (topStmt.all(limit) as { id: string; name: string; level: number; total_earned: number }[]).map((r) => ({
    id: r.id,
    name: r.name,
    level: r.level,
    totalEarned: r.total_earned,
  }));
}
