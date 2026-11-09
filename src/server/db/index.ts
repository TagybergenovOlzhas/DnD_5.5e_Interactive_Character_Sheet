import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const dbPath = resolve(process.cwd(), process.env.DATABASE_URL ?? './data/dnd.sqlite');

// Ensure parent directory exists for the SQLite database file
mkdirSync(dirname(dbPath), { recursive: true });

export const sqlite = new Database(dbPath);

// Enable WAL mode and foreign keys for optimal concurrency & low memory footprint
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

/**
 * Ensures core tables (`compendium_entries` and `characters`) exist on server startup
 * so the application works out-of-the-box without requiring manual migration steps.
 */
export function ensureDatabaseInitialized(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS compendium_entries (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      raw_content TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_compendium_entries_slug
      ON compendium_entries (slug);

    CREATE INDEX IF NOT EXISTS idx_compendium_entries_slug_category
      ON compendium_entries (slug, category);

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      player_name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      species TEXT NOT NULL,
      class_name TEXT NOT NULL,
      subclass_name TEXT,
      stats TEXT NOT NULL,
      proficiencies TEXT NOT NULL,
      hp TEXT NOT NULL,
      exhaustion INTEGER NOT NULL DEFAULT 0,
      custom_resources TEXT NOT NULL DEFAULT '[]',
      inventory TEXT NOT NULL DEFAULT '[]',
      spells TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
  `);
}
