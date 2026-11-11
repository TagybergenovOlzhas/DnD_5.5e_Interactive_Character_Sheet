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
      size TEXT NOT NULL DEFAULT 'medium',
      stats TEXT NOT NULL,
      proficiencies TEXT NOT NULL,
      hp TEXT NOT NULL,
      exhaustion INTEGER NOT NULL DEFAULT 0,
      custom_resources TEXT NOT NULL DEFAULT '[]',
      passive_traits TEXT NOT NULL DEFAULT '[]',
      inventory TEXT NOT NULL DEFAULT '[]',
      bag_of_holding TEXT NOT NULL DEFAULT '{"enabled":false,"items":[]}',
      currency TEXT NOT NULL DEFAULT '{"pp":0,"gp":0,"sp":0,"cp":0}',
      spells TEXT NOT NULL,
      weapon_attacks TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      note_cards TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );
  `);

  const columns = sqlite.prepare('PRAGMA table_info(characters)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'weapon_attacks')) {
    sqlite.exec(
      "ALTER TABLE characters ADD COLUMN weapon_attacks TEXT NOT NULL DEFAULT '[]'"
    );
  }
  if (!columns.some((column) => column.name === 'passive_traits')) {
    sqlite.exec(
      "ALTER TABLE characters ADD COLUMN passive_traits TEXT NOT NULL DEFAULT '[]'"
    );
  }
  if (!columns.some((column) => column.name === 'currency')) {
    sqlite.exec(
      `ALTER TABLE characters ADD COLUMN currency TEXT NOT NULL DEFAULT '{"pp":0,"gp":0,"sp":0,"cp":0}'`
    );
  }
  if (!columns.some((column) => column.name === 'size')) {
    sqlite.exec(
      "ALTER TABLE characters ADD COLUMN size TEXT NOT NULL DEFAULT 'medium'"
    );
  }
  if (!columns.some((column) => column.name === 'bag_of_holding')) {
    sqlite.exec(
      `ALTER TABLE characters ADD COLUMN bag_of_holding TEXT NOT NULL DEFAULT '{"enabled":false,"items":[]}'`
    );
  }
  if (!columns.some((column) => column.name === 'note_cards')) {
    sqlite.exec(
      "ALTER TABLE characters ADD COLUMN note_cards TEXT NOT NULL DEFAULT '[]'"
    );
  }
}
