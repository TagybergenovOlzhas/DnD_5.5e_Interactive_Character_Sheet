import { randomUUID } from 'node:crypto';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  BagOfHolding,
  CharacterCurrency,
  CharacterHp,
  CharacterNote,
  CharacterProficiencies,
  CharacterSpells,
  CharacterStats,
  CompendiumCategory,
  CompendiumMetadata,
  CompendiumSource,
  CreatureSize,
  CustomResource,
  InventoryItem,
  PassiveTrait,
  WeaponAttack,
} from '../../shared/types.js';

/**
 * Compendium Entries table (`compendium_entries`)
 * Stores both parsed local Obsidian Markdown cards (`source = 'obsidian'`)
 * and cached cards scraped on-demand from `dnd.su` (`source = 'dnd_su'`).
 * When resolving by `(slug, category)`, `'obsidian'` always overrides `'dnd_su'`.
 */
export const compendiumEntries = sqliteTable(
  'compendium_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    category: text('category').$type<CompendiumCategory>().notNull(),
    source: text('source').$type<CompendiumSource>().notNull(),
    source_url: text('source_url'),
    raw_content: text('raw_content').notNull(),
    metadata: text('metadata', { mode: 'json' })
      .$type<CompendiumMetadata>()
      .notNull()
      .$defaultFn(() => ({})),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_compendium_entries_slug').on(table.slug),
    index('idx_compendium_entries_slug_category').on(table.slug, table.category),
  ]
);

/**
 * Characters table (`characters`)
 * Stores D&D 5.5e (2024 ruleset) character sheets with JSON-typed columns
 * for stats, proficiencies, hit points, flexible custom counters, inventory, and spells.
 */
export const characters = sqliteTable('characters', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  player_name: text('player_name').notNull(),
  level: integer('level').notNull().default(1),
  species: text('species').notNull(),
  class_name: text('class_name').notNull(),
  subclass_name: text('subclass_name'),
  size: text('size').$type<CreatureSize>().notNull().default('medium'),
  stats: text('stats', { mode: 'json' })
    .$type<CharacterStats>()
    .notNull()
    .$defaultFn(() => ({
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    })),
  proficiencies: text('proficiencies', { mode: 'json' })
    .$type<CharacterProficiencies>()
    .notNull()
    .$defaultFn(() => ({
      savingThrows: [],
      skills: {},
      skillBonuses: {},
      globalSkillBonus: 0,
      saveBonuses: {},
      weapons: [],
      weaponMasteries: [],
      armor: [],
      tools: [],
      languages: ['Common'],
      customProficiencies: [],
      heavyArmorStealthDisadvantage: false,
    })),
  hp: text('hp', { mode: 'json' })
    .$type<CharacterHp>()
    .notNull()
    .$defaultFn(() => ({
      current: 10,
      max: 10,
      temp: 0,
      hit_dice_current: 1,
      hit_dice_max: 1,
      hit_die_type: 'd8',
      death_save_successes: 0,
      death_save_failures: 0,
      conditions: [],
      armor_class: 10,
      speed: 30,
    })),
  exhaustion: integer('exhaustion').notNull().default(0),
  custom_resources: text('custom_resources', { mode: 'json' })
    .$type<CustomResource[]>()
    .notNull()
    .$defaultFn(() => []),
  passive_traits: text('passive_traits', { mode: 'json' })
    .$type<PassiveTrait[]>()
    .notNull()
    .$defaultFn(() => []),
  inventory: text('inventory', { mode: 'json' })
    .$type<InventoryItem[]>()
    .notNull()
    .$defaultFn(() => []),
  bag_of_holding: text('bag_of_holding', { mode: 'json' })
    .$type<BagOfHolding>()
    .notNull()
    .$defaultFn(() => ({ enabled: false, items: [] })),
  currency: text('currency', { mode: 'json' })
    .$type<CharacterCurrency>()
    .notNull()
    .$defaultFn(() => ({ pp: 0, gp: 0, sp: 0, cp: 0 })),
  weapon_attacks: text('weapon_attacks', { mode: 'json' })
    .$type<WeaponAttack[]>()
    .notNull()
    .$defaultFn(() => []),
  spells: text('spells', { mode: 'json' })
    .$type<CharacterSpells>()
    .notNull()
    .$defaultFn(() => ({
      spellcastingAbility: null,
      visibleSlotLevels: 1,
      slots: {},
      preparedSlugs: [],
      knownSlugs: [],
    })),
  notes: text('notes').notNull().default(''),
  note_cards: text('note_cards', { mode: 'json' })
    .$type<CharacterNote[]>()
    .notNull()
    .$defaultFn(() => []),
  updated_at: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CompendiumEntryRow = typeof compendiumEntries.$inferSelect;
export type NewCompendiumEntryRow = typeof compendiumEntries.$inferInsert;

export type CharacterRow = typeof characters.$inferSelect;
export type NewCharacterRow = typeof characters.$inferInsert;
