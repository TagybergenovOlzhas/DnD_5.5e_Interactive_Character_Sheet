import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Feather,
  Moon,
  MoreHorizontal,
  Plus,
  ScrollText,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  calculateAbilityModifier,
  calculateD20TestModifier,
  calculateEffectiveSpeed,
  calculateInitiativeModifier,
  calculatePassivePerception,
  calculateProficiencyBonus,
  calculateSpellAttackBonus,
  calculateSpellSaveDC,
  calculateWeaponAttackBonus,
  calculateWeaponDamageBonus,
  applyConditionSpeed,
  calculateConditionEffects,
} from '@shared/rulesEngine';
import {
  DND55E_CONDITIONS,
  DND55E_SKILLS,
  type AbilityKey,
  type ProficiencyRank,
} from '@shared/types';
import { useCharacterStore } from './store';

const ABILITY_META: Record<AbilityKey, { short: string; full: string }> = {
  str: { short: 'СИЛ', full: 'Сила' },
  dex: { short: 'ЛОВ', full: 'Ловкость' },
  con: { short: 'ТЕЛ', full: 'Телосложение' },
  int: { short: 'ИНТ', full: 'Интеллект' },
  wis: { short: 'МДР', full: 'Мудрость' },
  cha: { short: 'ХАР', full: 'Харизма' },
};

const ABILITY_ORDER: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

type DockTab = 'sheet' | 'inventory' | 'compendium';

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function conditionNames(keys: readonly string[]): string {
  return [...new Set(keys)]
    .map((key) => DND55E_CONDITIONS.find((condition) => condition.key === key)?.label ?? key)
    .join(', ');
}

/**
 * Fully editable numeric input that allows clearing the field completely while typing
 * (e.g. deleting "10" to type "8") and clamps/commits cleanly on valid digits or on blur.
 */
function EditableNumberInput({
  value,
  min,
  max,
  step,
  onChange,
  className,
  title,
  ariaLabel,
}: {
  value: number;
  min: number;
  max?: number;
  step?: number;
  onChange: (nextValue: number) => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const clampValue = (num: number): number => {
    const floored = Math.floor(num);
    const aboveMin = Math.max(min, floored);
    return max !== undefined ? Math.min(max, aboveMin) : aboveMin;
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      step={step}
      value={isFocused ? draft : String(value)}
      title={title}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setIsFocused(true);
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        setDraft(raw);
        if (raw !== '') {
          const parsed = Number.parseInt(raw, 10);
          if (!Number.isNaN(parsed)) {
            onChange(clampValue(parsed));
          }
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        if (draft.trim() === '') {
          setDraft(String(value));
          return;
        }
        const parsed = Number.parseInt(draft, 10);
        if (Number.isNaN(parsed)) {
          setDraft(String(value));
          return;
        }
        const finalVal = clampValue(parsed);
        setDraft(String(finalVal));
        if (finalVal !== value) {
          onChange(finalVal);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const inc = step ?? 1;
          const next = clampValue((Number.parseInt(draft, 10) || value) + inc);
          setDraft(String(next));
          onChange(next);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const dec = step ?? 1;
          const next = clampValue((Number.parseInt(draft, 10) || value) - dec);
          setDraft(String(next));
          onChange(next);
        }
      }}
      className={className}
    />
  );
}

/**
 * Signed modifier field (+2, -1, 0). Empty or a lone minus stays local until a full number is entered.
 */
function EditableSignedInput({
  value,
  min,
  max,
  onChange,
  className,
  title,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (nextValue: number) => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string>(formatSigned(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(formatSigned(value));
    }
  }, [value, isFocused]);

  const clampValue = (num: number): number => {
    return Math.max(min, Math.min(max, Math.trunc(num)));
  };

  const commitDraft = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '+') {
      setDraft(formatSigned(value));
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      setDraft(formatSigned(value));
      return;
    }
    const finalVal = clampValue(parsed);
    setDraft(formatSigned(finalVal));
    if (finalVal !== value) {
      onChange(finalVal);
    }
  };

  return (
    <input
      type="text"
      inputMode="text"
      value={isFocused ? draft : formatSigned(value)}
      title={title}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setIsFocused(true);
        setDraft(formatSigned(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d+-]/g, '').replace(/(?!^)[+-]/g, '');
        setDraft(cleaned);
        if (/^[+-]?\d+$/.test(cleaned)) {
          const parsed = Number.parseInt(cleaned, 10);
          if (!Number.isNaN(parsed)) {
            const next = clampValue(parsed);
            if (next !== value) {
              onChange(next);
            }
          }
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        commitDraft(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const base = Number.parseInt(draft, 10);
          const current = Number.isNaN(base) ? value : base;
          const next = clampValue(current + (e.key === 'ArrowUp' ? 1 : -1));
          setDraft(formatSigned(next));
          if (next !== value) {
            onChange(next);
          }
        }
      }}
      className={className}
    />
  );
}

/**
 * Auto-sizing inline text input that expands/shrinks to match the exact width of its text
 * (or placeholder when empty) so adjacent labels automatically shift right/left without overlapping.
 */
function AutoWidthTextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}): React.JSX.Element {
  const displayString = value.length > 0 ? value : placeholder;

  return (
    <span className="inline-grid items-center align-baseline">
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 invisible whitespace-pre pointer-events-none select-none px-0.5 ${className ?? ''}`}
      >
        {displayString}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        size={1}
        className={`col-start-1 row-start-1 w-full min-w-[2ch] bg-transparent border-none outline-none px-0.5 ${className ?? ''}`}
      />
    </span>
  );
}

/**
 * Clickable proficiency dot for the 18 skills list:
 * 0 = #D6D1C7 (no proficiency)
 * 1 = #7E998A (Sage — proficient)
 * 2 = #D4A359 (Ochre — expertise / double ring)
 */
function SkillDot({ rank }: { rank: ProficiencyRank }): React.JSX.Element {
  if (rank === 2) {
    return (
      <span
        title="Компетентность / Экспертиза (+2 × БМ)"
        className="w-3 h-3 rounded-full bg-[var(--ochre)] ring-2 ring-[color-mix(in_srgb,var(--ochre)_30%,transparent)] flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
      >
        <span className="w-1 h-1 rounded-full bg-[var(--paper)]" />
      </span>
    );
  }

  if (rank === 1) {
    return (
      <span
        title="Владение (+БМ)"
        className="w-3 h-3 rounded-full bg-[var(--sage)] flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
      />
    );
  }

  return (
    <span
      title="Нет владения"
      className="w-3 h-3 rounded-full bg-[var(--stone)] group-hover:bg-[color-mix(in_srgb,var(--muted)_50%,transparent)] shrink-0 transition-colors"
    />
  );
}

export function App(): React.JSX.Element {
  const {
    characters,
    activeCharacterId,
    isLoading,
    isSaving,
    fetchCharacters,
    selectCharacter,
    createCharacter,
    deleteCharacter,
    updateIdentity,
    setLevel,
    setExhaustion,
    setStat,
    toggleSavingThrowProficiency,
    cycleSkillProficiency,
    setSkillBonus,
    setSaveBonus,
    addBonusToAllSkills,
    updateHpAndCombat,
    setSpellcastingAbility,
    updateSpellSlot,
    setVisibleSpellSlotLevels,
    resetAllSpellSlots,
    setWeaponAttacks,
    takeShortRest,
    takeLongRest,
  } = useCharacterStore();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [night, setNight] = useState(
    () => window.localStorage.getItem('dnd-sheet-night') === '1'
  );
  const [activeDockTab, setActiveDockTab] = useState<DockTab>('sheet');
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [weaponMenuId, setWeaponMenuId] = useState<string | null>(null);
  const [allSkillsBonusDraft, setAllSkillsBonusDraft] = useState('');
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const weaponMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchCharacters();
  }, [fetchCharacters]);

  useEffect(() => {
    document.documentElement.classList.toggle('night', night);
    window.localStorage.setItem('dnd-sheet-night', night ? '1' : '0');
  }, [night]);

  const activeCharacter = characters.find((c) => c.id === activeCharacterId) ?? null;

  useEffect(() => {
    setConfirmDelete(false);
    setSkillMenuOpen(false);
    setWeaponMenuId(null);
    setAllSkillsBonusDraft('');
  }, [activeCharacterId]);

  useEffect(() => {
    if (!skillMenuOpen) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (!skillMenuRef.current?.contains(event.target as Node)) {
        setSkillMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSkillMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [skillMenuOpen]);

  useEffect(() => {
    if (!weaponMenuId) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (!weaponMenuRef.current?.contains(event.target as Node)) {
        setWeaponMenuId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setWeaponMenuId(null);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [weaponMenuId]);

  const applyBonusToAllSkills = (): void => {
    const trimmed = allSkillsBonusDraft.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) return;
    const amount = Number.parseInt(trimmed, 10);
    if (Number.isNaN(amount) || amount === 0) return;
    addBonusToAllSkills(amount);
    setAllSkillsBonusDraft('');
    setSkillMenuOpen(false);
  };

  if (isLoading || !activeCharacter) {
    return (
      <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] flex items-center justify-center p-8">
        <div className="font-serif italic text-xl text-[var(--muted)]">
          Раскрываем страницы журнала персонажа...
        </div>
      </div>
    );
  }

  const {
    name,
    level,
    species,
    class_name,
    subclass_name,
    stats,
    proficiencies,
    hp,
    exhaustion,
    spells,
    weapon_attacks: weaponAttacks,
  } = activeCharacter;

  const profBonus = calculateProficiencyBonus(level);
  const baseSpeedFeet = hp.speed ?? 30;
  const armorClass = hp.armor_class ?? 10;
  const effectiveSpeed = calculateEffectiveSpeed(baseSpeedFeet, exhaustion);

  const spellcastingAbility = spells.spellcastingAbility;
  const spellSaveDc =
    spellcastingAbility !== null
      ? calculateSpellSaveDC({
          spellcastingAbilityScore: stats[spellcastingAbility],
          level,
          exhaustionLevel: exhaustion,
        })
      : null;

  const spellAttackBonus =
    spellcastingAbility !== null
      ? calculateSpellAttackBonus({
          spellcastingAbilityScore: stats[spellcastingAbility],
          level,
          exhaustionLevel: exhaustion,
        })
      : null;

  const perceptionRank = (proficiencies.skills?.perception ?? 0) as ProficiencyRank;
  const passivePerception = calculatePassivePerception({
    wisdomScore: stats.wis,
    level,
    perceptionProficiencyRank: perceptionRank,
    exhaustionLevel: exhaustion,
    flatBonus: (proficiencies.skillBonuses?.perception ?? 0) + (proficiencies.globalSkillBonus ?? 0),
  });

  const safeMaxHp = Math.max(1, hp.max);
  const clampedCurrentHp = Math.max(0, Math.min(hp.current, safeMaxHp));
  const safeTempHp = Math.max(0, hp.temp);
  const hpBarDenominator = Math.max(safeMaxHp, clampedCurrentHp + safeTempHp);
  const currentHpWidthPercent = (clampedCurrentHp / hpBarDenominator) * 100;
  const tempHpWidthPercent = (safeTempHp / hpBarDenominator) * 100;
  const hpPercent = Math.max(
    0,
    Math.min(100, Math.round((hp.current / safeMaxHp) * 100))
  );

  const initiativeMod = calculateInitiativeModifier({
    dexterityScore: stats.dex,
    exhaustionLevel: exhaustion,
  });
  const hitDiceMax = level;
  const hitDiceCurrent = Math.max(0, Math.min(hitDiceMax, hp.hit_dice_current ?? hitDiceMax));
  const hitDieType = hp.hit_die_type ?? 'd8';
  const deathSaveSuccesses = hp.death_save_successes ?? 0;
  const deathSaveFailures = hp.death_save_failures ?? 0;
  const activeConditions = hp.conditions ?? [];
  const availableConditions = DND55E_CONDITIONS.filter(
    (condition) => !activeConditions.includes(condition.key)
  );
  const conditionEffects = calculateConditionEffects(activeConditions);
  const shownSpeed = applyConditionSpeed(effectiveSpeed, conditionEffects);
  const speedAltered = shownSpeed !== effectiveSpeed;
  const checkHindrance = conditionEffects.abilityCheckDisadvantage;
  const attackHindrance = [
    ...conditionEffects.incapacitated,
    ...conditionEffects.attackDisadvantage,
  ];
  const initiativeHindrance = [
    ...conditionEffects.abilityCheckDisadvantage,
    ...conditionEffects.initiativeDisadvantage,
  ];
  const defenseHindrance = [
    ...conditionEffects.attackedWithAdvantage,
    ...conditionEffects.attackedNearbyAdvantage,
  ];
  const passiveShown = passivePerception - (checkHindrance.length > 0 ? 5 : 0);

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] pb-16">
      <div className="max-w-[1320px] mx-auto px-5 py-3.5 space-y-3.5">
        {/* =================================================================== */}
        {/* EDITORIAL HEADER (Compact for 14" laptop screen)                    */}
        {/* =================================================================== */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          {/* Left: Italic Species / Class / Subclass + Large Serif Character Name */}
          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="flex flex-row flex-wrap items-baseline gap-x-3 gap-y-0.5 font-serif italic text-base md:text-lg text-[var(--muted)]">
              <AutoWidthTextInput
                value={species}
                onChange={(val) => updateIdentity({ species: val })}
                placeholder="Вид"
                ariaLabel="Вид персонажа"
                className="font-serif italic text-base md:text-lg text-[var(--muted)] focus:text-[var(--ink)] transition-colors placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
              />
              <AutoWidthTextInput
                value={class_name}
                onChange={(val) => updateIdentity({ class_name: val })}
                placeholder="Класс"
                ariaLabel="Класс персонажа"
                className="font-serif italic text-base md:text-lg text-[var(--muted)] focus:text-[var(--ink)] transition-colors placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
              />
              <AutoWidthTextInput
                value={subclass_name ?? ''}
                onChange={(val) =>
                  updateIdentity({
                    subclass_name: val.trim() === '' ? null : val,
                  })
                }
                placeholder="Подкласс"
                ariaLabel="Подкласс персонажа"
                className="font-serif italic text-base md:text-lg text-[var(--muted)] focus:text-[var(--ink)] transition-colors placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
              />
            </div>

            <div className="relative inline-block w-full max-w-2xl">
              <input
                type="text"
                value={name}
                onChange={(e) => updateIdentity({ name: e.target.value })}
                placeholder="Имя Персонажа"
                aria-label="Имя персонажа"
                className="w-full bg-transparent border-none outline-none font-serif font-normal tracking-tight text-3xl md:text-4xl leading-tight text-[var(--ink)] placeholder:text-[color-mix(in_srgb,var(--muted)_40%,transparent)]"
              />
            </div>
          </div>

          {/* Right: Tactile Pills for Character Switcher, New Character, Level, Delete */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-end">
            <button
              type="button"
              aria-label={night ? 'Дневной режим' : 'Ночной режим'}
              aria-pressed={night}
              title={night ? 'Дневной режим' : 'Ночной режим'}
              onClick={() => setNight((value) => !value)}
              className="w-8 h-8 rounded-full bg-[var(--card)] text-[var(--ochre)] hover:bg-[var(--ink)] hover:text-[var(--paper)] inline-flex items-center justify-center transition-colors duration-300 cursor-pointer"
            >
              <span
                className={`inline-flex transition-transform duration-700 ease-out ${
                  night ? 'rotate-[360deg]' : 'rotate-0'
                }`}
              >
                {night ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </span>
            </button>
            <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium mr-1">
              {isSaving ? 'Сохранение...' : 'Сохранено'}
            </span>

            {/* Character Selector Pill */}
            <div className="rounded-full bg-[var(--card)] px-3.5 py-1.5 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                Герой
              </span>
              <select
                aria-label="Выбор персонажа"
                value={activeCharacter.id}
                onChange={(e) => selectCharacter(e.target.value)}
                className="bg-transparent text-xs uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer pr-1"
              >
                {characters.map((char) => (
                  <option
                    key={char.id}
                    value={char.id}
                    className="bg-[var(--paper)] text-[var(--ink)]"
                  >
                    {char.name} ({char.class_name} {char.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Level Selector Pill */}
            <div className="rounded-full bg-[var(--card)] px-3 py-1 flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                Ур.
              </span>
              <button
                type="button"
                onClick={() => setLevel(level - 1)}
                className="w-5 h-5 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
              >
                −
              </button>
              <EditableNumberInput
                min={1}
                max={20}
                value={level}
                onChange={(val) => setLevel(val)}
                ariaLabel="Уровень персонажа"
                className="w-6 bg-transparent text-center font-serif text-base font-semibold text-[var(--ink)] outline-none"
              />
              <button
                type="button"
                onClick={() => setLevel(level + 1)}
                className="w-5 h-5 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Create New Character Ink Pill Button */}
            <button
              type="button"
              onClick={() => void createCharacter()}
              className="rounded-full bg-[var(--ink)] text-[var(--paper)] hover:bg-[color-mix(in_srgb,var(--ink)_90%,transparent)] px-3.5 py-1.5 text-xs uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Создать персонажа</span>
            </button>

            {/* Delete Character Pill Button (with confirmation) */}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="Удалить персонажа"
                className="rounded-full bg-[var(--card)] hover:bg-[color-mix(in_srgb,var(--clay)_20%,transparent)] text-[var(--muted)] hover:text-[var(--clay)] px-3 py-1.5 text-xs uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="rounded-full bg-[var(--clay)] text-[var(--paper)] px-3.5 py-1 flex items-center gap-2 text-xs uppercase tracking-wider">
                <span>Удалить?</span>
                <button
                  type="button"
                  onClick={() => void deleteCharacter(activeCharacter.id)}
                  className="font-bold underline cursor-pointer"
                >
                  Да
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="opacity-80 hover:opacity-100 cursor-pointer"
                >
                  Нет
                </button>
              </div>
            )}
          </div>
        </header>

        {/* =================================================================== */}
        {/* MAIN WORKSPACE (Optimized to fit 14" Laptop Viewport at once)       */}
        {/* =================================================================== */}
        <main className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <section className="bg-[var(--card)] rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                  ХАРАКТЕРИСТИКИ, СПАСБРОСКИ И НАВЫКИ
                </h2>

                {/* Legend Dots + bulk skill bonus */}
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  <div className="relative" ref={skillMenuRef}>
                    <button
                      type="button"
                      aria-label={`Общий бонус навыков ${formatSigned(proficiencies.globalSkillBonus ?? 0)}. Добавить число ко всем навыкам`}
                      aria-expanded={skillMenuOpen}
                      onClick={() => setSkillMenuOpen((open) => !open)}
                      className={`h-7 rounded-full px-2 inline-flex items-center gap-1 transition-colors cursor-pointer ${
                        skillMenuOpen
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--paper)] text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                      <span
                        className={`font-serif text-sm font-semibold tabular-nums normal-case tracking-normal leading-none ${
                          skillMenuOpen ? 'text-[var(--paper)]' : 'text-[var(--ink)]'
                        }`}
                      >
                        {formatSigned(proficiencies.globalSkillBonus ?? 0)}
                      </span>
                    </button>

                    {skillMenuOpen && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          applyBonusToAllSkills();
                        }}
                        className="absolute right-0 top-full mt-2 z-50 w-60 rounded-2xl bg-[var(--paper)] p-3 shadow-lg space-y-2"
                      >
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                          Ко всем навыкам
                        </p>
                        <p className="font-serif text-3xl leading-none text-[var(--ink)] text-center">
                          {formatSigned(proficiencies.globalSkillBonus ?? 0)}
                        </p>
                        <p className="text-[11px] normal-case tracking-normal text-[color-mix(in_srgb,var(--ink)_80%,transparent)] leading-snug text-center">
                          Сейчас на каждом навыке. Новое число прибавится к этому.
                        </p>
                        <input
                          autoFocus
                          type="text"
                          inputMode="text"
                          aria-label="Число для всех навыков"
                          placeholder="2 или −1"
                          value={allSkillsBonusDraft}
                          onChange={(e) =>
                            setAllSkillsBonusDraft(
                              e.target.value.replace(/[^\d+-]/g, '').replace(/(?!^)[+-]/g, '')
                            )
                          }
                          className="w-full rounded-xl bg-[var(--card)] px-3 py-2 text-center font-serif text-lg text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                        <button
                          type="submit"
                          className="w-full rounded-full bg-[var(--ink)] text-[var(--paper)] py-1.5 text-[10px] uppercase tracking-wider font-semibold cursor-pointer"
                        >
                          Применить
                        </button>
                      </form>
                    )}
                  </div>

                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[var(--sage)]" />
                    <span>Влад.</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[var(--ochre)]" />
                    <span>Эксп.</span>
                  </span>
                </div>
              </div>

              {/* 2 Columns: [Exhaustion + STR, DEX, CON] on left | [INT, WIS, CHA] on right */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                {(
                  [
                    ['str', 'dex', 'con'],
                    ['int', 'wis', 'cha'],
                  ] as const
                ).map((group, colIdx) => (
                  <div key={colIdx} className="space-y-3">
                    {colIdx === 0 && (
                      <>
                      <div className="bg-[var(--paper)] rounded-xl p-3 space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                          ИСТОЩЕНИЕ
                        </div>

                        <div className="grid grid-cols-7 gap-1.5 items-center">
                          {[0, 1, 2, 3, 4, 5, 6].map((lvl) => {
                            const isActive = exhaustion === lvl;
                            return (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => setExhaustion(lvl)}
                                className={`rounded-full py-2 px-1 flex flex-col items-center justify-center transition-all cursor-pointer ${
                                  isActive
                                    ? 'bg-[var(--ink)] text-[var(--paper)] py-2.5 -my-0.5'
                                    : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--ink)]'
                                }`}
                              >
                                <span
                                  className={`font-serif text-base leading-none ${
                                    isActive
                                      ? 'text-[var(--paper)] font-semibold'
                                      : 'text-[var(--ink)]'
                                  }`}
                                >
                                  {lvl}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="bg-[var(--paper)] rounded-xl p-3 flex items-end justify-between">
                        <div className="space-y-2">
                          <span className="block text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                            БОНУС МАСТЕРСТВА
                          </span>
                          <span className="block font-serif text-3xl leading-none text-[var(--ink)]">
                            {formatSigned(profBonus)}
                          </span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-[var(--ochre)] mb-1" />
                      </div>
                      </>
                    )}

                    {group.map((key) => {
                      const score = stats[key];
                      const rawMod = calculateAbilityModifier(score);
                      const checkMod = calculateD20TestModifier({
                        abilityScore: score,
                        level,
                        proficiencyRank: 0,
                        exhaustionLevel: exhaustion,
                      });
                      const isSaveProficient =
                        proficiencies.savingThrows?.includes(key) ?? false;
                      const saveBonus = proficiencies.saveBonuses?.[key] ?? 0;
                      const saveMod = calculateD20TestModifier({
                        abilityScore: score,
                        level,
                        proficiencyRank: isSaveProficient ? 1 : 0,
                        exhaustionLevel: exhaustion,
                        flatBonus: saveBonus,
                      });
                      const saveHindrance = [
                        ...(conditionEffects.saveAutoFail[key] ?? []),
                        ...(conditionEffects.saveDisadvantage[key] ?? []),
                      ];
                      const saveAutoFail = (conditionEffects.saveAutoFail[key] ?? []).length > 0;
                      const saveBase = saveMod - saveBonus;

                      const abilitySkills = DND55E_SKILLS.filter(
                        (skill) => skill.ability === key
                      );

                      return (
                        <div
                          key={key}
                          className="bg-[var(--paper)] rounded-xl p-3 flex flex-col space-y-1.5"
                        >
                          {/* Compact Header: Ability Name + Modifier + Base Score Input */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-baseline gap-2.5">
                              <span
                                className={`font-serif font-semibold tracking-tight text-2xl leading-none ${
                                  checkHindrance.length > 0 ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
                                }`}
                                title={
                                  checkHindrance.length > 0
                                    ? `Помеха на проверки: ${conditionNames(checkHindrance)}`
                                    : undefined
                                }
                              >
                                {formatSigned(checkMod)}
                              </span>
                              <span className="font-serif italic text-sm text-[var(--muted)]">
                                {ABILITY_META[key].full}
                              </span>
                              {exhaustion > 0 && (
                                <span className="text-[10px] text-[var(--clay)] font-medium">
                                  (баз. {formatSigned(rawMod)})
                                </span>
                              )}
                            </div>

                            <EditableNumberInput
                              min={1}
                              max={30}
                              value={score}
                              onChange={(val) => setStat(key, val)}
                              title="Базовое значение характеристики (1–30)"
                              ariaLabel={ABILITY_META[key].full}
                              className="w-9 h-6 rounded-md bg-[var(--card)] text-center text-xs font-semibold text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink)]"
                            />
                          </div>

                          {/* Saving Throw & Associated Skills */}
                          <div className="pt-1.5 border-t border-[var(--card)] space-y-1">
                            <div className="w-full py-0.5 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => toggleSavingThrowProficiency(key)}
                                className="min-w-0 flex-1 flex items-center gap-2 text-left group cursor-pointer"
                              >
                                <span
                                  className={`w-3 h-3 rounded-full transition-colors ${
                                    isSaveProficient
                                      ? 'bg-[var(--sage)] ring-2 ring-[color-mix(in_srgb,var(--sage)_30%,transparent)]'
                                      : 'bg-[var(--stone)] group-hover:bg-[var(--muted)]'
                                  }`}
                                />
                                <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-semibold group-hover:text-[var(--ink)] transition-colors">
                                  Спасбросок
                                </span>
                              </button>
                              <EditableSignedInput
                                min={-99}
                                max={99}
                                value={saveMod}
                                onChange={(next) => setSaveBonus(key, next - saveBase)}
                                className={`w-11 bg-transparent text-right font-serif text-base font-semibold tabular-nums leading-none outline-none rounded-md cursor-text hover:bg-[var(--card)] focus:bg-[var(--card)] ${
                                  saveHindrance.length > 0
                                    ? 'text-[var(--clay)]'
                                    : isSaveProficient
                                      ? 'text-[var(--sage)]'
                                      : 'text-[var(--ink)]'
                                }`}
                                title={
                                  saveHindrance.length > 0
                                    ? `${saveAutoFail ? 'Автопровал' : 'Помеха'}: ${conditionNames(saveHindrance)}`
                                    : saveBonus === 0
                                      ? 'Нажмите, чтобы изменить модификатор спасброска'
                                      : `Дополнительно ${formatSigned(saveBonus)}. Нажмите, чтобы изменить`
                                }
                                ariaLabel={`Модификатор спасброска ${ABILITY_META[key].full}`}
                              />
                            </div>

                            {abilitySkills.length > 0 && (
                              <div className="pt-1 border-t border-[color-mix(in_srgb,var(--card)_70%,transparent)] space-y-0.5">
                                {abilitySkills.map((skill) => {
                                  const rank = (proficiencies.skills?.[skill.key] ??
                                    0) as ProficiencyRank;
                                  const globalSkillBonus = proficiencies.globalSkillBonus ?? 0;
                                  const individualBonus =
                                    proficiencies.skillBonuses?.[skill.key] ?? 0;
                                  const totalMod = calculateD20TestModifier({
                                    abilityScore: score,
                                    level,
                                    proficiencyRank: rank,
                                    exhaustionLevel: exhaustion,
                                    flatBonus: individualBonus + globalSkillBonus,
                                  });
                                  const rulesBase = totalMod - individualBonus - globalSkillBonus;

                                  return (
                                    <div
                                      key={skill.key}
                                      className="w-full py-0.5 flex items-center justify-between gap-2"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => cycleSkillProficiency(skill.key)}
                                        className="min-w-0 flex-1 flex items-center gap-2 text-left group cursor-pointer"
                                      >
                                        <SkillDot rank={rank} />
                                        <span className="text-[11px] uppercase tracking-wider text-[var(--ink)] font-medium truncate">
                                          {skill.label}
                                        </span>
                                      </button>

                                      <EditableSignedInput
                                        min={-99}
                                        max={99}
                                        value={totalMod}
                                        onChange={(next) =>
                                          setSkillBonus(skill.key, next - rulesBase - globalSkillBonus)
                                        }
                                        title={
                                          individualBonus === 0 && globalSkillBonus === 0
                                            ? 'Нажмите, чтобы изменить модификатор навыка'
                                            : `Дополнительно ${formatSigned(individualBonus + globalSkillBonus)}. Нажмите, чтобы изменить`
                                        }
                                        ariaLabel={`Модификатор навыка ${skill.label}`}
                                        className={`w-11 bg-transparent text-right font-serif text-base font-semibold tabular-nums leading-none outline-none rounded-md cursor-text hover:bg-[var(--card)] focus:bg-[var(--card)] ${
                                          checkHindrance.length > 0
                                            ? 'text-[var(--clay)]'
                                            : rank === 2
                                              ? 'text-[var(--ochre)]'
                                              : rank === 1
                                                ? 'text-[var(--sage)]'
                                                : 'text-[var(--ink)]'
                                        }`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>

            {/* Spell Slots Table Card (1st to 9th Circle) */}
            <section className="bg-[var(--card)] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                  ЯЧЕЙКИ ЗАКЛИНАНИЙ
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Убрать последний круг"
                    title="Убрать последний круг"
                    disabled={spells.visibleSlotLevels <= 1}
                    onClick={() => setVisibleSpellSlotLevels(spells.visibleSlotLevels - 1)}
                    className="relative w-6 h-6 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-[var(--paper)] disabled:hover:text-[var(--ink)]"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute left-1/2 top-1/2 h-[1.5px] w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Добавить следующий круг"
                    title="Добавить следующий круг"
                    disabled={spells.visibleSlotLevels >= 9}
                    onClick={() => setVisibleSpellSlotLevels(spells.visibleSlotLevels + 1)}
                    className="relative w-6 h-6 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-[var(--paper)] disabled:hover:text-[var(--ink)]"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute left-1/2 top-1/2 h-[1.5px] w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute left-1/2 top-1/2 h-2.5 w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => resetAllSpellSlots()}
                    className="rounded-full bg-[var(--paper)] hover:bg-[var(--ink)] text-[var(--muted)] hover:text-[var(--paper)] px-2.5 py-1 text-[9px] uppercase tracking-wider font-semibold transition-colors cursor-pointer"
                  >
                    Восстановить все
                  </button>
                </div>
              </div>

              <div className="bg-[var(--paper)] rounded-xl p-3">
                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-[var(--card)] text-[9px] uppercase tracking-[0.12em] text-[var(--muted)] font-semibold">
                  <div className="col-span-3">Круг</div>
                  <div className="col-span-3 text-center">Всего в день</div>
                  <div className="col-span-6">Ячейки</div>
                </div>

                <div className="divide-y divide-[color-mix(in_srgb,var(--card)_70%,transparent)]">
                  {Array.from({ length: spells.visibleSlotLevels }, (_, index) => index + 1).map(
                    (slotLvl) => {
                    const slotKey = String(slotLvl);
                    const slotData = spells.slots?.[slotKey] ?? { current: 0, max: 0 };
                    const maxSlots = slotData.max;
                    const spentSlots = Math.min(maxSlots, slotData.current);

                    return (
                      <div
                        key={slotLvl}
                        className="grid grid-cols-12 gap-2 py-1.5 items-center"
                      >
                        <div className="col-span-3 font-serif text-base font-semibold text-[var(--ink)]">
                          {slotLvl} круг
                        </div>

                        <div className="col-span-3 flex justify-center">
                          <EditableNumberInput
                            min={0}
                            max={12}
                            value={maxSlots}
                            onChange={(val) =>
                              updateSpellSlot(slotLvl, { max: val })
                            }
                            ariaLabel={`Максимум ячеек ${slotLvl} круга`}
                            className="w-10 h-6 rounded-md bg-[var(--card)] text-center text-xs font-semibold text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink)]"
                          />
                        </div>

                        <div className="col-span-6 flex flex-wrap items-center gap-1.5">
                          {maxSlots > 0 ? (
                            Array.from({ length: maxSlots }).map((_, idx) => {
                              const isSpent = idx < spentSlots;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    const nextSpent =
                                      isSpent && idx + 1 === spentSlots
                                        ? idx
                                        : idx + 1;
                                    updateSpellSlot(slotLvl, {
                                      current: nextSpent,
                                    });
                                  }}
                                  title={
                                    isSpent
                                      ? 'Ячейка потрачена (нажмите, чтобы восстановить)'
                                      : 'Ячейка доступна (нажмите, чтобы потратить)'
                                  }
                                  className={`w-3.5 h-3.5 rounded-full transition-all cursor-pointer ${
                                    isSpent
                                      ? 'bg-[var(--ink)]'
                                      : 'bg-[var(--card)] border border-[color-mix(in_srgb,var(--muted)_50%,transparent)] hover:border-[var(--ink)]'
                                  }`}
                                />
                              );
                            })
                          ) : (
                            <span className="text-[10px] text-[color-mix(in_srgb,var(--muted)_60%,transparent)]">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* RIGHT COLUMN (6 cols): Combat Parameters                          */}
          {/* ----------------------------------------------------------------- */}
          <div className="flex flex-col gap-4">
            <section className="bg-[var(--card)] rounded-2xl p-4 flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                  БОЕВЫЕ ПАРАМЕТРЫ
                </h2>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => takeShortRest()}
                    title="Короткий отдых (5.5e): ячейки пакта, спасброски от смерти и состояния сбрасываются"
                    className="rounded-full bg-[var(--paper)] hover:bg-[var(--ink)] text-[var(--ink)] hover:text-[var(--paper)] px-3 py-1 text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sun className="w-3 h-3 text-[var(--ochre)]" />
                    <span>Короткий отдых</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => takeLongRest()}
                    title="Долгий отдых (5.5e): хиты и ячейки полностью, кости хитов наполовину (все — за два отдыха), истощение −1, спасброски от смерти и состояния сбрасываются"
                    className="rounded-full bg-[var(--ink)] text-[var(--paper)] hover:bg-[color-mix(in_srgb,var(--ink)_85%,transparent)] px-3 py-1 text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Moon className="w-3 h-3 text-[var(--ochre)]" />
                    <span>Долгий отдых</span>
                  </button>
                </div>
              </div>

              {/* Hit Points Featured Surface */}
              <div className="bg-[var(--paper)] rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    ХИТЫ (HP)
                  </span>
                  {conditionEffects.resistAllDamage.length > 0 && (
                    <span
                      className="text-[9px] uppercase tracking-wider text-[var(--clay)] font-semibold"
                      title={`Сопротивление всему урону: ${conditionNames(conditionEffects.resistAllDamage)}`}
                    >
                      Сопр. всему
                    </span>
                  )}
                  <div className="flex items-center gap-2 font-serif italic text-xs">
                    <span className="text-[var(--sage)]">{hpPercent}% здоровья</span>
                    {safeTempHp > 0 && (
                      <span className="text-[var(--sea)]">+{safeTempHp} врем.</span>
                    )}
                  </div>
                </div>

                {/* Progress Bar for HP + Temporary HP (Blue segment scales the bar) */}
                <div className="w-full h-2 rounded-full bg-[var(--card)] overflow-hidden flex">
                  <div
                    className={`h-full transition-all duration-300 ${
                      hpPercent <= 25 ? 'bg-[var(--clay)]' : 'bg-[var(--sage)]'
                    }`}
                    style={{ width: `${currentHpWidthPercent}%` }}
                  />
                  {safeTempHp > 0 && (
                    <div
                      className="h-full bg-[var(--sea)] transition-all duration-300"
                      style={{ width: `${tempHpWidthPercent}%` }}
                      title={`Временные хиты: +${safeTempHp}`}
                    />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-[var(--card)] rounded-xl p-2 text-center">
                    <span className="block text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
                      Текущие
                    </span>
                    <EditableNumberInput
                      min={0}
                      max={9999}
                      value={hp.current}
                      onChange={(val) => updateHpAndCombat({ current: val })}
                      ariaLabel="Текущие хиты"
                      className="w-full bg-transparent text-center font-serif text-2xl text-[var(--ink)] outline-none"
                    />
                  </div>

                  <div className="bg-[var(--card)] rounded-xl p-2 text-center">
                    <span className="block text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
                      Максимум
                    </span>
                    <EditableNumberInput
                      min={1}
                      max={9999}
                      value={hp.max}
                      onChange={(val) => updateHpAndCombat({ max: val })}
                      ariaLabel="Максимальные хиты"
                      className="w-full bg-transparent text-center font-serif text-2xl text-[var(--ink)] outline-none"
                    />
                  </div>

                  <div className="bg-[var(--card)] rounded-xl p-2 text-center">
                    <span className="block text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
                      Временные
                    </span>
                    <EditableNumberInput
                      min={0}
                      max={9999}
                      value={hp.temp}
                      onChange={(val) => updateHpAndCombat({ temp: val })}
                      ariaLabel="Временные хиты"
                      className="w-full bg-transparent text-center font-serif text-2xl text-[var(--sea)] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--paper)] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    ИНИЦИАТИВА
                  </span>
                  <div className="flex items-end justify-between mt-2">
                    <span
                      className={`font-serif text-3xl leading-none ${
                        initiativeHindrance.length > 0 ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
                      }`}
                      title={
                        initiativeHindrance.length > 0
                          ? `Помеха на инициативу: ${conditionNames(initiativeHindrance)}`
                          : 'Проверка Ловкости: модификатор Ловкости и штраф истощения (−2 за уровень)'
                      }
                    >
                      {formatSigned(initiativeMod)}
                    </span>
                    <span className="font-serif italic text-xs text-[var(--muted)]">Ловкость</span>
                  </div>
                </div>

                <div className="bg-[var(--paper)] rounded-xl p-3 flex flex-col justify-between min-h-[82px] gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                      КОСТИ ХИТОВ
                    </span>
                    <select
                      aria-label="Кость хитов"
                      value={hitDieType}
                      onChange={(e) =>
                        updateHpAndCombat({
                          hit_die_type: e.target.value as 'd6' | 'd8' | 'd10' | 'd12',
                        })
                      }
                      className="bg-[var(--card)] rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer"
                    >
                      <option value="d6">d6</option>
                      <option value="d8">d8</option>
                      <option value="d10">d10</option>
                      <option value="d12">d12</option>
                    </select>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="flex items-end gap-1">
                      <EditableNumberInput
                        min={0}
                        max={hitDiceMax}
                        value={hitDiceCurrent}
                        onChange={(val) => updateHpAndCombat({ hit_dice_current: val })}
                        ariaLabel="Оставшиеся кости хитов"
                        title="Сколько костей хитов ещё не потрачено"
                        className="w-10 bg-transparent font-serif text-3xl leading-none text-[var(--ink)] outline-none"
                      />
                      <span className="font-serif text-sm text-[var(--muted)] mb-0.5">/ {hitDiceMax}</span>
                    </div>
                    <span
                      className="font-serif italic text-[10px] text-[var(--muted)] text-right leading-tight max-w-[7.5rem]"
                      title="Один долгий отдых возвращает половину костей (округление вверх). Второй долгий отдых возвращает остальные."
                    >
                      1 отдых — половина, 2 — все
                    </span>
                  </div>
                </div>
              </div>

              {/* 2x3 Compact Bento Grid: AC, Speed, Prof Bonus, Passive Wisdom, Spell Save DC, Spell Attack */}
              <div className="grid grid-cols-2 gap-3">
                {/* Armor Class */}
                <div className="bg-[var(--paper)] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    КЛАСС ДОСПЕХА
                  </span>
                  <div className="flex items-end justify-between mt-2">
                    <EditableNumberInput
                      min={0}
                      max={50}
                      value={armorClass}
                      onChange={(val) => updateHpAndCombat({ armor_class: val })}
                      ariaLabel="Класс доспеха"
                      className={`w-14 bg-transparent font-serif text-3xl leading-none outline-none ${
                        defenseHindrance.length > 0 ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
                      }`}
                      title={
                        defenseHindrance.length > 0
                          ? `Атаки по вам с преимуществом: ${conditionNames(defenseHindrance)}${
                              conditionEffects.attackedNearbyAdvantage.length > 0
                                ? '. Ничком: преимущество только вблизи, издалека — помеха'
                                : ''
                            }`
                          : undefined
                      }
                    />
                    <span className="font-serif italic text-xs text-[var(--muted)]">КД</span>
                  </div>
                </div>

                {/* Speed */}
                <div className="bg-[var(--paper)] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    СКОРОСТЬ
                  </span>
                  <div className="flex items-end justify-between mt-2">
                    <span
                      className={`font-serif text-3xl leading-none ${
                        speedAltered ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
                      }`}
                      title={
                        conditionEffects.speedZero.length > 0
                          ? `Скорость 0: ${conditionNames(conditionEffects.speedZero)}`
                          : conditionEffects.speedHalved.length > 0
                            ? `Скорость вдвое меньше, ползком: ${conditionNames(conditionEffects.speedHalved)}`
                            : undefined
                      }
                    >
                      {shownSpeed}
                      <span className="text-sm font-sans text-[var(--muted)] ml-1">фт</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
                        База
                      </span>
                      <EditableNumberInput
                        min={0}
                        max={300}
                        step={5}
                        value={baseSpeedFeet}
                        onChange={(val) => updateHpAndCombat({ speed: val })}
                        ariaLabel="Базовая скорость"
                        className="w-10 bg-[var(--card)] rounded px-1 py-0.5 text-center text-xs font-semibold text-[var(--ink)] outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Passive Wisdom (Perception) */}
                <div className="bg-[var(--paper)] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    ПАССИВНАЯ МУДРОСТЬ
                  </span>
                  <div className="flex items-end justify-between mt-2">
                    <span
                      className={`font-serif text-3xl leading-none ${
                        checkHindrance.length > 0 ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
                      }`}
                      title={
                        checkHindrance.length > 0
                          ? `Помеха на проверки: пассивное восприятие −5 (${conditionNames(checkHindrance)})`
                          : undefined
                      }
                    >
                      {passiveShown}
                    </span>
                    <span className="font-serif italic text-xs text-[var(--muted)]">
                      Восприятие
                    </span>
                  </div>
                </div>

                {/* Spell Save DC & Spellcasting Ability */}
                <div className="bg-[var(--paper)] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                      СЛ ЗАКЛИНАНИЙ
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[var(--mist)]" />
                  </div>

                  <div className="flex items-end justify-between mt-2">
                    <span className="font-serif text-3xl leading-none text-[var(--ink)]">
                      {spellSaveDc !== null ? spellSaveDc : '—'}
                    </span>

                    <select
                      aria-label="Характеристика заклинателя"
                      value={spellcastingAbility ?? 'none'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSpellcastingAbility(
                          val === 'none' ? null : (val as AbilityKey)
                        );
                      }}
                      className="bg-[var(--card)] rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer"
                    >
                      <option value="none">Нет</option>
                      <option value="int">ИНТ</option>
                      <option value="wis">МДР</option>
                      <option value="cha">ХАР</option>
                    </select>
                  </div>
                </div>

                <div className="bg-[var(--paper)] rounded-xl p-3 flex flex-col justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    СПАСБРОСКИ ОТ СМЕРТИ
                  </span>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--sage)] font-semibold">
                        Успехи
                      </span>
                      <div className="flex items-center gap-1.5">
                        {[0, 1, 2].map((idx) => {
                          const filled = idx < deathSaveSuccesses;
                          return (
                            <button
                              key={idx}
                              type="button"
                              aria-label={`Успех спасброска от смерти ${idx + 1}`}
                              onClick={() =>
                                updateHpAndCombat({
                                  death_save_successes:
                                    filled && idx + 1 === deathSaveSuccesses ? idx : idx + 1,
                                })
                              }
                              className={`w-4 h-4 rounded-full cursor-pointer transition-all ${
                                filled
                                  ? 'bg-[var(--sage)]'
                                  : 'bg-[var(--card)] border border-[color-mix(in_srgb,var(--muted)_50%,transparent)] hover:border-[var(--sage)]'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--clay)] font-semibold">
                        Провалы
                      </span>
                      <div className="flex items-center gap-1.5">
                        {[0, 1, 2].map((idx) => {
                          const filled = idx < deathSaveFailures;
                          return (
                            <button
                              key={idx}
                              type="button"
                              aria-label={`Провал спасброска от смерти ${idx + 1}`}
                              onClick={() =>
                                updateHpAndCombat({
                                  death_save_failures:
                                    filled && idx + 1 === deathSaveFailures ? idx : idx + 1,
                                })
                              }
                              className={`w-4 h-4 rounded-full cursor-pointer transition-all ${
                                filled
                                  ? 'bg-[var(--clay)]'
                                  : 'bg-[var(--card)] border border-[color-mix(in_srgb,var(--muted)_50%,transparent)] hover:border-[var(--clay)]'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Spell Attack Bonus (+ к попаданию заклинанием) */}
                <div className="bg-[var(--paper)] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                      АТАКА ЗАКЛИНАНИЕМ
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[var(--mist)]" />
                  </div>

                  <div className="flex items-end justify-between mt-2">
                    <span
                      className={`font-serif text-3xl leading-none ${
                        attackHindrance.length > 0 ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
                      }`}
                      title={
                        attackHindrance.length > 0
                          ? `${
                              conditionEffects.incapacitated.length > 0
                                ? 'Нельзя атаковать'
                                : 'Помеха на атаку'
                            }: ${conditionNames(attackHindrance)}`
                          : undefined
                      }
                    >
                      {spellAttackBonus !== null
                        ? formatSigned(spellAttackBonus)
                        : '—'}
                    </span>
                    <span className="font-serif italic text-xs text-[var(--muted)]">
                      попадание
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-[var(--card)] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                  Атаки оружием
                </h2>
                <button
                  type="button"
                  aria-label="Добавить оружие"
                  title="Добавить оружие"
                  disabled={weaponAttacks.length >= 12}
                  onClick={() =>
                    setWeaponAttacks([
                      ...weaponAttacks,
                      {
                        id: crypto.randomUUID(),
                        name: '',
                        proficient: false,
                        ability: 'str',
                        damage: '',
                        magicBonus: 0,
                        description: '',
                      },
                    ])
                  }
                  className="w-6 h-6 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-sm font-bold leading-none flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                  +
                </button>
              </div>

              {weaponAttacks.map((attack) => {
                const hitBonus = calculateWeaponAttackBonus({
                  abilityScore: stats[attack.ability],
                  level,
                  proficient: attack.proficient,
                  exhaustionLevel: exhaustion,
                  magicBonus: attack.magicBonus,
                });
                const damageBonus = calculateWeaponDamageBonus(
                  stats[attack.ability],
                  attack.magicBonus
                );
                const damageDice = attack.damage.trim();
                const damageLine = damageDice
                  ? `${damageDice} ${formatSigned(damageBonus)}`
                  : formatSigned(damageBonus);
                const patchAttack = (patch: Partial<typeof attack>) =>
                  setWeaponAttacks(
                    weaponAttacks.map((item) =>
                      item.id === attack.id ? { ...item, ...patch } : item
                    )
                  );

                const description = attack.description.trim();

                const attackBlocked = attackHindrance.length > 0;

                return (
                  <div
                    key={attack.id}
                    className={`bg-[var(--paper)] rounded-xl px-2.5 py-2 space-y-1.5 ${
                      attackBlocked ? 'ring-1 ring-[var(--clay)]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="relative shrink-0"
                        ref={weaponMenuId === attack.id ? weaponMenuRef : undefined}
                      >
                        <button
                          type="button"
                          aria-label="Магия и описание оружия"
                          aria-expanded={weaponMenuId === attack.id}
                          onClick={() =>
                            setWeaponMenuId((current) =>
                              current === attack.id ? null : attack.id
                            )
                          }
                          className={`w-6 h-6 rounded-full inline-flex items-center justify-center cursor-pointer ${
                            weaponMenuId === attack.id
                              ? 'bg-[var(--ink)] text-[var(--paper)]'
                              : 'text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]'
                          }`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {weaponMenuId === attack.id && (
                          <div className="absolute left-0 top-full mt-1.5 z-50 w-56 rounded-2xl bg-[var(--paper)] p-2.5 shadow-lg ring-1 ring-[var(--stone)] space-y-2">
                            <label className="block space-y-1">
                              <span className="block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                                Магия
                              </span>
                              <select
                                aria-label="Магический бонус оружия"
                                value={attack.magicBonus}
                                onChange={(e) =>
                                  patchAttack({
                                    magicBonus: Number(e.target.value) as 0 | 1 | 2 | 3,
                                  })
                                }
                                className="w-full bg-[var(--card)] rounded-full px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer"
                              >
                                <option value={0}>Нет</option>
                                <option value={1}>+1</option>
                                <option value={2}>+2</option>
                                <option value={3}>+3</option>
                              </select>
                            </label>
                            <label className="block space-y-1">
                              <span className="block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                                Описание
                              </span>
                              <textarea
                                value={attack.description}
                                maxLength={400}
                                rows={3}
                                placeholder="Дополнительный эффект"
                                aria-label="Описание оружия"
                                onChange={(e) => patchAttack({ description: e.target.value })}
                                className="w-full resize-none rounded-lg bg-[var(--card)] px-2 py-1.5 text-xs leading-snug text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        value={attack.name}
                        maxLength={80}
                        placeholder="Название"
                        aria-label="Название оружия"
                        onChange={(e) => patchAttack({ name: e.target.value })}
                        className={`min-w-0 flex-1 bg-transparent font-serif text-base leading-none outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_50%,transparent)] ${
                          attackBlocked ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
                        }`}
                      />
                      <button
                        type="button"
                        aria-label={`Удалить оружие ${attack.name || ''}`.trim()}
                        onClick={() =>
                          setWeaponAttacks(weaponAttacks.filter((item) => item.id !== attack.id))
                        }
                        className="w-6 h-6 rounded-full text-[var(--muted)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-sm leading-none cursor-pointer"
                      >
                        ×
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        aria-pressed={attack.proficient}
                        onClick={() => patchAttack({ proficient: !attack.proficient })}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            attack.proficient
                              ? 'bg-[var(--sage)] ring-2 ring-[color-mix(in_srgb,var(--sage)_30%,transparent)]'
                              : 'bg-[var(--stone)]'
                          }`}
                        />
                        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-semibold">
                          Умение
                        </span>
                      </button>

                      <select
                        aria-label="Характеристика атаки"
                        value={attack.ability}
                        onChange={(e) =>
                          patchAttack({ ability: e.target.value as AbilityKey })
                        }
                        className="bg-[var(--card)] rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer"
                      >
                        {ABILITY_ORDER.map((key) => (
                          <option key={key} value={key}>
                            {ABILITY_META[key].short}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={attack.damage}
                        maxLength={40}
                        placeholder="1к6"
                        aria-label="Кости урона оружия"
                        onChange={(e) => patchAttack({ damage: e.target.value })}
                        className="w-14 bg-[var(--card)] rounded-md px-1.5 py-0.5 text-center text-xs font-semibold text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
                      />

                      {attack.magicBonus > 0 && (
                        <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--ochre)]">
                          {formatSigned(attack.magicBonus)}
                        </span>
                      )}
                    </div>

                    {description !== '' && (
                      <p className="text-[11px] leading-snug text-[var(--muted)]">{description}</p>
                    )}

                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <span
                          className={`block text-[9px] uppercase tracking-[0.15em] font-medium ${
                            attackBlocked ? 'text-[var(--clay)]' : 'text-[var(--muted)]'
                          }`}
                        >
                          {conditionEffects.incapacitated.length > 0 ? 'Нельзя атаковать' : 'Попадание'}
                        </span>
                        <span
                          className={`font-serif text-2xl leading-none ${
                            attackBlocked ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
                          }`}
                          title={
                            attackBlocked
                              ? `${
                                  conditionEffects.incapacitated.length > 0
                                    ? 'Нельзя атаковать'
                                    : 'Помеха на атаку'
                                }: ${conditionNames(attackHindrance)}`
                              : 'Модификатор характеристики, бонус мастерства при умении, магический бонус и штраф истощения'
                          }
                        >
                          {formatSigned(hitBonus)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                          Урон
                        </span>
                        <span
                          className="font-serif text-xl leading-none text-[var(--ink)]"
                          title="Кости урона, модификатор характеристики и магический бонус"
                        >
                          {damageLine}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="bg-[var(--card)] rounded-2xl p-4 space-y-3">
              <h2 className="pl-2 text-[10px] uppercase tracking-[0.15em] font-medium leading-none text-[var(--muted)]">
                СОСТОЯНИЯ
              </h2>
                  <div className="relative">
                    <select
                      aria-label="Добавить состояние"
                      value=""
                      onChange={(e) => {
                        const key = e.target.value;
                        if (key === '' || activeConditions.includes(key)) return;
                        updateHpAndCombat({ conditions: [...activeConditions, key] });
                      }}
                      className="w-full appearance-none rounded-full border border-[var(--muted)] bg-transparent pl-3 pr-7 py-1.5 text-left text-[10px] uppercase tracking-[0.12em] font-medium leading-none text-[var(--ink)] outline-none cursor-pointer"
                    >
                      {availableConditions.length > 0 ? (
                        <option value="" hidden />
                      ) : (
                        <option value="">Все состояния</option>
                      )}
                      {availableConditions.map((condition) => (
                        <option key={condition.key} value={condition.key}>
                          {condition.label}
                        </option>
                      ))}
                    </select>
                    {availableConditions.length > 0 && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.12em] font-medium leading-none text-[var(--ink)]"
                      >
                        Добавить
                      </span>
                    )}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] leading-none text-[var(--muted)]"
                    >
                      ▾
                    </span>
                  </div>
                  {activeConditions.some((key) =>
                    DND55E_CONDITIONS.some((condition) => condition.key === key)
                  ) && (
                    <div className="flex flex-row flex-wrap gap-1.5">
                      {activeConditions
                        .filter((key) =>
                          DND55E_CONDITIONS.some((condition) => condition.key === key)
                        )
                        .map((key) => {
                        const label =
                          DND55E_CONDITIONS.find((condition) => condition.key === key)?.label ??
                          key;
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-label={`Снять состояние ${label}`}
                            onClick={() =>
                              updateHpAndCombat({
                                conditions: activeConditions.filter((item) => item !== key),
                              })
                            }
                            className="rounded-full border border-[var(--clay)] bg-transparent px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] font-medium leading-none text-[var(--clay)] cursor-pointer hover:bg-[var(--clay)] hover:text-[var(--paper)]"
                          >
                            {label} ×
                          </button>
                        );
                      })}
                    </div>
                  )}
            </section>

          </div>
        </main>
      </div>

      {/* ===================================================================== */}
      {/* FLOATING BOTTOM INK DOCK                                              */}
      {/* ===================================================================== */}
      <nav
        aria-label="Режимы листа персонажа"
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40"
      >
        <div className="bg-[var(--ink)] text-[var(--paper)] rounded-full px-2.5 py-1.5 shadow-lg flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveDockTab('sheet')}
            className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeDockTab === 'sheet'
                ? 'bg-[var(--paper)] text-[var(--ink)]'
                : 'text-[color-mix(in_srgb,var(--paper)_75%,transparent)] hover:text-[var(--paper)]'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>Основной лист</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDockTab('inventory')}
            className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeDockTab === 'inventory'
                ? 'bg-[var(--paper)] text-[var(--ink)]'
                : 'text-[color-mix(in_srgb,var(--paper)_75%,transparent)] hover:text-[var(--paper)]'
            }`}
          >
            <Feather className="w-3.5 h-3.5 text-[var(--ochre)]" />
            <span>Инвентарь и Заклинания</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDockTab('compendium')}
            className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeDockTab === 'compendium'
                ? 'bg-[var(--paper)] text-[var(--ink)]'
                : 'text-[color-mix(in_srgb,var(--paper)_75%,transparent)] hover:text-[var(--paper)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--sage)]" />
            <span className="hidden sm:inline">Справочник Obsidian &amp; dnd.su</span>
            <span className="sm:hidden">Справочник</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
