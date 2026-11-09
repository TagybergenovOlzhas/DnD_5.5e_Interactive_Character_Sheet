import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Feather,
  Moon,
  Plus,
  ScrollText,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  calculateAbilityModifier,
  calculateD20TestModifier,
  calculateEffectiveSpeed,
  calculatePassivePerception,
  calculateProficiencyBonus,
  calculateSpellAttackBonus,
  calculateSpellSaveDC,
} from '@shared/rulesEngine';
import {
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
        className="w-3 h-3 rounded-full bg-[#D4A359] ring-2 ring-[#D4A359]/30 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
      >
        <span className="w-1 h-1 rounded-full bg-[#F8F5EE]" />
      </span>
    );
  }

  if (rank === 1) {
    return (
      <span
        title="Владение (+БМ)"
        className="w-3 h-3 rounded-full bg-[#7E998A] flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
      />
    );
  }

  return (
    <span
      title="Нет владения"
      className="w-3 h-3 rounded-full bg-[#D6D1C7] group-hover:bg-[#8C857B]/50 shrink-0 transition-colors"
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
    updateHpAndCombat,
    setSpellcastingAbility,
    updateSpellSlot,
    resetAllSpellSlots,
    takeShortRest,
    takeLongRest,
  } = useCharacterStore();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeDockTab, setActiveDockTab] = useState<DockTab>('sheet');

  useEffect(() => {
    void fetchCharacters();
  }, [fetchCharacters]);

  const activeCharacter = characters.find((c) => c.id === activeCharacterId) ?? null;

  useEffect(() => {
    setConfirmDelete(false);
  }, [activeCharacterId]);

  if (isLoading || !activeCharacter) {
    return (
      <div className="min-h-screen bg-[#F8F5EE] text-[#1C222D] flex items-center justify-center p-8">
        <div className="font-serif italic text-xl text-[#8C857B]">
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

  return (
    <div className="min-h-screen bg-[#F8F5EE] text-[#1C222D] pb-16">
      <div className="max-w-[1320px] mx-auto px-5 py-3.5 space-y-3.5">
        {/* =================================================================== */}
        {/* EDITORIAL HEADER (Compact for 14" laptop screen)                    */}
        {/* =================================================================== */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          {/* Left: Italic Species / Class / Subclass + Large Serif Character Name */}
          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="flex flex-row flex-wrap items-baseline gap-x-3 gap-y-0.5 font-serif italic text-base md:text-lg text-[#8C857B]">
              <AutoWidthTextInput
                value={species}
                onChange={(val) => updateIdentity({ species: val })}
                placeholder="Вид"
                ariaLabel="Вид персонажа"
                className="font-serif italic text-base md:text-lg text-[#8C857B] focus:text-[#1C222D] transition-colors placeholder:text-[#8C857B]/60"
              />
              <AutoWidthTextInput
                value={class_name}
                onChange={(val) => updateIdentity({ class_name: val })}
                placeholder="Класс"
                ariaLabel="Класс персонажа"
                className="font-serif italic text-base md:text-lg text-[#8C857B] focus:text-[#1C222D] transition-colors placeholder:text-[#8C857B]/60"
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
                className="font-serif italic text-base md:text-lg text-[#8C857B] focus:text-[#1C222D] transition-colors placeholder:text-[#8C857B]/60"
              />
            </div>

            <div className="relative inline-block w-full max-w-2xl">
              <input
                type="text"
                value={name}
                onChange={(e) => updateIdentity({ name: e.target.value })}
                placeholder="Имя Персонажа"
                aria-label="Имя персонажа"
                className="w-full bg-transparent border-none outline-none font-serif font-normal tracking-tight text-3xl md:text-4xl leading-tight text-[#1C222D] placeholder:text-[#8C857B]/40"
              />
            </div>
          </div>

          {/* Right: Tactile Pills for Character Switcher, New Character, Level, Delete */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-end">
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium mr-1">
              {isSaving ? 'Сохранение...' : 'Сохранено'}
            </span>

            {/* Character Selector Pill */}
            <div className="rounded-full bg-[#EFECE6] px-3.5 py-1.5 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                Герой
              </span>
              <select
                aria-label="Выбор персонажа"
                value={activeCharacter.id}
                onChange={(e) => selectCharacter(e.target.value)}
                className="bg-transparent text-xs uppercase tracking-wider font-semibold text-[#1C222D] outline-none cursor-pointer pr-1"
              >
                {characters.map((char) => (
                  <option
                    key={char.id}
                    value={char.id}
                    className="bg-[#F8F5EE] text-[#1C222D]"
                  >
                    {char.name} ({char.class_name} {char.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Level Selector Pill */}
            <div className="rounded-full bg-[#EFECE6] px-3 py-1 flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                Ур.
              </span>
              <button
                type="button"
                onClick={() => setLevel(level - 1)}
                className="w-5 h-5 rounded-full bg-[#F8F5EE] text-[#1C222D] hover:bg-[#1C222D] hover:text-[#F8F5EE] text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
              >
                −
              </button>
              <EditableNumberInput
                min={1}
                max={20}
                value={level}
                onChange={(val) => setLevel(val)}
                ariaLabel="Уровень персонажа"
                className="w-6 bg-transparent text-center font-serif text-base font-semibold text-[#1C222D] outline-none"
              />
              <button
                type="button"
                onClick={() => setLevel(level + 1)}
                className="w-5 h-5 rounded-full bg-[#F8F5EE] text-[#1C222D] hover:bg-[#1C222D] hover:text-[#F8F5EE] text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Create New Character Ink Pill Button */}
            <button
              type="button"
              onClick={() => void createCharacter()}
              className="rounded-full bg-[#1C222D] text-[#F8F5EE] hover:bg-[#1C222D]/90 px-3.5 py-1.5 text-xs uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
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
                className="rounded-full bg-[#EFECE6] hover:bg-[#C86D5B]/20 text-[#8C857B] hover:text-[#C86D5B] px-3 py-1.5 text-xs uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="rounded-full bg-[#C86D5B] text-[#F8F5EE] px-3.5 py-1 flex items-center gap-2 text-xs uppercase tracking-wider">
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
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* ----------------------------------------------------------------- */}
          {/* LEFT AREA (6 cols — half width): Compact 5.5e Abilities & Skills  */}
          {/* ----------------------------------------------------------------- */}
          <div className="lg:col-span-6">
            <section className="bg-[#EFECE6] rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                  ХАРАКТЕРИСТИКИ, СПАСБРОСКИ И НАВЫКИ
                </h2>

                {/* Legend Dots */}
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[#8C857B]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#7E998A]" />
                    <span>Влад.</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#D4A359]" />
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
                      <div className="bg-[#F8F5EE] rounded-xl p-3 space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
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
                                    ? 'bg-[#1C222D] text-[#F8F5EE] py-2.5 -my-0.5'
                                    : 'bg-[#EFECE6] text-[#8C857B] hover:text-[#1C222D]'
                                }`}
                              >
                                <span
                                  className={`font-serif text-base leading-none ${
                                    isActive
                                      ? 'text-[#F8F5EE] font-semibold'
                                      : 'text-[#1C222D]'
                                  }`}
                                >
                                  {lvl}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
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
                      const saveMod = calculateD20TestModifier({
                        abilityScore: score,
                        level,
                        proficiencyRank: isSaveProficient ? 1 : 0,
                        exhaustionLevel: exhaustion,
                      });

                      const abilitySkills = DND55E_SKILLS.filter(
                        (skill) => skill.ability === key
                      );

                      return (
                        <div
                          key={key}
                          className="bg-[#F8F5EE] rounded-xl p-3 flex flex-col space-y-1.5"
                        >
                          {/* Compact Header: Ability Name + Modifier + Base Score Input */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-baseline gap-2.5">
                              <span className="font-serif font-semibold tracking-tight text-2xl leading-none text-[#1C222D]">
                                {formatSigned(checkMod)}
                              </span>
                              <span className="font-serif italic text-sm text-[#8C857B]">
                                {ABILITY_META[key].full}
                              </span>
                              {exhaustion > 0 && (
                                <span className="text-[10px] text-[#C86D5B] font-medium">
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
                              className="w-9 h-6 rounded-md bg-[#EFECE6] text-center text-xs font-semibold text-[#1C222D] outline-none focus:ring-1 focus:ring-[#1C222D]"
                            />
                          </div>

                          {/* Saving Throw & Associated Skills */}
                          <div className="pt-1.5 border-t border-[#EFECE6] space-y-1">
                            <button
                              type="button"
                              onClick={() => toggleSavingThrowProficiency(key)}
                              className="w-full py-0.5 flex items-center justify-between text-left group cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className={`w-3 h-3 rounded-full transition-colors ${
                                    isSaveProficient
                                      ? 'bg-[#7E998A] ring-2 ring-[#7E998A]/30'
                                      : 'bg-[#D6D1C7] group-hover:bg-[#8C857B]'
                                  }`}
                                />
                                <span className="text-[10px] uppercase tracking-[0.12em] text-[#8C857B] font-semibold group-hover:text-[#1C222D] transition-colors">
                                  Спасбросок
                                </span>
                              </span>
                              <span
                                className={`font-serif text-base font-semibold tabular-nums leading-none ${
                                  isSaveProficient ? 'text-[#7E998A]' : 'text-[#1C222D]'
                                }`}
                              >
                                {formatSigned(saveMod)}
                              </span>
                            </button>

                            {abilitySkills.length > 0 && (
                              <div className="pt-1 border-t border-[#EFECE6]/70 space-y-0.5">
                                {abilitySkills.map((skill) => {
                                  const rank = (proficiencies.skills?.[skill.key] ??
                                    0) as ProficiencyRank;
                                  const totalMod = calculateD20TestModifier({
                                    abilityScore: score,
                                    level,
                                    proficiencyRank: rank,
                                    exhaustionLevel: exhaustion,
                                  });

                                  return (
                                    <button
                                      key={skill.key}
                                      type="button"
                                      onClick={() => cycleSkillProficiency(skill.key)}
                                      className="w-full py-0.5 flex items-center justify-between gap-2 text-left group cursor-pointer"
                                    >
                                      <span className="flex items-center gap-2 min-w-0">
                                        <SkillDot rank={rank} />
                                        <span className="text-[11px] uppercase tracking-wider text-[#1C222D] font-medium truncate">
                                          {skill.label}
                                        </span>
                                      </span>

                                      <span
                                        className={`font-serif text-base font-semibold tabular-nums leading-none ${
                                          rank === 2
                                            ? 'text-[#D4A359]'
                                            : rank === 1
                                              ? 'text-[#7E998A]'
                                              : 'text-[#1C222D]'
                                        }`}
                                      >
                                        {formatSigned(totalMod)}
                                      </span>
                                    </button>
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
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* RIGHT COLUMN (6 cols): Combat Parameters                          */}
          {/* ----------------------------------------------------------------- */}
          <div className="lg:col-span-6 space-y-4">
            {/* Combat Parameters Card */}
            <section className="bg-[#EFECE6] rounded-2xl p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                  БОЕВЫЕ ПАРАМЕТРЫ
                </h2>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => takeShortRest()}
                    title="Короткий отдых (5.5e): восстанавливает ресурсы короткого отдыха и ячейки пакта"
                    className="rounded-full bg-[#F8F5EE] hover:bg-[#1C222D] text-[#1C222D] hover:text-[#F8F5EE] px-3 py-1 text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sun className="w-3 h-3 text-[#D4A359]" />
                    <span>Короткий отдых</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => takeLongRest()}
                    title="Долгий отдых (5.5e): полностью восстанавливает Хиты, все Ячейки заклинаний, Кости хитов и снижает Истощение на 1"
                    className="rounded-full bg-[#1C222D] text-[#F8F5EE] hover:bg-[#1C222D]/85 px-3 py-1 text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Moon className="w-3 h-3 text-[#D4A359]" />
                    <span>Долгий отдых</span>
                  </button>
                </div>
              </div>

              {/* Hit Points Featured Surface */}
              <div className="bg-[#F8F5EE] rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                    ХИТЫ (HP)
                  </span>
                  <div className="flex items-center gap-2 font-serif italic text-xs">
                    <span className="text-[#7E998A]">{hpPercent}% здоровья</span>
                    {safeTempHp > 0 && (
                      <span className="text-[#4A7C9B]">+{safeTempHp} врем.</span>
                    )}
                  </div>
                </div>

                {/* Progress Bar for HP + Temporary HP (Blue segment scales the bar) */}
                <div className="w-full h-2 rounded-full bg-[#EFECE6] overflow-hidden flex">
                  <div
                    className={`h-full transition-all duration-300 ${
                      hpPercent <= 25 ? 'bg-[#C86D5B]' : 'bg-[#7E998A]'
                    }`}
                    style={{ width: `${currentHpWidthPercent}%` }}
                  />
                  {safeTempHp > 0 && (
                    <div
                      className="h-full bg-[#4A7C9B] transition-all duration-300"
                      style={{ width: `${tempHpWidthPercent}%` }}
                      title={`Временные хиты: +${safeTempHp}`}
                    />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-[#EFECE6] rounded-xl p-2 text-center">
                    <span className="block text-[9px] uppercase tracking-[0.12em] text-[#8C857B]">
                      Текущие
                    </span>
                    <EditableNumberInput
                      min={0}
                      max={9999}
                      value={hp.current}
                      onChange={(val) => updateHpAndCombat({ current: val })}
                      ariaLabel="Текущие хиты"
                      className="w-full bg-transparent text-center font-serif text-2xl text-[#1C222D] outline-none"
                    />
                  </div>

                  <div className="bg-[#EFECE6] rounded-xl p-2 text-center">
                    <span className="block text-[9px] uppercase tracking-[0.12em] text-[#8C857B]">
                      Максимум
                    </span>
                    <EditableNumberInput
                      min={1}
                      max={9999}
                      value={hp.max}
                      onChange={(val) => updateHpAndCombat({ max: val })}
                      ariaLabel="Максимальные хиты"
                      className="w-full bg-transparent text-center font-serif text-2xl text-[#1C222D] outline-none"
                    />
                  </div>

                  <div className="bg-[#EFECE6] rounded-xl p-2 text-center">
                    <span className="block text-[9px] uppercase tracking-[0.12em] text-[#8C857B]">
                      Временные
                    </span>
                    <EditableNumberInput
                      min={0}
                      max={9999}
                      value={hp.temp}
                      onChange={(val) => updateHpAndCombat({ temp: val })}
                      ariaLabel="Временные хиты"
                      className="w-full bg-transparent text-center font-serif text-2xl text-[#4A7C9B] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2x3 Compact Bento Grid: AC, Speed, Prof Bonus, Passive Wisdom, Spell Save DC, Spell Attack */}
              <div className="grid grid-cols-2 gap-3">
                {/* Armor Class */}
                <div className="bg-[#F8F5EE] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                    КЛАСС ДОСПЕХА
                  </span>
                  <div className="flex items-end justify-between mt-2">
                    <EditableNumberInput
                      min={0}
                      max={50}
                      value={armorClass}
                      onChange={(val) => updateHpAndCombat({ armor_class: val })}
                      ariaLabel="Класс доспеха"
                      className="w-14 bg-transparent font-serif text-3xl leading-none text-[#1C222D] outline-none"
                    />
                    <span className="font-serif italic text-xs text-[#8C857B]">КД</span>
                  </div>
                </div>

                {/* Speed */}
                <div className="bg-[#F8F5EE] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                    СКОРОСТЬ
                  </span>
                  <div className="flex items-end justify-between mt-2">
                    <span className="font-serif text-3xl leading-none text-[#1C222D]">
                      {effectiveSpeed}
                      <span className="text-sm font-sans text-[#8C857B] ml-1">фт</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-wider text-[#8C857B]">
                        База
                      </span>
                      <EditableNumberInput
                        min={0}
                        max={300}
                        step={5}
                        value={baseSpeedFeet}
                        onChange={(val) => updateHpAndCombat({ speed: val })}
                        ariaLabel="Базовая скорость"
                        className="w-10 bg-[#EFECE6] rounded px-1 py-0.5 text-center text-xs font-semibold text-[#1C222D] outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Proficiency Bonus */}
                <div className="bg-[#F8F5EE] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                    БОНУС МАСТЕРСТВА
                  </span>
                  <div className="flex items-end justify-between mt-2">
                    <span className="font-serif text-3xl leading-none text-[#1C222D]">
                      {formatSigned(profBonus)}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#D4A359]" />
                  </div>
                </div>

                {/* Passive Wisdom (Perception) */}
                <div className="bg-[#F8F5EE] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                    ПАССИВНАЯ МУДРОСТЬ
                  </span>
                  <div className="flex items-end justify-between mt-2">
                    <span className="font-serif text-3xl leading-none text-[#1C222D]">
                      {passivePerception}
                    </span>
                    <span className="font-serif italic text-xs text-[#8C857B]">
                      Восприятие
                    </span>
                  </div>
                </div>

                {/* Spell Save DC & Spellcasting Ability */}
                <div className="bg-[#F8F5EE] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                      СЛ ЗАКЛИНАНИЙ
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#9BA2B8]" />
                  </div>

                  <div className="flex items-end justify-between mt-2">
                    <span className="font-serif text-3xl leading-none text-[#1C222D]">
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
                      className="bg-[#EFECE6] rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-[#1C222D] outline-none cursor-pointer"
                    >
                      <option value="none">Нет</option>
                      <option value="int">ИНТ</option>
                      <option value="wis">МДР</option>
                      <option value="cha">ХАР</option>
                    </select>
                  </div>
                </div>

                {/* Spell Attack Bonus (+ к попаданию заклинанием) */}
                <div className="bg-[#F8F5EE] rounded-xl p-3 flex flex-col justify-between min-h-[82px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                      АТАКА ЗАКЛИНАНИЕМ
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#9BA2B8]" />
                  </div>

                  <div className="flex items-end justify-between mt-2">
                    <span className="font-serif text-3xl leading-none text-[#1C222D]">
                      {spellAttackBonus !== null
                        ? formatSigned(spellAttackBonus)
                        : '—'}
                    </span>
                    <span className="font-serif italic text-xs text-[#8C857B]">
                      попадание
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Spell Slots Table Card (1st to 9th Circle) */}
            <section className="bg-[#EFECE6] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[#8C857B] font-medium">
                  ЯЧЕЙКИ ЗАКЛИНАНИЙ
                </h2>
                <button
                  type="button"
                  onClick={() => resetAllSpellSlots()}
                  className="rounded-full bg-[#F8F5EE] hover:bg-[#1C222D] text-[#8C857B] hover:text-[#F8F5EE] px-2.5 py-1 text-[9px] uppercase tracking-wider font-semibold transition-colors cursor-pointer"
                >
                  Восстановить все
                </button>
              </div>

              <div className="bg-[#F8F5EE] rounded-xl p-3">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-[#EFECE6] text-[9px] uppercase tracking-[0.12em] text-[#8C857B] font-semibold">
                  <div className="col-span-3">Круг</div>
                  <div className="col-span-3 text-center">Всего в день</div>
                  <div className="col-span-6">Ячейки</div>
                </div>

                {/* 9 Spell Slot Rows */}
                <div className="divide-y divide-[#EFECE6]/70">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((slotLvl) => {
                    const slotKey = String(slotLvl);
                    const slotData = spells.slots?.[slotKey] ?? { current: 0, max: 0 };
                    const maxSlots = slotData.max;
                    const spentSlots = Math.min(maxSlots, slotData.current);

                    return (
                      <div
                        key={slotLvl}
                        className="grid grid-cols-12 gap-2 py-1.5 items-center"
                      >
                        {/* Spell Level */}
                        <div className="col-span-3 font-serif text-base font-semibold text-[#1C222D]">
                          {slotLvl} круг
                        </div>

                        {/* Max Slots per Day Input */}
                        <div className="col-span-3 flex justify-center">
                          <EditableNumberInput
                            min={0}
                            max={12}
                            value={maxSlots}
                            onChange={(val) =>
                              updateSpellSlot(slotLvl, { max: val })
                            }
                            ariaLabel={`Максимум ячеек ${slotLvl} круга`}
                            className="w-10 h-6 rounded-md bg-[#EFECE6] text-center text-xs font-semibold text-[#1C222D] outline-none focus:ring-1 focus:ring-[#1C222D]"
                          />
                        </div>

                        {/* Interactive Visual Pip Dots */}
                        <div className="col-span-6 flex flex-wrap items-center gap-1.5">
                          {maxSlots > 0 ? (
                            Array.from({ length: maxSlots }).map((_, idx) => {
                              const isSpent = idx < spentSlots;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    // Clicking the last spent dot unspends it; otherwise sets spent count up to idx + 1
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
                                      ? 'bg-[#1C222D]'
                                      : 'bg-[#EFECE6] border border-[#8C857B]/50 hover:border-[#1C222D]'
                                  }`}
                                />
                              );
                            })
                          ) : (
                            <span className="text-[10px] text-[#8C857B]/60">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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
        <div className="bg-[#1C222D] text-[#F8F5EE] rounded-full px-2.5 py-1.5 shadow-lg flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveDockTab('sheet')}
            className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeDockTab === 'sheet'
                ? 'bg-[#F8F5EE] text-[#1C222D]'
                : 'text-[#F8F5EE]/75 hover:text-[#F8F5EE]'
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
                ? 'bg-[#F8F5EE] text-[#1C222D]'
                : 'text-[#F8F5EE]/75 hover:text-[#F8F5EE]'
            }`}
          >
            <Feather className="w-3.5 h-3.5 text-[#D4A359]" />
            <span>Инвентарь и Заклинания</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDockTab('compendium')}
            className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeDockTab === 'compendium'
                ? 'bg-[#F8F5EE] text-[#1C222D]'
                : 'text-[#F8F5EE]/75 hover:text-[#F8F5EE]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[#7E998A]" />
            <span className="hidden sm:inline">Справочник Obsidian &amp; dnd.su</span>
            <span className="sm:hidden">Справочник</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
