import { z } from 'zod';

// ============================================================================
// Compendium Schemas (2024 D&D 5.5e + Obsidian & dnd.su Hybrid)
// ============================================================================

export const CompendiumCategorySchema = z.enum([
  'spell',
  'item',
  'weapon',
  'feat',
  'feature',
  'condition',
  'rule',
]);
export type CompendiumCategory = z.infer<typeof CompendiumCategorySchema>;

export const CompendiumSourceSchema = z.enum(['obsidian', 'dnd_su']);
export type CompendiumSource = z.infer<typeof CompendiumSourceSchema>;

export const WeaponMasteryPropertySchema = z.enum([
  'Cleave',
  'Graze',
  'Nick',
  'Push',
  'Sap',
  'Slow',
  'Topple',
  'Vex',
]);
export type WeaponMasteryProperty = z.infer<typeof WeaponMasteryPropertySchema>;

export const CompendiumMetadataSchema = z
  .object({
    // Spell properties
    spellLevel: z.number().int().min(0).max(9).optional(),
    school: z.string().optional(),
    castingTime: z.string().optional(),
    range: z.string().optional(),
    components: z.string().optional(),
    duration: z.string().optional(),
    concentration: z.boolean().optional(),
    ritual: z.boolean().optional(),

    // Weapon & Item properties
    damage: z.string().optional(),
    damageType: z.string().optional(),
    weaponMastery: WeaponMasteryPropertySchema.optional(),
    weaponProperties: z.array(z.string()).optional(),
    armorClass: z.number().int().optional(),
    cost: z.string().optional(),
    weight: z.number().optional(),
    rarity: z.string().optional(),
    requiresAttunement: z.boolean().optional(),

    // Feature / Feat / Rule prerequisites
    prerequisite: z.string().optional(),
    levelRequirement: z.number().int().min(1).max(20).optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export type CompendiumMetadata = z.infer<typeof CompendiumMetadataSchema>;

export const CompendiumEntrySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  category: CompendiumCategorySchema,
  source: CompendiumSourceSchema,
  source_url: z.string().url().nullable().optional(),
  raw_content: z.string(),
  metadata: CompendiumMetadataSchema,
  updated_at: z.number().int(),
});
export type CompendiumEntry = z.infer<typeof CompendiumEntrySchema>;

// ============================================================================
// Character Schemas (D&D 5.5e 2024 Ruleset)
// ============================================================================

export const AbilityKeySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export type AbilityKey = z.infer<typeof AbilityKeySchema>;

export const SpellcastingAbilityKeySchema = z.enum(['int', 'wis', 'cha']);
export type SpellcastingAbilityKey = z.infer<typeof SpellcastingAbilityKeySchema>;

export const CharacterStatsSchema = z.object({
  str: z.number().int().min(1).max(30).default(10),
  dex: z.number().int().min(1).max(30).default(10),
  con: z.number().int().min(1).max(30).default(10),
  int: z.number().int().min(1).max(30).default(10),
  wis: z.number().int().min(1).max(30).default(10),
  cha: z.number().int().min(1).max(30).default(10),
});
export type CharacterStats = z.infer<typeof CharacterStatsSchema>;

/**
 * Proficiency rank:
 * 0 = none, 1 = proficient, 2 = expertise
 */
export const ProficiencyRankSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type ProficiencyRank = z.infer<typeof ProficiencyRankSchema>;

/**
 * All 18 D&D 5.5e skills in Russian alphabetical order.
 */
export const SKILL_KEYS = [
  'acrobatics',
  'investigation',
  'athletics',
  'perception',
  'survival',
  'performance',
  'intimidation',
  'history',
  'sleight_of_hand',
  'arcana',
  'medicine',
  'deception',
  'nature',
  'insight',
  'religion',
  'stealth',
  'persuasion',
  'animal_handling',
] as const;

export const SkillKeySchema = z.enum(SKILL_KEYS);
export type SkillKey = z.infer<typeof SkillKeySchema>;

export interface SkillDefinition {
  key: SkillKey;
  label: string;
  ability: AbilityKey;
  abilityShortLabel: string;
}

export const DND55E_SKILLS: readonly SkillDefinition[] = [
  { key: 'acrobatics', label: 'Акробатика', ability: 'dex', abilityShortLabel: 'ЛОВ' },
  { key: 'investigation', label: 'Анализ', ability: 'int', abilityShortLabel: 'ИНТ' },
  { key: 'athletics', label: 'Атлетика', ability: 'str', abilityShortLabel: 'СИЛ' },
  { key: 'perception', label: 'Восприятие', ability: 'wis', abilityShortLabel: 'МДР' },
  { key: 'survival', label: 'Выживание', ability: 'wis', abilityShortLabel: 'МДР' },
  { key: 'performance', label: 'Выступление', ability: 'cha', abilityShortLabel: 'ХАР' },
  { key: 'intimidation', label: 'Запугивание', ability: 'cha', abilityShortLabel: 'ХАР' },
  { key: 'history', label: 'История', ability: 'int', abilityShortLabel: 'ИНТ' },
  { key: 'sleight_of_hand', label: 'Ловкость рук', ability: 'dex', abilityShortLabel: 'ЛОВ' },
  { key: 'arcana', label: 'Магия', ability: 'int', abilityShortLabel: 'ИНТ' },
  { key: 'medicine', label: 'Медицина', ability: 'wis', abilityShortLabel: 'МДР' },
  { key: 'deception', label: 'Обман', ability: 'cha', abilityShortLabel: 'ХАР' },
  { key: 'nature', label: 'Природа', ability: 'int', abilityShortLabel: 'ИНТ' },
  { key: 'insight', label: 'Проницательность', ability: 'wis', abilityShortLabel: 'МДР' },
  { key: 'religion', label: 'Религия', ability: 'int', abilityShortLabel: 'ИНТ' },
  { key: 'stealth', label: 'Скрытность', ability: 'dex', abilityShortLabel: 'ЛОВ' },
  { key: 'persuasion', label: 'Убеждение', ability: 'cha', abilityShortLabel: 'ХАР' },
  { key: 'animal_handling', label: 'Уход за животными', ability: 'wis', abilityShortLabel: 'МДР' },
] as const;

export const CharacterProficienciesSchema = z.object({
  savingThrows: z.array(AbilityKeySchema).default([]),
  skills: z.record(z.string(), ProficiencyRankSchema).default({}),
  /**
   * Extra flat bonus on top of ability, proficiency, and exhaustion.
   * Edited per skill. The shared bonus from the "⋯" menu is `globalSkillBonus`.
   */
  skillBonuses: z.record(z.string(), z.number().int().min(-150).max(150)).default({}),
  /** Shared flat bonus added to every skill. Shown on the "⋯" control. */
  globalSkillBonus: z.number().int().min(-150).max(150).default(0),
  /** Extra flat bonus on each saving throw, edited directly on the save row. */
  saveBonuses: z.record(z.string(), z.number().int().min(-150).max(150)).default({}),
  weapons: z.array(z.string()).default([]),
  weaponMasteries: z.array(z.string()).default([]),
  armor: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  languages: z.array(z.string()).default(['Common']),
});
export type CharacterProficiencies = z.infer<typeof CharacterProficienciesSchema>;

export const CharacterHpSchema = z.object({
  current: z.number().int().min(0).default(10),
  max: z.number().int().min(1).default(10),
  temp: z.number().int().min(0).default(0),
  hit_dice_current: z.number().int().min(0).default(1),
  hit_dice_max: z.number().int().min(1).default(1),
  hit_die_type: z.enum(['d6', 'd8', 'd10', 'd12']).optional().default('d8'),
  death_save_successes: z.number().int().min(0).max(3).default(0),
  death_save_failures: z.number().int().min(0).max(3).default(0),
  /** Active D&D 5.5e conditions. Cleared on a short or long rest. */
  conditions: z.array(z.string()).default([]),
  armor_class: z.number().int().min(0).max(50).default(10),
  speed: z.number().int().min(0).max(300).default(30),
});
export type CharacterHp = z.infer<typeof CharacterHpSchema>;

/**
 * Binary conditions from the D&D 5.5e (2024) rules.
 * Exhaustion is tracked separately as levels 0–6.
 */
export const DND55E_CONDITIONS = [
  { key: 'blinded', label: 'Ослеплён' },
  { key: 'charmed', label: 'Очарован' },
  { key: 'deafened', label: 'Оглох' },
  { key: 'frightened', label: 'Испуган' },
  { key: 'grappled', label: 'Схвачен' },
  { key: 'incapacitated', label: 'Недееспособен' },
  { key: 'paralyzed', label: 'Парализован' },
  { key: 'petrified', label: 'Окаменел' },
  { key: 'poisoned', label: 'Отравлен' },
  { key: 'prone', label: 'Ничком' },
  { key: 'restrained', label: 'Опутан' },
  { key: 'stunned', label: 'Ошеломлён' },
  { key: 'unconscious', label: 'Без сознания' },
] as const;

export const DieTypeSchema = z.enum(['none', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
export type DieType = z.infer<typeof DieTypeSchema>;

export const ResourceResetTriggerSchema = z.enum([
  'short_rest',
  'long_rest',
  'dawn',
  'manual',
]);
export type ResourceResetTrigger = z.infer<typeof ResourceResetTriggerSchema>;

export const CustomResourceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  current: z.number().int().min(0),
  max: z.number().int().min(0),
  die_type: DieTypeSchema.optional(),
  reset_on: ResourceResetTriggerSchema.default('long_rest'),
  description: z.string().optional(),
});
export type CustomResource = z.infer<typeof CustomResourceSchema>;

export const InventoryItemSchema = z.object({
  id: z.string(),
  compendium_slug: z.string().optional(),
  name: z.string().min(1),
  quantity: z.number().int().min(0).default(1),
  equipped: z.boolean().default(false),
  attuned: z.boolean().default(false),
  weight: z.number().min(0).optional(),
  overrides: z
    .object({
      damage: z.string().optional(),
      damageType: z.string().optional(),
      attackBonus: z.number().int().optional(),
      weaponMastery: WeaponMasteryPropertySchema.optional(),
      notes: z.string().optional(),
    })
    .optional(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const WeaponAttackSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(80).default(''),
  proficient: z.boolean().default(false),
  ability: AbilityKeySchema.default('str'),
  damage: z.string().max(40).default(''),
  /** Magic weapon bonus from the 2024 rules: +1, +2, or +3 to attack and damage. */
  magicBonus: z.number().int().min(0).max(3).default(0),
  description: z.string().max(400).default(''),
});
export type WeaponAttack = z.infer<typeof WeaponAttackSchema>;

export const SpellSlotLevelSchema = z.object({
  current: z.number().int().min(0),
  max: z.number().int().min(0),
});
export type SpellSlotLevel = z.infer<typeof SpellSlotLevelSchema>;

export const CharacterSpellsSchema = z.object({
  spellcastingAbility: AbilityKeySchema.nullable().default(null),
  /** How many spell-slot rows (1…9) are shown. Rows are always 1 through this level. */
  visibleSlotLevels: z.number().int().min(1).max(9).default(1),
  slots: z.record(z.string(), SpellSlotLevelSchema).default({}),
  pactSlots: z
    .object({
      level: z.number().int().min(1).max(5),
      current: z.number().int().min(0),
      max: z.number().int().min(0),
    })
    .optional(),
  preparedSlugs: z.array(z.string()).default([]),
  knownSlugs: z.array(z.string()).default([]),
});
export type CharacterSpells = z.infer<typeof CharacterSpellsSchema>;

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  player_name: z.string().min(1),
  level: z.number().int().min(1).max(20).default(1),
  species: z.string().min(1),
  class_name: z.string().min(1),
  subclass_name: z.string().nullable().default(null),
  stats: CharacterStatsSchema,
  proficiencies: CharacterProficienciesSchema,
  hp: CharacterHpSchema,
  exhaustion: z.number().int().min(0).max(6).default(0),
  custom_resources: z.array(CustomResourceSchema).default([]),
  inventory: z.array(InventoryItemSchema).default([]),
  weapon_attacks: z.array(WeaponAttackSchema).default([]),
  spells: CharacterSpellsSchema,
  notes: z.string().default(''),
  updated_at: z.union([z.number().int(), z.string(), z.date()]).optional(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CreateCharacterInputSchema = z.object({
  name: z.string().trim().min(1).default('Новый персонаж'),
  player_name: z.string().trim().min(1).default('Игрок'),
  level: z.number().int().min(1).max(20).default(1),
  species: z.string().trim().min(1).default('Человек'),
  class_name: z.string().trim().min(1).default('Воин'),
  subclass_name: z.string().trim().nullable().default(null),
});
export type CreateCharacterInput = z.infer<typeof CreateCharacterInputSchema>;

export const UpdateCharacterPatchSchema = z.object({
  name: z.string().min(1).optional(),
  player_name: z.string().min(1).optional(),
  level: z.number().int().min(1).max(20).optional(),
  species: z.string().min(1).optional(),
  class_name: z.string().min(1).optional(),
  subclass_name: z.string().nullable().optional(),
  stats: CharacterStatsSchema.optional(),
  proficiencies: CharacterProficienciesSchema.optional(),
  hp: CharacterHpSchema.optional(),
  exhaustion: z.number().int().min(0).max(6).optional(),
  custom_resources: z.array(CustomResourceSchema).optional(),
  inventory: z.array(InventoryItemSchema).optional(),
  weapon_attacks: z.array(WeaponAttackSchema).optional(),
  spells: CharacterSpellsSchema.optional(),
  notes: z.string().optional(),
});
export type UpdateCharacterPatch = z.infer<typeof UpdateCharacterPatchSchema>;

// ============================================================================
// WebSocket Real-time Sync Message Schemas
// ============================================================================

export const WsMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('character:subscribe'),
    characterId: z.string(),
  }),
  z.object({
    type: z.literal('character:update'),
    characterId: z.string(),
    patch: UpdateCharacterPatchSchema,
    updatedBy: z.enum(['player', 'dm']).default('player'),
  }),
  z.object({
    type: z.literal('dice:roll'),
    characterId: z.string().optional(),
    rollerName: z.string(),
    label: z.string(),
    formula: z.string(),
    total: z.number(),
    breakdown: z.string(),
    timestamp: z.number().int(),
  }),
]);
export type WsMessage = z.infer<typeof WsMessageSchema>;
