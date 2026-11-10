import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db, ensureDatabaseInitialized } from './db/index.js';
import { characters, compendiumEntries, type NewCharacterRow } from './db/schema.js';
import { wsHub } from './wsHub.js';
import { deduplicateCompendiumEntries } from '../shared/rulesEngine.js';
import {
  getVaultFileContent,
  getVaultFileTree,
  syncObsidianSpells,
} from './compendium/obsidianParser.js';
import {
  CreateCharacterInputSchema,
  UpdateCharacterPatchSchema,
} from '../shared/types.js';

// Initialize SQLite tables on startup
ensureDatabaseInitialized();

// Automatically ingest and sync Obsidian compendium spells on startup
try {
  const initialSync = syncObsidianSpells();
  // If the vault was already present on disk, also trigger a non-blocking Git pull on startup
  if (!initialSync.git) {
    setTimeout(() => {
      try {
        syncObsidianSpells({ pullGit: true });
      } catch (err) {
        console.warn('[Compendium] Background Git sync skipped:', err);
      }
    }, 1000);
  }
} catch (err) {
  console.error('[Compendium] Failed to auto-sync Obsidian compendium:', err);
}

/**
 * Helper to create a default character row with all stats set to 10.
 */
function buildDefaultCharacterRow(
  overrides: Partial<NewCharacterRow> = {}
): NewCharacterRow {
  return {
    id: overrides.id ?? randomUUID(),
    name: overrides.name ?? 'Новый персонаж',
    player_name: overrides.player_name ?? 'Игрок',
    level: overrides.level ?? 1,
    species: overrides.species ?? 'Человек',
    class_name: overrides.class_name ?? 'Воин',
    subclass_name: overrides.subclass_name ?? null,
    stats: overrides.stats ?? {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    },
    proficiencies: overrides.proficiencies ?? {
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
    },
    hp: overrides.hp ?? {
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
    },
    exhaustion: overrides.exhaustion ?? 0,
    custom_resources: overrides.custom_resources ?? [],
    inventory: overrides.inventory ?? [],
    weapon_attacks: overrides.weapon_attacks ?? [],
    spells: overrides.spells ?? {
      spellcastingAbility: null,
      visibleSlotLevels: 1,
      slots: {},
      preparedSlugs: [],
      knownSlugs: [],
    },
    notes: overrides.notes ?? '',
    updated_at: new Date(),
  };
}

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use('/api/*', cors());

// ============================================================================
// Health & Diagnostics Endpoint
// ============================================================================
app.get('/api/health', (c) => {
  const mem = process.memoryUsage();
  return c.json({
    status: 'ok',
    ruleset: 'D&D 5.5e (2024)',
    timestamp: new Date().toISOString(),
    wsClients: wsHub.getConnectedCount(),
    memoryMb: {
      rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
    },
  });
});

// ============================================================================
// Compendium Endpoints
// ============================================================================
app.get('/api/compendium', async (c) => {
  const category = c.req.query('category');
  const levelStr = c.req.query('level');
  const search = c.req.query('search')?.toLowerCase().trim();
  const classTag = c.req.query('class')?.toLowerCase().trim();

  const allEntries = await db.select().from(compendiumEntries);
  let resolved = deduplicateCompendiumEntries(allEntries);

  if (category) {
    resolved = resolved.filter((e) => e.category === category);
  }
  if (levelStr !== undefined && levelStr !== '') {
    const lvl = parseInt(levelStr, 10);
    resolved = resolved.filter((e) => {
      const meta = e.metadata as { spellLevel?: number } | undefined;
      return meta?.spellLevel === lvl;
    });
  }
  if (classTag) {
    resolved = resolved.filter((e) => {
      const meta = e.metadata as
        | { classes?: string[]; tags?: string[] }
        | undefined;
      const classes = meta?.classes ?? [];
      const tags = meta?.tags ?? [];
      return (
        classes.some((cls) => cls.toLowerCase() === classTag) ||
        tags.some((t) => t.toLowerCase() === classTag)
      );
    });
  }
  if (search) {
    resolved = resolved.filter((e) => {
      return (
        e.title.toLowerCase().includes(search) ||
        e.slug.toLowerCase().includes(search) ||
        (e.raw_content && e.raw_content.toLowerCase().includes(search))
      );
    });
  }

  return c.json({ items: resolved, total: resolved.length });
});

app.post('/api/compendium/sync', (c) => {
  try {
    const stats = syncObsidianSpells({ pullGit: true });
    return c.json({ ok: true, stats });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// ============================================================================
// Obsidian Vault Library Endpoints
// ============================================================================
app.get('/api/vault/tree', (c) => {
  try {
    const result = getVaultFileTree();
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err), tree: [], totalFiles: 0 }, 500);
  }
});

app.get('/api/vault/file', (c) => {
  const filePath = c.req.query('path');
  if (!filePath) {
    return c.json({ error: 'Missing path parameter' }, 400);
  }
  const file = getVaultFileContent(filePath);
  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }
  return c.json(file);
});

app.post('/api/vault/sync', (c) => {
  try {
    const stats = syncObsidianSpells({ pullGit: true });
    const vault = getVaultFileTree();
    return c.json({ ok: true, stats, vault });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// ============================================================================
// Characters CRUD Endpoints
// ============================================================================

// GET /api/characters — List all characters
app.get('/api/characters', async (c) => {
  const items = await db
    .select()
    .from(characters)
    .orderBy(desc(characters.updated_at));
  return c.json({ items });
});

// POST /api/characters — Create a new character with default stats of 10
app.post('/api/characters', async (c) => {
  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const parsed = CreateCharacterInputSchema.safeParse(body);
  const input = parsed.success
    ? parsed.data
    : {
        name: 'Новый персонаж',
        player_name: 'Игрок',
        level: 1,
        species: 'Человек',
        class_name: 'Воин',
        subclass_name: null,
      };

  const newId = randomUUID();
  const newRow = buildDefaultCharacterRow({
    id: newId,
    name: input.name,
    player_name: input.player_name,
    level: input.level,
    species: input.species,
    class_name: input.class_name,
    subclass_name: input.subclass_name,
  });

  db.insert(characters).values(newRow).run();
  const created = db
    .select()
    .from(characters)
    .where(eq(characters.id, newId))
    .get();

  return c.json({ item: created }, 201);
});

// PATCH /api/characters/:id — Partial update & auto-save character sheet
app.patch('/api/characters/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db
    .select()
    .from(characters)
    .where(eq(characters.id, id))
    .get();

  if (!existing) {
    return c.json({ error: 'Character not found' }, 404);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const parsed = UpdateCharacterPatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      400
    );
  }

  const patch = parsed.data;
  const updateData: Partial<NewCharacterRow> = {
    updated_at: new Date(),
  };

  if (patch.name !== undefined) updateData.name = patch.name;
  if (patch.player_name !== undefined) updateData.player_name = patch.player_name;
  if (patch.level !== undefined) updateData.level = patch.level;
  if (patch.species !== undefined) updateData.species = patch.species;
  if (patch.class_name !== undefined) updateData.class_name = patch.class_name;
  if (patch.subclass_name !== undefined) updateData.subclass_name = patch.subclass_name;
  if (patch.stats !== undefined) updateData.stats = patch.stats;
  if (patch.proficiencies !== undefined) updateData.proficiencies = patch.proficiencies;
  if (patch.hp !== undefined) updateData.hp = patch.hp;
  if (patch.exhaustion !== undefined) updateData.exhaustion = patch.exhaustion;
  if (patch.custom_resources !== undefined)
    updateData.custom_resources = patch.custom_resources;
  if (patch.inventory !== undefined) updateData.inventory = patch.inventory;
  if (patch.weapon_attacks !== undefined) updateData.weapon_attacks = patch.weapon_attacks;
  if (patch.spells !== undefined) updateData.spells = patch.spells;
  if (patch.notes !== undefined) updateData.notes = patch.notes;

  await db.update(characters).set(updateData).where(eq(characters.id, id));

  const updated = await db
    .select()
    .from(characters)
    .where(eq(characters.id, id))
    .get();

  // Broadcast live update to connected WebSocket clients
  wsHub.broadcastToCharacter(id, {
    type: 'character:update',
    characterId: id,
    patch,
    updatedBy: 'player',
  });

  return c.json({ item: updated });
});

// DELETE /api/characters/:id — Delete character
app.delete('/api/characters/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db
    .select()
    .from(characters)
    .where(eq(characters.id, id))
    .get();

  if (!existing) {
    return c.json({ error: 'Character not found' }, 404);
  }

  await db.delete(characters).where(eq(characters.id, id));
  return c.json({ deleted: true, id });
});

// ============================================================================
// Real-time WebSocket Route (/ws)
// ============================================================================
app.get(
  '/ws',
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      wsHub.addClient(ws);
    },
    onMessage(event, ws) {
      const data = typeof event.data === 'string' ? event.data : String(event.data);
      wsHub.handleIncomingRawMessage(ws, data);
    },
    onClose(_event, ws) {
      wsHub.removeClient(ws);
    },
  }))
);

// ============================================================================
// Unified Monorepo Static Asset Serving (Production Vite build in ./dist/client)
// ============================================================================
const clientDistDir = resolve(process.cwd(), 'dist/client');

if (existsSync(clientDistDir)) {
  app.use('/*', serveStatic({ root: './dist/client' }));

  app.get('*', (c) => {
    const indexPath = resolve(clientDistDir, 'index.html');
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf-8');
      return c.html(html);
    }
    return c.notFound();
  });
} else {
  app.get('/', (c) =>
    c.json({
      message: 'D&D 5.5e Character Sheet & Compendium API Server is running.',
      hint: 'Run `npm run dev` for development or `npm run build` to bundle the React client.',
      healthUrl: '/api/health',
    })
  );
}

const port = Number(process.env.PORT ?? 3000);

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(
      `[D&D 5.5e Server] Listening on http://localhost:${info.port} (API: /api/health, WS: /ws)`
    );
  }
);

injectWebSocket(server);

export { app };
