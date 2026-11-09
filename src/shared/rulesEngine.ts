import type {
  AbilityKey,
  CharacterStats,
  CompendiumCategory,
  CompendiumEntry,
  ProficiencyRank,
  WeaponMasteryProperty,
} from './types.js';

/**
 * Maximum exhaustion level in D&D 5.5e (2024 rules).
 * At level 6, the character dies.
 */
export const MAX_EXHAUSTION_LEVEL = 6;

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculates the Proficiency Bonus based on total character level (1-20).
 * Formula: ceil(level / 4) + 1  (or floor((level - 1) / 4) + 2)
 */
export function calculateProficiencyBonus(level: number): number {
  const safeLevel = clamp(Math.floor(level), 1, 20);
  return Math.floor((safeLevel - 1) / 4) + 2;
}

/**
 * Calculates the Ability Modifier for a given ability score (e.g., 10 -> 0, 16 -> +3, 8 -> -1).
 * Formula: floor((score - 10) / 2)
 */
export function calculateAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Calculates all six ability modifiers from a CharacterStats object.
 */
export function calculateAllAbilityModifiers(
  stats: CharacterStats
): Record<AbilityKey, number> {
  return {
    str: calculateAbilityModifier(stats.str),
    dex: calculateAbilityModifier(stats.dex),
    con: calculateAbilityModifier(stats.con),
    int: calculateAbilityModifier(stats.int),
    wis: calculateAbilityModifier(stats.wis),
    cha: calculateAbilityModifier(stats.cha),
  };
}

/**
 * D&D 5.5e (2024) Exhaustion effects breakdown.
 * - Levels 1 to 6.
 * - d20Penalty: -2 * level to all d20 Tests (ability checks, attack rolls, saving throws) and Spell Save DCs.
 * - speedPenaltyFeet: 5 * level feet reduction to Speed.
 * - isDead: true when exhaustion reaches 6.
 */
export interface ExhaustionEffects {
  level: number;
  /** Penalty applied to all d20 Tests and Spell Save DCs (0, -2, -4, -6, -8, -10, -12) */
  d20Penalty: number;
  /** Penalty applied to Spell Save DCs (identical to d20Penalty in 2024 rules: -2 * level) */
  spellSaveDcPenalty: number;
  /** Speed reduction in feet (0, 5, 10, 15, 20, 25, 30) */
  speedPenaltyFeet: number;
  /** True if exhaustion level >= 6 */
  isDead: boolean;
}

/**
 * Calculates D&D 5.5e (2024) Exhaustion penalties for a given exhaustion level (0..6).
 */
export function calculateExhaustionPenalty(exhaustionLevel: number): ExhaustionEffects {
  const level = clamp(Math.floor(exhaustionLevel), 0, MAX_EXHAUSTION_LEVEL);
  // Prevent -0 in JavaScript by explicitly returning 0 when level === 0
  const penalty = level === 0 ? 0 : level * -2;
  const speedPenaltyFeet = level * 5;

  return {
    level,
    d20Penalty: penalty,
    spellSaveDcPenalty: penalty,
    speedPenaltyFeet,
    isDead: level >= MAX_EXHAUSTION_LEVEL,
  };
}

/**
 * Calculates a d20 Test modifier (Skill Check, Saving Throw, or Attack Roll)
 * taking into account Ability Score, Proficiency Rank (0 = none, 1 = proficient, 2 = expertise),
 * Character Level, Exhaustion Level (2024 rules), and any flat bonus.
 */
export function calculateD20TestModifier(params: {
  abilityScore: number;
  level: number;
  proficiencyRank?: ProficiencyRank;
  exhaustionLevel?: number;
  flatBonus?: number;
}): number {
  const abilityMod = calculateAbilityModifier(params.abilityScore);
  const profBonus = calculateProficiencyBonus(params.level);
  const rank = params.proficiencyRank ?? 0;
  const { d20Penalty } = calculateExhaustionPenalty(params.exhaustionLevel ?? 0);
  const flatBonus = params.flatBonus ?? 0;

  return abilityMod + profBonus * rank + d20Penalty + flatBonus;
}

/**
 * Calculates Spell Save DC under 2024 rules (includes exhaustion penalty).
 * Formula: 8 + proficiencyBonus + spellcastingAbilityModifier + (exhaustion * -2) + flatBonus
 */
export function calculateSpellSaveDC(params: {
  spellcastingAbilityScore: number;
  level: number;
  exhaustionLevel?: number;
  flatBonus?: number;
}): number {
  const abilityMod = calculateAbilityModifier(params.spellcastingAbilityScore);
  const profBonus = calculateProficiencyBonus(params.level);
  const { spellSaveDcPenalty } = calculateExhaustionPenalty(params.exhaustionLevel ?? 0);
  const flatBonus = params.flatBonus ?? 0;

  return 8 + profBonus + abilityMod + spellSaveDcPenalty + flatBonus;
}

/**
 * Calculates Spell Attack Bonus (+ к попаданию заклинанием) under 2024 rules.
 * Formula: proficiencyBonus + spellcastingAbilityModifier + (exhaustion * -2) + flatBonus
 */
export function calculateSpellAttackBonus(params: {
  spellcastingAbilityScore: number;
  level: number;
  exhaustionLevel?: number;
  flatBonus?: number;
}): number {
  return calculateD20TestModifier({
    abilityScore: params.spellcastingAbilityScore,
    level: params.level,
    proficiencyRank: 1,
    exhaustionLevel: params.exhaustionLevel ?? 0,
    flatBonus: params.flatBonus ?? 0,
  });
}

/**
 * Weapon attack bonus under D&D 5.5e (2024).
 * Ability modifier, proficiency when trained, exhaustion on the d20 roll,
 * and a magic weapon bonus of +1, +2, or +3.
 */
export function calculateWeaponAttackBonus(params: {
  abilityScore: number;
  level: number;
  proficient: boolean;
  exhaustionLevel?: number;
  magicBonus?: number;
}): number {
  const magicBonus = Math.max(0, Math.min(3, Math.floor(params.magicBonus ?? 0)));
  return calculateD20TestModifier({
    abilityScore: params.abilityScore,
    level: params.level,
    proficiencyRank: params.proficient ? 1 : 0,
    exhaustionLevel: params.exhaustionLevel ?? 0,
    flatBonus: magicBonus,
  });
}

/** Ability modifier plus the magic weapon bonus, added to the weapon's damage dice. */
export function calculateWeaponDamageBonus(abilityScore: number, magicBonus = 0): number {
  const magic = Math.max(0, Math.min(3, Math.floor(magicBonus)));
  return calculateAbilityModifier(abilityScore) + magic;
}

/**
 * Calculates Passive Wisdom (Perception) / Пассивная Мудрость (Восприятие) under D&D 5.5e (2024) rules.
 * Formula: 10 + Perception Modifier (including proficiency/expertise and 2024 exhaustion penalty).
 */
export function calculatePassivePerception(params: {
  wisdomScore: number;
  level: number;
  perceptionProficiencyRank?: ProficiencyRank;
  exhaustionLevel?: number;
  flatBonus?: number;
}): number {
  const perceptionMod = calculateD20TestModifier({
    abilityScore: params.wisdomScore,
    level: params.level,
    proficiencyRank: params.perceptionProficiencyRank ?? 0,
    exhaustionLevel: params.exhaustionLevel ?? 0,
    flatBonus: params.flatBonus ?? 0,
  });

  return 10 + perceptionMod;
}

/**
 * Calculates effective movement speed in feet after applying 2024 Exhaustion penalty.
 */
export function calculateEffectiveSpeed(baseSpeedFeet: number, exhaustionLevel: number): number {
  const { speedPenaltyFeet, isDead } = calculateExhaustionPenalty(exhaustionLevel);
  if (isDead) return 0;
  return Math.max(0, baseSpeedFeet - speedPenaltyFeet);
}

/**
 * Initiative modifier for D&D 5.5e (2024).
 * Initiative is a Dexterity check: Dexterity modifier, plus the exhaustion
 * penalty of −2 per level. Proficiency is not added unless a feature says so.
 */
export function calculateInitiativeModifier(params: {
  dexterityScore: number;
  exhaustionLevel?: number;
  flatBonus?: number;
}): number {
  return calculateD20TestModifier({
    abilityScore: params.dexterityScore,
    level: 1,
    proficiencyRank: 0,
    exhaustionLevel: params.exhaustionLevel ?? 0,
    flatBonus: params.flatBonus ?? 0,
  });
}

/**
 * Hit dice regained at the end of one long rest.
 * Half the pool, rounded up, so a second long rest restores whatever is left.
 * Level 1 regains its single die on the first rest.
 */
export function hitDiceRegainedOnLongRest(hitDiceMax: number): number {
  const max = Math.max(1, Math.floor(hitDiceMax));
  return Math.max(1, Math.ceil(max / 2));
}

/** Remaining hit dice after one long rest, never above the pool size. */
export function hitDiceAfterLongRest(current: number, hitDiceMax: number): number {
  const max = Math.max(1, Math.floor(hitDiceMax));
  const safeCurrent = Math.max(0, Math.min(max, Math.floor(current)));
  return Math.min(max, safeCurrent + hitDiceRegainedOnLongRest(max));
}

/**
 * Mechanical effects of active D&D 5.5e (2024) conditions on the character's own sheet.
 * Each list holds the condition keys responsible, so the UI can explain why a value changed.
 */
export interface ConditionEffects {
  /** Disadvantage on the character's attack rolls (weapons and spell attacks). */
  attackDisadvantage: string[];
  /** Disadvantage on ability checks, which includes skills and initiative. */
  abilityCheckDisadvantage: string[];
  /** Disadvantage on Initiative specifically (Incapacitated). */
  initiativeDisadvantage: string[];
  /** Disadvantage on saving throws of a given ability. */
  saveDisadvantage: Partial<Record<AbilityKey, string[]>>;
  /** Automatic failure on saving throws of a given ability. */
  saveAutoFail: Partial<Record<AbilityKey, string[]>>;
  /** Conditions that set Speed to 0. */
  speedZero: string[];
  /** Conditions that make movement cost double (crawling while Prone). */
  speedHalved: string[];
  /** Conditions that prevent actions, bonus actions, and reactions. */
  incapacitated: string[];
  /** Attack rolls against the character have Advantage. */
  attackedWithAdvantage: string[];
  /** Prone: Advantage for attackers within 5 feet, Disadvantage beyond that. */
  attackedNearbyAdvantage: string[];
  /** Resistance to all damage (Petrified). */
  resistAllDamage: string[];
}

const INCAPACITATING_CONDITIONS = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'];
const STR_DEX_AUTO_FAIL_CONDITIONS = ['paralyzed', 'petrified', 'stunned', 'unconscious'];

export function calculateConditionEffects(conditions: readonly string[]): ConditionEffects {
  const active = new Set(conditions);
  const pick = (keys: readonly string[]): string[] => keys.filter((key) => active.has(key));

  const strDexAutoFail = pick(STR_DEX_AUTO_FAIL_CONDITIONS);
  const dexDisadvantage = pick(['restrained']);

  return {
    attackDisadvantage: pick(['blinded', 'frightened', 'poisoned', 'prone', 'restrained', 'grappled']),
    abilityCheckDisadvantage: pick(['frightened', 'poisoned']),
    initiativeDisadvantage: pick(INCAPACITATING_CONDITIONS),
    saveDisadvantage: dexDisadvantage.length > 0 ? { dex: dexDisadvantage } : {},
    saveAutoFail:
      strDexAutoFail.length > 0 ? { str: strDexAutoFail, dex: strDexAutoFail } : {},
    speedZero: pick(['grappled', 'restrained', 'paralyzed', 'petrified', 'unconscious']),
    speedHalved: pick(['prone']),
    incapacitated: pick(INCAPACITATING_CONDITIONS),
    attackedWithAdvantage: pick(['blinded', 'restrained', 'paralyzed', 'petrified', 'stunned', 'unconscious']),
    attackedNearbyAdvantage: pick(['prone']),
    resistAllDamage: pick(['petrified']),
  };
}

/** Speed after exhaustion and conditions: 0 when held in place, half while crawling Prone. */
export function applyConditionSpeed(speedFeet: number, effects: ConditionEffects): number {
  if (effects.speedZero.length > 0) return 0;
  if (effects.speedHalved.length > 0) return Math.floor(speedFeet / 2);
  return speedFeet;
}

/**
 * Compendium Source Override Resolver:
 * Given a list of candidate compendium entries, resolves a single entry by `slug` and `category`.
 * Rule: If an entry with the same `slug` and `category` exists in both `'obsidian'` and `'dnd_su'`,
 * `'obsidian'` ALWAYS overrides `'dnd_su'`.
 */
export function resolveCompendiumEntry<
  T extends Pick<CompendiumEntry, 'slug' | 'category' | 'source'>
>(entries: readonly T[], slug: string, category: CompendiumCategory): T | undefined {
  const normalizedSlug = slug.trim().toLowerCase();
  const matches = entries.filter(
    (entry) =>
      entry.slug.trim().toLowerCase() === normalizedSlug && entry.category === category
  );

  if (matches.length === 0) {
    return undefined;
  }

  const obsidianMatch = matches.find((entry) => entry.source === 'obsidian');
  if (obsidianMatch) {
    return obsidianMatch;
  }

  return matches[0];
}

/**
 * Deduplicates an entire list of compendium entries by `(slug, category)`,
 * always prioritizing `source === 'obsidian'` over `source === 'dnd_su'`.
 */
export function deduplicateCompendiumEntries<
  T extends Pick<CompendiumEntry, 'slug' | 'category' | 'source'>
>(entries: readonly T[]): T[] {
  const map = new Map<string, T>();

  for (const entry of entries) {
    const key = `${entry.category}:${entry.slug.trim().toLowerCase()}`;
    const existing = map.get(key);

    if (!existing || (existing.source !== 'obsidian' && entry.source === 'obsidian')) {
      map.set(key, entry);
    }
  }

  return Array.from(map.values());
}

/**
 * Reference descriptions for D&D 5.5e (2024) Weapon Mastery properties.
 */
export const WEAPON_MASTERY_DESCRIPTIONS: Record<WeaponMasteryProperty, string> = {
  Cleave:
    'При попадании рукопашной атакой можно совершить еще одну атаку тем же оружием по второму существу в пределах 5 футов от первого (без модификатора характеристики к урону, если он положительный).',
  Graze:
    'При промахе атакой оружием цель все равно получает урон, равный модификатору характеристики, использованной для атаки (того же вида урона, что и оружие).',
  Nick:
    'Дополнительная атака свойства «Легкое» совершается как часть действия Атака, а не бонусным действием (1 раз в ход).',
  Push:
    'При попадании можно оттолкнуть цель (размера Большой или меньше) на 10 футов от себя по прямой.',
  Sap:
    'При попадании цель получает Помеху на свой следующий бросок атаки до начала вашего следующего хода.',
  Slow:
    'При попадании и нанесении урона скорость цели уменьшается на 10 футов до начала вашего следующего хода.',
  Topple:
    'При попадании цель должна преуспеть в спасброске Телосложения (СЛ 8 + БМ + мод. характеристики атаки) или упасть Ничком.',
  Vex:
    'При попадании и нанесении урона вы получаете Преимущество на следующий бросок атаки по этой цели до конца вашего следующего хода.',
};
