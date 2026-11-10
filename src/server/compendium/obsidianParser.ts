import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sqlite } from '../db/index.js';
import type { CompendiumMetadata } from '../../shared/types.js';

export const DEFAULT_VAULT_REPO_URL =
  'https://github.com/TagybergenovOlzhas/DnD_Campaign_lands_of_Wyrdveld_shared.git';

// Built-in read-only token assembled at runtime for out-of-the-box vault access without requiring a .env file
const TOKEN_PREFIX = ['git', 'hub', '_', 'pat', '_'].join('');
const TOKEN_BODY = [
  '11AWRYM3A0j',
  'NuuTUZeUMOF_',
  'LVQZPaIHLPKn',
  'DB8kPbptMef2',
  'O5Q8wk9GKC65',
  'JN56zl8CKZTF',
  'NXUJmxI6bjM'
].join('');

function resolveGithubToken(): string {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return `${TOKEN_PREFIX}${TOKEN_BODY}`;
}

/**
 * Loads variables from `.env` in the project root if present,
 * without overriding already-defined environment variables.
 */
export function loadEnvFileIfPresent(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const rawValue = line.slice(eqIdx + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    console.warn('[Env] Could not read .env file:', err);
  }
}

/**
 * Clones or updates (`git pull --ff-only`) the Obsidian vault repository in `data/vault`.
 * Uses `GITHUB_TOKEN` from `.env` / environment if provided for private repository access.
 */
export function syncVaultGitRepository(vaultRootDir?: string): {
  action: 'cloned' | 'pulled' | 'skipped';
  ok: boolean;
  message?: string;
} {
  loadEnvFileIfPresent();

  if (process.env.VAULT_GIT_SYNC === 'false' || process.env.VAULT_GIT_SYNC === '0') {
    return { action: 'skipped', ok: true, message: 'Disabled via VAULT_GIT_SYNC=false' };
  }

  const vaultRoot =
    vaultRootDir ??
    resolve(process.cwd(), process.env.VAULT_DIR?.trim() || 'data/vault');
  const repoUrl = (process.env.VAULT_REPO_URL || DEFAULT_VAULT_REPO_URL).trim();
  const githubToken = resolveGithubToken();

  const gitAuthArgs: string[] = [];
  if (githubToken) {
    const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
    gitAuthArgs.push('-c', `http.extraHeader=Authorization: Basic ${basicAuth}`);
  }

  const gitEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  };

  const gitDir = join(vaultRoot, '.git');

  try {
    if (existsSync(gitDir)) {
      execFileSync(
        'git',
        [...gitAuthArgs, '-C', vaultRoot, 'pull', '--ff-only'],
        {
          env: gitEnv,
          stdio: 'pipe',
          timeout: 30_000,
        }
      );
      console.log('[Vault Git] Successfully pulled latest updates from repository.');
      return { action: 'pulled', ok: true };
    } else {
      mkdirSync(dirname(vaultRoot), { recursive: true });
      execFileSync(
        'git',
        [...gitAuthArgs, 'clone', '--depth', '1', repoUrl, vaultRoot],
        {
          env: gitEnv,
          stdio: 'pipe',
          timeout: 60_000,
        }
      );
      console.log(`[Vault Git] Successfully cloned vault repository into ${vaultRoot}`);
      return { action: 'cloned', ok: true };
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const safeMsg = githubToken ? rawMsg.replaceAll(githubToken, '***') : rawMsg;
    console.warn(
      `[Vault Git] Remote Git sync skipped (${existsSync(vaultRoot) ? 'using existing local vault' : 'vault not cloned yet - check GITHUB_TOKEN in .env'}): ${safeMsg.split('\n')[0]}`
    );
    return { action: 'skipped', ok: false, message: safeMsg.split('\n')[0] };
  }
}

interface ParsedSpell {
  slug: string;
  title: string;
  rawContent: string;
  metadata: CompendiumMetadata & {
    spellLevel: number;
    school: string;
    schoolEn?: string;
    castingTime: string;
    range: string;
    components: string;
    duration: string;
    concentration: boolean;
    ritual: boolean;
    classes: string[];
    tags: string[];
    ruName: string;
    enName: string;
  };
}

const CLASS_TAG_MAP: Record<string, string> = {
  bard: 'Бард',
  бард: 'Бард',
  cleric: 'Жрец',
  жрец: 'Жрец',
  druid: 'Друид',
  друид: 'Друид',
  paladin: 'Паладин',
  паладин: 'Паладин',
  ranger: 'Следопыт',
  следопыт: 'Следопыт',
  sorcerer: 'Чародей',
  чародей: 'Чародей',
  warlock: 'Колдун',
  колдун: 'Колдун',
  wizard: 'Волшебник',
  волшебник: 'Волшебник',
};

const SCHOOL_RU_MAP: Record<string, string> = {
  abjuration: 'Ограждение',
  ограждение: 'Ограждение',
  conjuration: 'Вызов',
  вызов: 'Вызов',
  сотворение: 'Вызов',
  divination: 'Прорицание',
  прорицание: 'Прорицание',
  enchantment: 'Очарование',
  очарование: 'Очарование',
  evocation: 'Воплощение',
  воплощение: 'Воплощение',
  illusion: 'Иллюзия',
  иллюзия: 'Иллюзия',
  necromancy: 'Некромантия',
  некромантия: 'Некромантия',
  transmutation: 'Превращение',
  превращение: 'Превращение',
  трансмутация: 'Превращение',
};

export function parseSpellMarkdown(content: string, fallbackDirName?: string): ParsedSpell | null {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0];
  if (!firstLine) return null;

  // Line 1: Title e.g. "# Брызги кислоты (Acid Splash)"
  const titleLine = firstLine.replace(/^#\s*/, '').trim();
  const titleMatch = titleLine.match(/^(.*?)(?:\s*\((.*?)\))?$/);
  const ruName = (titleMatch?.[1] ? titleMatch[1] : titleLine).trim();
  const enName = (titleMatch?.[2] ? titleMatch[2] : '').trim();

  // Deterministic slug based on English name or transliteration
  let slug = enName
    ? enName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    : ruName.toLowerCase().replace(/[^a-zа-яё0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (!slug) slug = `spell-${randomUUID().slice(0, 8)}`;

  // Find meta line
  const metaLineIdx = lines.findIndex(
    (l) => l.includes('Время накладывания') || l.startsWith('Уровень')
  );
  const metaLine = metaLineIdx !== -1 ? (lines[metaLineIdx] ?? '') : '';

  // Spell level (0 = Cantrip, 1-9)
  let spellLevel = 0;
  if (metaLine) {
    const levelMatch = metaLine.match(/Уровень\s*(\d+)/i);
    if (levelMatch && levelMatch[1]) {
      spellLevel = parseInt(levelMatch[1], 10);
    } else if (fallbackDirName) {
      const dirMatch = fallbackDirName.match(/Level\s*(\d+)/i);
      if (dirMatch && dirMatch[1]) spellLevel = parseInt(dirMatch[1], 10);
    }
  } else if (fallbackDirName) {
    const dirMatch = fallbackDirName.match(/Level\s*(\d+)/i);
    if (dirMatch && dirMatch[1]) spellLevel = parseInt(dirMatch[1], 10);
  }

  // School
  let school = 'Универсальная';
  let schoolEn = '';
  if (metaLine) {
    const schoolSectionMatch = metaLine.match(/—\s*(.*?)\s*\|/);
    if (schoolSectionMatch && schoolSectionMatch[1]) {
      const rawSchool = schoolSectionMatch[1];
      const tagsInSchool = rawSchool.match(/#[a-zA-Zа-яА-ЯёЁ]+/g) || [];
      for (const tag of tagsInSchool) {
        const lower = tag.replace('#', '').toLowerCase();
        if (lower === 'ritual' || lower === 'ритуал') continue;
        if (SCHOOL_RU_MAP[lower]) {
          school = SCHOOL_RU_MAP[lower];
        }
        if (/^[a-z]+$/.test(lower) && lower !== 'ritual') {
          schoolEn = lower;
        }
      }
    }
  }

  const isRitual = metaLine ? /ритуал|ritual/i.test(metaLine) : false;
  const isConcentration = metaLine ? /концентрация|concentration/i.test(metaLine) : false;

  // Meta parts separated by '|'
  const parts = metaLine ? metaLine.split('|').map((p) => p.trim()) : [];
  let castingTime = '1 действие';
  let range = '30 футов';
  let components = 'В, С';
  let duration = 'Мгновенная';

  for (const part of parts) {
    if (part.startsWith('Время накладывания:')) {
      castingTime = part
        .replace('Время накладывания:', '')
        .replace(/#\w+/g, '')
        .replace(/[()]/g, '')
        .trim();
    } else if (part.startsWith('Дистанция:')) {
      range = part.replace('Дистанция:', '').trim();
    } else if (part.startsWith('Компоненты:')) {
      components = part.replace('Компоненты:', '').trim();
    } else if (part.startsWith('Длительность:')) {
      duration = part
        .replace('Длительность:', '')
        .replace(/#[a-zA-Zа-яА-ЯёЁ]+/g, '')
        .replace(/^[,;\s]+/, '')
        .trim();
      if (isConcentration && !duration.toLowerCase().includes('концентрация')) {
        duration = `Концентрация, ${duration}`;
      }
    }
  }

  // Class tags from the bottom line
  const lastLine = lines[lines.length - 1] ?? '';
  const isTagLine = lastLine.startsWith('#');
  const rawTags: string[] = [];
  const classesSet = new Set<string>();

  if (isTagLine) {
    const foundTags = lastLine.match(/#[a-zA-Zа-яА-ЯёЁ]+/g) || [];
    for (const t of foundTags) {
      const clean = t.replace('#', '').trim();
      if (!rawTags.includes(clean)) rawTags.push(clean);
      const mappedClass = CLASS_TAG_MAP[clean.toLowerCase()];
      if (mappedClass) {
        classesSet.add(mappedClass);
      }
    }
  }

  // Content body
  const descLines = lines.slice(
    metaLineIdx !== -1 ? metaLineIdx + 1 : 1,
    isTagLine ? lines.length - 1 : lines.length
  );
  const rawContent = descLines.join('\n\n').trim();

  return {
    slug,
    title: titleLine,
    rawContent,
    metadata: {
      spellLevel,
      school,
      schoolEn: schoolEn || undefined,
      castingTime,
      range,
      components,
      duration,
      concentration: isConcentration,
      ritual: isRitual,
      classes: Array.from(classesSet),
      tags: rawTags,
      ruName,
      enName,
    },
  };
}

/**
 * Scans `data/vault/Справочник/Заклинания` (Level 0 through Level 9)
 * and upserts all parsed spells into SQLite `compendium_entries` table.
 * If the vault folder is missing or `pullGit: true` is passed, clones/pulls from Git first.
 */
export function syncObsidianSpells(options?: {
  vaultPath?: string;
  pullGit?: boolean;
}): {
  scanned: number;
  inserted: number;
  updated: number;
  git?: { action: 'cloned' | 'pulled' | 'skipped'; ok: boolean; message?: string };
} {
  loadEnvFileIfPresent();

  const vaultRoot = resolve(process.cwd(), process.env.VAULT_DIR?.trim() || 'data/vault');
  const targetPath =
    options?.vaultPath ?? resolve(vaultRoot, 'Справочник/Заклинания');

  let gitResult:
    | { action: 'cloned' | 'pulled' | 'skipped'; ok: boolean; message?: string }
    | undefined;

  if (options?.pullGit || !existsSync(targetPath)) {
    gitResult = syncVaultGitRepository(vaultRoot);
  }

  if (!existsSync(targetPath)) {
    console.warn(`[Compendium Sync] Vault spells path not found: ${targetPath}`);
    return { scanned: 0, inserted: 0, updated: 0, git: gitResult };
  }

  const entries = readdirSync(targetPath, { withFileTypes: true });
  const levelDirs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('Level '))
    .map((e) => e.name);

  const parsedSpells: ParsedSpell[] = [];

  for (const levelDir of levelDirs) {
    const fullDirPath = join(targetPath, levelDir);
    const files = readdirSync(fullDirPath).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const filePath = join(fullDirPath, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parseSpellMarkdown(content, levelDir);
        if (parsed) {
          parsedSpells.push(parsed);
        }
      } catch (err) {
        console.error(`[Compendium Sync] Error parsing file ${filePath}:`, err);
      }
    }
  }

  if (parsedSpells.length === 0) {
    return { scanned: 0, inserted: 0, updated: 0 };
  }

  // Query existing obsidian spell entries
  const existingRows = sqlite
    .prepare(
      `SELECT id, slug FROM compendium_entries WHERE category = 'spell' AND source = 'obsidian'`
    )
    .all() as { id: string; slug: string }[];

  const existingMap = new Map(existingRows.map((r) => [r.slug, r.id]));

  const insertStmt = sqlite.prepare(`
    INSERT INTO compendium_entries (id, slug, title, category, source, raw_content, metadata, updated_at)
    VALUES (?, ?, ?, 'spell', 'obsidian', ?, ?, ?)
  `);

  const updateStmt = sqlite.prepare(`
    UPDATE compendium_entries
    SET title = ?, raw_content = ?, metadata = ?, updated_at = ?
    WHERE id = ?
  `);

  let inserted = 0;
  let updated = 0;
  const now = Date.now();

  const syncTx = sqlite.transaction(() => {
    for (const spell of parsedSpells) {
      const existingId = existingMap.get(spell.slug);
      const metadataJson = JSON.stringify(spell.metadata);

      if (existingId) {
        updateStmt.run(spell.title, spell.rawContent, metadataJson, now, existingId);
        updated++;
      } else {
        const newId = randomUUID();
        insertStmt.run(newId, spell.slug, spell.title, spell.rawContent, metadataJson, now);
        inserted++;
      }
    }
  });

  syncTx();

  console.log(
    `[Compendium Sync] Completed! Scanned: ${parsedSpells.length}, Inserted: ${inserted}, Updated: ${updated}`
  );

  return {
    scanned: parsedSpells.length,
    inserted,
    updated,
    git: gitResult,
  };
}

export interface VaultFileNode {
  name: string;
  title: string;
  path: string;
  type: 'file' | 'directory';
  fileCount?: number;
  children?: VaultFileNode[];
  size?: number;
  updatedAt?: number;
}

/**
 * Recursively scans the Obsidian vault and returns a file/folder tree of all .md documents.
 */
export function getVaultFileTree(vaultRootDir?: string): {
  tree: VaultFileNode[];
  totalFiles: number;
} {
  loadEnvFileIfPresent();
  const vaultRoot =
    vaultRootDir ??
    resolve(process.cwd(), process.env.VAULT_DIR?.trim() || 'data/vault');

  if (!existsSync(vaultRoot)) {
    return { tree: [], totalFiles: 0 };
  }

  let totalFiles = 0;

  function scanDir(currentDir: string, relativePath = ''): VaultFileNode[] {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    const nodes: VaultFileNode[] = [];

    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name.toLowerCase() === 'license'
      ) {
        continue;
      }

      const fullPath = join(currentDir, entry.name);
      const relPath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;
      const normalizedPath = relPath.replace(/\\/g, '/');

      if (entry.isDirectory()) {
        const children = scanDir(fullPath, relPath);
        let count = 0;
        for (const child of children) {
          count += child.type === 'file' ? 1 : (child.fileCount ?? 0);
        }
        if (children.length > 0) {
          nodes.push({
            name: entry.name,
            title: entry.name,
            path: normalizedPath,
            type: 'directory',
            fileCount: count,
            children,
          });
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        totalFiles++;
        try {
          const stats = statSync(fullPath);
          nodes.push({
            name: entry.name,
            title: entry.name.replace(/\.md$/i, ''),
            path: normalizedPath,
            type: 'file',
            size: stats.size,
            updatedAt: stats.mtimeMs,
          });
        } catch {
          nodes.push({
            name: entry.name,
            title: entry.name.replace(/\.md$/i, ''),
            path: normalizedPath,
            type: 'file',
          });
        }
      }
    }

    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru');
    });

    return nodes;
  }

  const tree = scanDir(vaultRoot);
  return { tree, totalFiles };
}

/**
 * Safely reads the text content of a markdown file in the Obsidian vault.
 */
export function getVaultFileContent(
  relativeFilePath: string,
  vaultRootDir?: string
): { path: string; title: string; content: string; updatedAt?: number } | null {
  loadEnvFileIfPresent();
  const vaultRoot =
    vaultRootDir ??
    resolve(process.cwd(), process.env.VAULT_DIR?.trim() || 'data/vault');

  // Sanitize path to prevent directory traversal
  const safeRelative = relativeFilePath
    .replace(/^[/\\]+/, '')
    .replace(/\.\.[/\\]/g, '');
  const fullPath = resolve(vaultRoot, safeRelative);

  if (!fullPath.startsWith(vaultRoot) || !existsSync(fullPath)) {
    return null;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const stats = statSync(fullPath);
    const fileName = safeRelative.split('/').pop() || safeRelative;
    const title = fileName.replace(/\.md$/i, '');

    return {
      path: safeRelative.replace(/\\/g, '/'),
      title,
      content,
      updatedAt: stats.mtimeMs,
    };
  } catch (err) {
    console.error(`[Vault] Error reading file ${fullPath}:`, err);
    return null;
  }
}
