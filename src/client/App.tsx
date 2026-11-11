import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import {
  Backpack,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Feather,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  GripVertical,
  Loader2,
  Moon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import {
  BAG_OF_HOLDING_CAPACITY_POUNDS,
  BAG_OF_HOLDING_SELF_WEIGHT_POUNDS,
  BAG_OF_HOLDING_VOLUME_CUBIC_FEET,
  CREATURE_SIZE_CARRY_MULTIPLIER,
  applyConditionSpeed,
  applyCurrencyTransaction,
  calculateAbilityModifier,
  calculateCarryingCapacity,
  calculateConditionEffects,
  calculateD20TestModifier,
  calculateEffectiveSpeed,
  calculateInitiativeModifier,
  calculateInventoryTotalPoundsRaw,
  calculatePassivePerception,
  calculateProficiencyBonus,
  calculateSpellAttackBonus,
  calculateSpellSaveDC,
  calculateWeaponAttackBonus,
  calculateWeaponDamageBonus,
  convertWeight,
  currencyToCopper,
  poundsToKg,
  roundWeight,
} from '@shared/rulesEngine';
import {
  DND55E_CONDITIONS,
  DND55E_SKILLS,
  type AbilityKey,
  type CompendiumEntry,
  type CreatureSize,
  type CurrencyCode,
  type InventoryItem,
  type ProficiencyRank,
  type ResourceResetTrigger,
  type VaultFileNode,
  type WeightUnit,
} from '@shared/types';
import { useCharacterStore } from './store';
import { NotesPage } from './components/NotesPage';

const CREATURE_SIZE_OPTIONS: readonly {
  value: CreatureSize;
  label: string;
  multiplier: number;
}[] = [
  { value: 'tiny', label: 'Крошечный', multiplier: CREATURE_SIZE_CARRY_MULTIPLIER.tiny },
  { value: 'small', label: 'Маленький', multiplier: CREATURE_SIZE_CARRY_MULTIPLIER.small },
  { value: 'medium', label: 'Средний', multiplier: CREATURE_SIZE_CARRY_MULTIPLIER.medium },
  { value: 'large', label: 'Большой', multiplier: CREATURE_SIZE_CARRY_MULTIPLIER.large },
  { value: 'huge', label: 'Огромный', multiplier: CREATURE_SIZE_CARRY_MULTIPLIER.huge },
  { value: 'gargantuan', label: 'Громадный', multiplier: CREATURE_SIZE_CARRY_MULTIPLIER.gargantuan },
];

const CURRENCY_META: readonly {
  code: CurrencyCode;
  short: string;
  label: string;
  dotClass: string;
  highlight?: boolean;
}[] = [
  { code: 'pp', short: 'ПМ', label: 'Платина', dotClass: 'bg-[var(--mist)]' },
  { code: 'gp', short: 'ЗМ', label: 'Золото', dotClass: 'bg-[var(--ochre)]', highlight: true },
  { code: 'sp', short: 'СМ', label: 'Серебро', dotClass: 'bg-[var(--muted)]' },
  { code: 'cp', short: 'ММ', label: 'Медь', dotClass: 'bg-[var(--clay)]' },
];

const SPELL_CLASSES = [
  'Бард',
  'Волшебник',
  'Друид',
  'Жрец',
  'Колдун',
  'Паладин',
  'Следопыт',
  'Чародей',
] as const;

const SPELL_SCHOOLS = [
  'Воплощение',
  'Вызов',
  'Иллюзия',
  'Некромантия',
  'Ограждение',
  'Очарование',
  'Превращение',
  'Прорицание',
] as const;

const SPELL_LEVEL_LABELS: Record<number, string> = {
  0: 'Заговоры (0 круг)',
  1: '1 круг',
  2: '2 круг',
  3: '3 круг',
  4: '4 круг',
  5: '5 круг',
  6: '6 круг',
  7: '7 круг',
  8: '8 круг',
  9: '9 круг',
};

const ABILITY_META: Record<AbilityKey, { short: string; full: string }> = {
  str: { short: 'СИЛ', full: 'Сила' },
  dex: { short: 'ЛОВ', full: 'Ловкость' },
  con: { short: 'ТЕЛ', full: 'Телосложение' },
  int: { short: 'ИНТ', full: 'Интеллект' },
  wis: { short: 'МДР', full: 'Мудрость' },
  cha: { short: 'ХАР', full: 'Харизма' },
};

const ABILITY_ORDER: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

type DockTab = 'sheet' | 'inventory' | 'compendium' | 'notes';

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

/**
 * Breastplate / cuirass icon indicating heavy armor stealth disadvantage.
 */
function ArmorIcon({ filled = false }: { filled?: boolean }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="w-3.5 h-3.5"
    >
      <path d="M9 4c1 2.2 5 2.2 6 0l4 2 1.5 4.5-3.5 1v7L12 21l-5-2.5v-7l-3.5-1L5 6l4-2Z" />
    </svg>
  );
}

/**
 * Interactive row of circular charge/slot pips:
 * Filled (`bg-[var(--ink)]`) = available; hollow (`bg-[var(--card)]` with border) = spent.
 */
function ChargePips({
  available,
  max,
  onChange,
  sizeClass,
  getAriaLabel,
  availableTitle,
  spentTitle,
}: {
  available: number;
  max: number;
  onChange: (nextAvailable: number) => void;
  sizeClass: string;
  getAriaLabel: (index: number, isAvailable: boolean) => string;
  availableTitle: string;
  spentTitle: string;
}): React.JSX.Element {
  return (
    <>
      {Array.from({ length: max }).map((_, idx) => {
        const isAvailable = idx < available;
        return (
          <button
            key={idx}
            type="button"
            aria-label={getAriaLabel(idx, isAvailable)}
            onClick={() => {
              const nextAvailable =
                isAvailable && idx + 1 === available ? idx : idx + 1;
              onChange(nextAvailable);
            }}
            title={isAvailable ? availableTitle : spentTitle}
            className={`${sizeClass} rounded-full transition-all cursor-pointer ${
              isAvailable
                ? 'bg-[var(--ink)]'
                : 'bg-[var(--card)] border border-[color-mix(in_srgb,var(--muted)_50%,transparent)] hover:border-[var(--ink)]'
            }`}
          />
        );
      })}
    </>
  );
}

/**
 * Compact D&D 5.5e carry weight calculator meter showing remaining and occupied
 * weight simultaneously in pounds (фт) and kilograms (кг).
 */
function CarryWeightMeter({
  rawUsedPounds,
  capacityPounds,
  barTrackClass = 'bg-[var(--paper)]',
  extraUsedNote,
  overloadNote,
}: {
  rawUsedPounds: number;
  capacityPounds: number;
  barTrackClass?: string;
  extraUsedNote?: React.ReactNode;
  overloadNote?: React.ReactNode;
}): React.JSX.Element {
  const rawAvailable = capacityPounds - rawUsedPounds;
  const usedLb = roundWeight(rawUsedPounds);
  const usedKg = poundsToKg(rawUsedPounds);
  const capacityLb = roundWeight(capacityPounds);
  const capacityKg = poundsToKg(capacityPounds);
  const availableLb = roundWeight(rawAvailable);
  const availableKg = poundsToKg(rawAvailable);
  const isOverloaded = availableLb < 0 || availableKg < 0;
  const fillPercent =
    capacityPounds > 0
      ? Math.min(100, (rawUsedPounds / capacityPounds) * 100)
      : rawUsedPounds > 0
        ? 100
        : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-[10px] uppercase tracking-[0.12em] font-semibold ${
              isOverloaded ? 'text-[var(--clay)]' : 'text-[var(--muted)]'
            }`}
          >
            {isOverloaded ? 'Перегруз' : 'Доступно'}
          </span>
          <span
            className={`font-serif text-lg font-semibold leading-none tabular-nums ${
              isOverloaded ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
            }`}
          >
            {availableLb} фт
          </span>
          <span className="text-[11px] text-[var(--muted)] tabular-nums leading-none">
            ·{' '}
            <strong
              className={`font-semibold ${
                isOverloaded ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
              }`}
            >
              {availableKg} кг
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-1.5 text-[11px] text-[var(--muted)] tabular-nums leading-none">
          <span>
            Занято:{' '}
            <strong
              className={`font-semibold ${
                isOverloaded ? 'text-[var(--clay)]' : 'text-[var(--ink)]'
              }`}
            >
              {usedLb}
            </strong>{' '}
            / {capacityLb} фт{' '}
            <span className="opacity-75">
              ({usedKg} / {capacityKg} кг)
            </span>
          </span>
          {extraUsedNote}
        </div>
      </div>

      <div className={`h-1.5 w-full rounded-full ${barTrackClass} overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOverloaded
              ? 'bg-[var(--clay)]'
              : capacityPounds > 0 && rawUsedPounds / capacityPounds >= 0.8
                ? 'bg-[var(--ochre)]'
                : 'bg-[var(--sage)]'
          }`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      {isOverloaded && overloadNote && (
        <p className="text-[10px] text-[var(--clay)] font-medium tabular-nums leading-snug pt-0.5">
          {overloadNote}
        </p>
      )}
    </div>
  );
}

/**
 * Shared reorderable inventory item list used by both Inventory and Bag of Holding.
 */
function InventoryItemsList({
  characterId,
  items,
  onUpdate,
  onDelete,
  onReorder,
  emptyHint,
}: {
  characterId: string;
  items: InventoryItem[];
  onUpdate: (id: string, patch: Partial<InventoryItem>) => void;
  onDelete: (id: string) => void;
  onReorder: (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after'
  ) => void;
  emptyHint?: string;
}): React.JSX.Element {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuId(null);
    setDraggedId(null);
    setDragOverTarget(null);
  }, [characterId]);

  useEffect(() => {
    if (!menuId) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuId(null);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuId]);

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => {
        if (draggedId) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverTarget(null);
        }
      }}
      onDrop={() => {
        if (draggedId && dragOverTarget) {
          onReorder(draggedId, dragOverTarget.id, dragOverTarget.position);
        }
        setDraggedId(null);
        setDragOverTarget(null);
      }}
    >
      {items.length === 0 && emptyHint && (
        <p className="text-[11px] font-serif italic text-[var(--muted)] px-1 py-1">
          {emptyHint}
        </p>
      )}

      {items.map((item) => {
        const itemQuantity = item.quantity ?? 1;
        const itemWeight = item.weight ?? 0;
        const itemWeightUnit: WeightUnit =
          item.weightUnit === 'kg' ? 'kg' : 'lb';
        const itemWeightUnitLabel = itemWeightUnit === 'kg' ? 'кг' : 'фт';
        const otherWeightUnit: WeightUnit =
          itemWeightUnit === 'kg' ? 'lb' : 'kg';
        const otherWeightUnitLabel = otherWeightUnit === 'kg' ? 'кг' : 'фт';
        const roundedItemWeight = roundWeight(itemWeight);
        const convertedItemWeight = convertWeight(
          itemWeight,
          itemWeightUnit,
          otherWeightUnit
        );
        const chargesMax = item.chargesMax ?? 0;
        const chargesCurrent = Math.min(chargesMax, item.chargesCurrent ?? 0);
        const isDragging = draggedId === item.id;
        const dropPosition =
          dragOverTarget?.id === item.id ? dragOverTarget.position : null;

        return (
          <div
            key={item.id}
            draggable
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              const interactive = Boolean(
                target.closest('input, textarea, select, button')
              );
              e.currentTarget.draggable = !interactive;
            }}
            onDragStart={(e) => {
              if (
                (e.target as HTMLElement).closest(
                  'input, textarea, select, button'
                )
              ) {
                e.preventDefault();
                return;
              }
              setMenuId(null);
              setDraggedId(item.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
            }}
            onDragOver={(e) => {
              if (!draggedId || draggedId === item.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const rect = e.currentTarget.getBoundingClientRect();
              const position: 'before' | 'after' =
                e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
              if (
                dragOverTarget?.id !== item.id ||
                dragOverTarget.position !== position
              ) {
                setDragOverTarget({ id: item.id, position });
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const sourceId =
                draggedId ?? e.dataTransfer.getData('text/plain');
              if (sourceId && sourceId !== item.id) {
                const rect = e.currentTarget.getBoundingClientRect();
                const position: 'before' | 'after' =
                  e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                onReorder(sourceId, item.id, position);
              }
              setDraggedId(null);
              setDragOverTarget(null);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverTarget(null);
            }}
            className={`relative bg-[var(--paper)] rounded-xl px-2.5 py-2 space-y-1.5 transition-all ${
              isDragging ? 'opacity-45 scale-[0.99]' : ''
            }`}
          >
            {dropPosition === 'before' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-1.5 left-2 right-2 h-0.5 rounded-full bg-[var(--ink)]"
              />
            )}
            {dropPosition === 'after' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-1.5 left-2 right-2 h-0.5 rounded-full bg-[var(--ink)]"
              />
            )}

            <div className="flex items-center gap-1.5">
              {/* Drag Handle */}
              <span
                title="Перетащите, чтобы изменить порядок"
                aria-label="Перетащить предмет"
                className="w-4 h-6 inline-flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] cursor-grab active:cursor-grabbing shrink-0 select-none"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>

              {/* Three-Dots Menu */}
              <div
                className="relative shrink-0"
                ref={menuId === item.id ? menuRef : undefined}
              >
                <button
                  type="button"
                  aria-label="Вес, заряды и количество предмета"
                  aria-expanded={menuId === item.id}
                  onClick={() =>
                    setMenuId((current) =>
                      current === item.id ? null : item.id
                    )
                  }
                  className={`w-6 h-6 rounded-full inline-flex items-center justify-center cursor-pointer ${
                    menuId === item.id
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]'
                  }`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {menuId === item.id && (
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-60 rounded-2xl bg-[var(--paper)] p-2.5 shadow-lg ring-1 ring-[var(--stone)] space-y-2.5">
                    {/* Количество */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                        Количество
                      </span>
                      <EditableNumberInput
                        min={0}
                        max={9999}
                        value={itemQuantity}
                        ariaLabel="Количество предметов"
                        onChange={(val) => onUpdate(item.id, { quantity: val })}
                        className="w-16 h-6 rounded-md bg-[var(--card)] text-center text-xs font-semibold tabular-nums text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink)]"
                      />
                    </div>

                    {/* Вес и единица измерения (фт / кг) */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                        Вес
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={itemWeight === 0 ? '' : itemWeight}
                          placeholder="0"
                          aria-label={`Вес предмета (${itemWeightUnitLabel})`}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdate(item.id, {
                              weight: Number.isNaN(val)
                                ? 0
                                : Math.max(0, val),
                            });
                          }}
                          className="w-14 h-6 rounded-md bg-[var(--card)] text-center text-xs font-semibold tabular-nums text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                        <div
                          role="group"
                          aria-label="Единица измерения веса"
                          className="bg-[var(--card)] rounded-md p-0.5 inline-flex shrink-0"
                        >
                          {(
                            [
                              { code: 'lb', label: 'фт' },
                              { code: 'kg', label: 'кг' },
                            ] as const
                          ).map((unitOpt) => (
                            <button
                              key={unitOpt.code}
                              type="button"
                              onClick={() => {
                                if (itemWeightUnit !== unitOpt.code) {
                                  onUpdate(item.id, {
                                    weightUnit: unitOpt.code,
                                  });
                                }
                              }}
                              className={`px-1.5 h-5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                                itemWeightUnit === unitOpt.code
                                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
                              }`}
                            >
                              {unitOpt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Заряды */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                        Заряды
                      </span>
                      <EditableNumberInput
                        min={0}
                        max={30}
                        value={chargesMax}
                        ariaLabel="Максимум зарядов предмета"
                        onChange={(val) => {
                          const nextMax = Math.max(0, Math.min(30, val));
                          const nextCurrent =
                            chargesMax === 0 || chargesCurrent === chargesMax
                              ? nextMax
                              : Math.min(chargesCurrent, nextMax);
                          onUpdate(item.id, {
                            chargesMax: nextMax,
                            chargesCurrent: nextCurrent,
                          });
                        }}
                        className="w-16 h-6 rounded-md bg-[var(--card)] text-center text-xs font-semibold tabular-nums text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <input
                type="text"
                value={item.name}
                maxLength={80}
                placeholder="Название предмета"
                aria-label="Название предмета"
                onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                className="min-w-0 flex-1 bg-transparent font-serif text-base leading-none text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_50%,transparent)]"
              />

              {itemQuantity !== 1 && (
                <span
                  title={`Количество: ${itemQuantity}`}
                  className={`rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold tabular-nums shrink-0 ${
                    itemQuantity === 0
                      ? 'text-[var(--clay)]'
                      : 'text-[var(--ink)]'
                  }`}
                >
                  ×{itemQuantity}
                </span>
              )}

              {itemWeight > 0 && (
                <span
                  title={
                    itemQuantity > 1
                      ? `Вес: ${roundedItemWeight} ${itemWeightUnitLabel} (≈ ${convertedItemWeight} ${otherWeightUnitLabel}) × ${itemQuantity} = ${roundWeight(itemWeight * itemQuantity)} ${itemWeightUnitLabel}`
                      : `Вес: ${roundedItemWeight} ${itemWeightUnitLabel} (≈ ${convertedItemWeight} ${otherWeightUnitLabel})`
                  }
                  className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)] shrink-0"
                >
                  {roundedItemWeight} {itemWeightUnitLabel}
                </span>
              )}

              {/* Delete button */}
              <button
                type="button"
                aria-label={`Удалить предмет ${item.name || ''}`.trim()}
                onClick={() => {
                  if (menuId === item.id) {
                    setMenuId(null);
                  }
                  onDelete(item.id);
                }}
                className="w-6 h-6 rounded-full text-[var(--muted)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-sm leading-none flex items-center justify-center cursor-pointer transition-colors shrink-0"
              >
                ×
              </button>
            </div>

            {/* Description Field */}
            <textarea
              value={item.description ?? ''}
              rows={1}
              maxLength={400}
              placeholder="Описание предмета..."
              aria-label="Описание предмета"
              onChange={(e) =>
                onUpdate(item.id, { description: e.target.value })
              }
              className="w-full resize-y rounded-lg bg-[var(--card)] px-2.5 py-1.5 text-xs leading-snug text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_55%,transparent)] transition-all"
            />

            {chargesMax > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--ink)]">
                  <span>
                    {chargesCurrent}/{chargesMax}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                  <ChargePips
                    available={chargesCurrent}
                    max={chargesMax}
                    sizeClass="w-5 h-5"
                    onChange={(nextCurrent) =>
                      onUpdate(item.id, { chargesCurrent: nextCurrent })
                    }
                    getAriaLabel={(idx, isAvailable) =>
                      `Заряд предмета ${idx + 1} (${
                        isAvailable ? 'доступен' : 'потрачен'
                      })`
                    }
                    availableTitle="Заряд доступен (нажмите, чтобы потратить)"
                    spentTitle="Заряд потрачен (нажмите, чтобы восстановить)"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
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
    toggleHeavyArmorStealthDisadvantage,
    updateHpAndCombat,
    setSpellcastingAbility,
    updateSpellSlot,
    setVisibleSpellSlotLevels,
    resetAllSpellSlots,
    setWeaponAttacks,
    addCustomResource,
    updateCustomResource,
    deleteCustomResource,
    addPassiveTrait,
    updatePassiveTrait,
    deletePassiveTrait,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    reorderInventoryItem,
    setBagOfHoldingEnabled,
    addBagOfHoldingItem,
    updateBagOfHoldingItem,
    deleteBagOfHoldingItem,
    reorderBagOfHoldingItem,
    setCurrencyCoin,
    applyCurrencyChange,
    addSpellToCharacter,
    removeSpellFromCharacter,
    togglePreparedSpell,
    compendiumSpells,
    fetchCompendiumSpells,
    vaultTree,
    vaultTotalFiles,
    isVaultLoading,
    isVaultSyncing,
    fetchVaultTree,
    syncVaultWithGit,
    takeShortRest,
    takeLongRest,
    saveActiveCharacter,
  } = useCharacterStore();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [night, setNight] = useState(
    () => window.localStorage.getItem('dnd-sheet-night') === '1'
  );
  const [activeDockTab, setActiveDockTab] = useState<DockTab>('sheet');
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [conditionMenuOpen, setConditionMenuOpen] = useState(false);
  const [weaponMenuId, setWeaponMenuId] = useState<string | null>(null);
  const [resourceMenuId, setResourceMenuId] = useState<string | null>(null);
  const [passiveMenuId, setPassiveMenuId] = useState<string | null>(null);
  const [currencyTxMode, setCurrencyTxMode] = useState<'add' | 'spend'>('add');
  const [currencyTxCoin, setCurrencyTxCoin] = useState<CurrencyCode>('gp');
  const [currencyTxAmount, setCurrencyTxAmount] = useState('');
  const [allSkillsBonusDraft, setAllSkillsBonusDraft] = useState('');
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const conditionMenuRef = useRef<HTMLDivElement>(null);
  const weaponMenuRef = useRef<HTMLDivElement>(null);
  const resourceMenuRef = useRef<HTMLDivElement>(null);
  const passiveMenuRef = useRef<HTMLDivElement>(null);

  // Spells & Compendium state
  const [isSpellModalOpen, setIsSpellModalOpen] = useState(false);
  const [spellSearchQuery, setSpellSearchQuery] = useState('');
  const [spellLevelFilter, setSpellLevelFilter] = useState<number | 'all'>('all');
  const [spellClassFilter, setSpellClassFilter] = useState<string>('all');
  const [spellSchoolFilter, setSpellSchoolFilter] = useState<string>('all');
  const [spellConcentrationFilter, setSpellConcentrationFilter] = useState<boolean>(false);
  const [spellRitualFilter, setSpellRitualFilter] = useState<boolean>(false);
  const [expandedSpellSlugs, setExpandedSpellSlugs] = useState<Set<string>>(new Set());

  // Library / Obsidian Vault state
  const [selectedVaultFilePath, setSelectedVaultFilePath] = useState<string | null>(null);
  const [selectedVaultFile, setSelectedVaultFile] = useState<{
    path: string;
    title: string;
    content: string;
    updatedAt?: number;
  } | null>(null);
  const [isVaultFileLoading, setIsVaultFileLoading] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [expandedVaultFolders, setExpandedVaultFolders] = useState<Set<string>>(
    () => new Set(['Справочник'])
  );

  const toggleVaultFolder = (folderPath: string) => {
    setExpandedVaultFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const expandAllVaultFolders = () => {
    const allDirs = new Set<string>();
    function collect(nodes: VaultFileNode[]) {
      for (const n of nodes) {
        if (n.type === 'directory') {
          allDirs.add(n.path);
          if (n.children) collect(n.children);
        }
      }
    }
    collect(vaultTree);
    setExpandedVaultFolders(allDirs);
  };

  const collapseAllVaultFolders = () => {
    setExpandedVaultFolders(new Set());
  };

  const loadVaultFile = async (filePath: string) => {
    setSelectedVaultFilePath(filePath);
    setIsVaultFileLoading(true);
    try {
      const res = await fetch(`/api/vault/file?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = (await res.json()) as {
          path: string;
          title: string;
          content: string;
          updatedAt?: number;
        };
        setSelectedVaultFile(data);
      }
    } catch (err) {
      console.error('Failed to load vault file:', err);
    } finally {
      setIsVaultFileLoading(false);
    }
  };

  const toggleSpellExpanded = (slug: string) => {
    setExpandedSpellSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  useEffect(() => {
    void fetchCharacters();
    void fetchCompendiumSpells();
    void fetchVaultTree();
  }, [fetchCharacters, fetchCompendiumSpells, fetchVaultTree]);

  useEffect(() => {
    document.documentElement.classList.toggle('night', night);
    window.localStorage.setItem('dnd-sheet-night', night ? '1' : '0');
  }, [night]);

  const activeCharacter = characters.find((c) => c.id === activeCharacterId) ?? null;

  useEffect(() => {
    setConfirmDeleteId(null);
    setSkillMenuOpen(false);
    setConditionMenuOpen(false);
    setWeaponMenuId(null);
    setResourceMenuId(null);
    setPassiveMenuId(null);
    setCurrencyTxAmount('');
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

  useEffect(() => {
    if (!resourceMenuId && !passiveMenuId) return;

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (resourceMenuId && !resourceMenuRef.current?.contains(target)) {
        setResourceMenuId(null);
      }
      if (passiveMenuId && !passiveMenuRef.current?.contains(target)) {
        setPassiveMenuId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setResourceMenuId(null);
        setPassiveMenuId(null);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [resourceMenuId, passiveMenuId]);

  useEffect(() => {
    if (!conditionMenuOpen) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (!conditionMenuRef.current?.contains(event.target as Node)) {
        setConditionMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setConditionMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [conditionMenuOpen]);

  const applyBonusToAllSkills = (): void => {
    const trimmed = allSkillsBonusDraft.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) return;
    const amount = Number.parseInt(trimmed, 10);
    if (Number.isNaN(amount) || amount === 0) return;
    addBonusToAllSkills(amount);
    setAllSkillsBonusDraft('');
    setSkillMenuOpen(false);
  };

  const knownSlugs = activeCharacter?.spells?.knownSlugs ?? [];
  const preparedSlugs = activeCharacter?.spells?.preparedSlugs ?? [];

  const characterSpellsByLevel = useMemo(() => {
    const groups: Record<number, CompendiumEntry[]> = {};
    for (const slug of knownSlugs) {
      const entry =
        compendiumSpells.find((s) => s.slug === slug) ??
        ({
          id: slug,
          slug,
          title: slug,
          category: 'spell',
          source: 'obsidian',
          raw_content: '',
          metadata: { spellLevel: 0 },
          updated_at: 0,
        } as CompendiumEntry);
      const lvl = (entry.metadata as { spellLevel?: number } | undefined)?.spellLevel ?? 0;
      if (!groups[lvl]) groups[lvl] = [];
      groups[lvl]!.push(entry);
    }
    return groups;
  }, [knownSlugs, compendiumSpells]);

  const filteredCompendiumSpells = useMemo(() => {
    return compendiumSpells.filter((spell) => {
      const meta = spell.metadata as
        | {
            spellLevel?: number;
            school?: string;
            classes?: string[];
            concentration?: boolean;
            ritual?: boolean;
            ruName?: string;
            enName?: string;
          }
        | undefined;

      if (spellSearchQuery.trim()) {
        const q = spellSearchQuery.toLowerCase().trim();
        const matchTitle = spell.title.toLowerCase().includes(q);
        const matchDesc = spell.raw_content ? spell.raw_content.toLowerCase().includes(q) : false;
        const matchRu = meta?.ruName ? meta.ruName.toLowerCase().includes(q) : false;
        const matchEn = meta?.enName ? meta.enName.toLowerCase().includes(q) : false;
        if (!matchTitle && !matchDesc && !matchRu && !matchEn) return false;
      }

      if (spellLevelFilter !== 'all') {
        if (meta?.spellLevel !== spellLevelFilter) return false;
      }

      if (spellClassFilter !== 'all') {
        const classes = meta?.classes ?? [];
        if (!classes.some((c) => c.toLowerCase() === spellClassFilter.toLowerCase())) {
          return false;
        }
      }

      if (spellSchoolFilter !== 'all') {
        if (meta?.school?.toLowerCase() !== spellSchoolFilter.toLowerCase()) {
          return false;
        }
      }

      if (spellConcentrationFilter && !meta?.concentration) {
        return false;
      }

      if (spellRitualFilter && !meta?.ritual) {
        return false;
      }

      return true;
    });
  }, [
    compendiumSpells,
    spellSearchQuery,
    spellLevelFilter,
    spellClassFilter,
    spellSchoolFilter,
    spellConcentrationFilter,
    spellRitualFilter,
  ]);

  const filteredVaultTree = useMemo(() => {
    if (!vaultSearchQuery.trim()) return vaultTree;
    const q = vaultSearchQuery.toLowerCase().trim();

    function filterNodes(nodes: VaultFileNode[]): VaultFileNode[] {
      const res: VaultFileNode[] = [];
      for (const node of nodes) {
        if (node.type === 'file') {
          if (
            node.title.toLowerCase().includes(q) ||
            node.name.toLowerCase().includes(q)
          ) {
            res.push(node);
          }
        } else if (node.type === 'directory') {
          const filteredChildren = filterNodes(node.children ?? []);
          const dirMatches = node.name.toLowerCase().includes(q);
          if (dirMatches || filteredChildren.length > 0) {
            res.push({
              ...node,
              children: dirMatches ? node.children : filteredChildren,
              fileCount: filteredChildren.length,
            });
          }
        }
      }
      return res;
    }

    return filterNodes(vaultTree);
  }, [vaultTree, vaultSearchQuery]);

  useEffect(() => {
    if (vaultSearchQuery.trim()) {
      const allDirs = new Set<string>();
      function collect(nodes: VaultFileNode[]) {
        for (const n of nodes) {
          if (n.type === 'directory') {
            allDirs.add(n.path);
            if (n.children) collect(n.children);
          }
        }
      }
      collect(filteredVaultTree);
      setExpandedVaultFolders(allDirs);
    }
  }, [vaultSearchQuery, filteredVaultTree]);

  const matchingSpellForSelectedVaultFile = useMemo(() => {
    if (!selectedVaultFile) return null;
    const cleanTitle = selectedVaultFile.title.toLowerCase().trim();
    return (
      compendiumSpells.find((s) => {
        const meta = s.metadata as
          | { ruName?: string; enName?: string }
          | undefined;
        const sTitle = s.title.toLowerCase().trim();
        const sRu = meta?.ruName?.toLowerCase().trim() || '';
        const sEn = meta?.enName?.toLowerCase().trim() || '';
        return (
          sTitle === cleanTitle ||
          sRu === cleanTitle ||
          cleanTitle.startsWith(sTitle) ||
          cleanTitle.startsWith(sRu)
        );
      }) ?? null
    );
  }, [selectedVaultFile, compendiumSpells]);

  const renderMarkdown = (content: string): string => {
    if (!content) return '';
    const preprocessed = content.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match, target, label) => {
        const display = (label || target).trim();
        return `<span class="wiki-link inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--sage)] font-serif text-xs font-semibold underline decoration-dotted cursor-pointer hover:text-[var(--ink)] transition-colors" data-wiki-target="${target.trim()}">${display}</span>`;
      }
    );
    try {
      return marked.parse(preprocessed, { breaks: true, gfm: true }) as string;
    } catch {
      return preprocessed;
    }
  };

  const handleMarkdownClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest(
      '[data-wiki-target]'
    ) as HTMLElement | null;
    if (target?.dataset.wikiTarget) {
      const wikiTarget = target.dataset.wikiTarget;
      function findNode(nodes: VaultFileNode[]): VaultFileNode | null {
        const cleanTarget = wikiTarget.toLowerCase().trim().replace(/\.md$/i, '');
        for (const n of nodes) {
          if (n.type === 'file') {
            const t1 = n.title.toLowerCase().trim();
            const t2 = n.name.toLowerCase().trim().replace(/\.md$/i, '');
            if (t1 === cleanTarget || t2 === cleanTarget || t1.includes(cleanTarget)) {
              return n;
            }
          } else if (n.children) {
            const f = findNode(n.children);
            if (f) return f;
          }
        }
        return null;
      }
      const found = findNode(vaultTree);
      if (found) {
        void loadVaultFile(found.path);
      }
    }
  };

  const renderVaultTreeNode = (
    node: VaultFileNode,
    depth: number = 0
  ): React.ReactNode => {
    if (node.type === 'directory') {
      const isExpanded = expandedVaultFolders.has(node.path);
      const indentPadding = depth * 12;

      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => toggleVaultFolder(node.path)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleVaultFolder(node.path);
              }
            }}
            style={{ paddingLeft: `${indentPadding + 6}px` }}
            className="flex items-center justify-between py-1.5 pr-2 rounded-xl text-xs hover:bg-[var(--paper)] cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[var(--muted)] group-hover:text-[var(--ink)] transition-transform duration-150">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
              <span className="text-[var(--ochre)]">
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4" />
                ) : (
                  <Folder className="w-4 h-4" />
                )}
              </span>
              <span className="font-medium text-[var(--ink)] truncate">
                {node.name}
              </span>
            </div>
            {node.fileCount !== undefined && node.fileCount > 0 && (
              <span className="text-[10px] text-[var(--muted)] bg-[var(--paper)] px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
                {node.fileCount}
              </span>
            )}
          </div>

          {isExpanded && node.children && node.children.length > 0 && (
            <div className="space-y-0.5">
              {node.children.map((child) =>
                renderVaultTreeNode(child, depth + 1)
              )}
            </div>
          )}
        </div>
      );
    }

    const isSelected = selectedVaultFilePath === node.path;
    const indentPadding = depth * 12;

    return (
      <div
        key={node.path}
        onClick={() => void loadVaultFile(node.path)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void loadVaultFile(node.path);
          }
        }}
        style={{ paddingLeft: `${indentPadding + 20}px` }}
        className={`flex items-center justify-between py-1.5 pr-2 rounded-xl text-xs cursor-pointer transition-all ${
          isSelected
            ? 'bg-[var(--ink)] text-[var(--paper)] font-medium shadow-xs'
            : 'text-[var(--ink)] hover:bg-[var(--paper)]'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText
            className={`w-3.5 h-3.5 shrink-0 ${
              isSelected ? 'text-[var(--paper)]' : 'text-[var(--sage)]'
            }`}
          />
          <span className="truncate">{node.title}</span>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] flex items-center justify-center p-8">
        <div className="font-serif italic text-xl text-[var(--muted)]">
          Раскрываем страницы журнала персонажа...
        </div>
      </div>
    );
  }

  if (!activeCharacter) {
    return (
      <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] pb-16">
        <div className="max-w-[1320px] mx-auto px-5 py-6 space-y-6">
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[color-mix(in_srgb,var(--muted)_20%,transparent)] pb-4">
            <div className="space-y-1">
              <span className="block text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] font-medium">
                Редакция правил 2024
              </span>
              <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-[var(--ink)] leading-tight">
                Интерактивный Лист персонажа DnD 5.5е
              </h1>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-end">
              <button
                type="button"
                aria-label={night ? 'Дневной режим' : 'Ночной режим'}
                aria-pressed={night}
                title={night ? 'Дневной режим' : 'Ночной режим'}
                onClick={() => setNight((value) => !value)}
                className="w-9 h-9 rounded-full bg-[var(--card)] text-[var(--ochre)] hover:bg-[var(--ink)] hover:text-[var(--paper)] inline-flex items-center justify-center transition-colors duration-300 cursor-pointer"
              >
                <span
                  className={`inline-flex transition-transform duration-700 ease-out ${
                    night ? 'rotate-[360deg]' : 'rotate-0'
                  }`}
                >
                  {night ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </span>
              </button>

              {characters.length > 0 && (
                <button
                  type="button"
                  onClick={() => void createCharacter()}
                  className="rounded-full bg-[var(--ink)] text-[var(--paper)] hover:bg-[color-mix(in_srgb,var(--ink)_90%,transparent)] px-4 py-2 text-xs uppercase tracking-wider font-medium inline-flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Создать персонажа</span>
                </button>
              )}
            </div>
          </header>

          {characters.length === 0 ? (
            <section className="bg-[var(--card)] rounded-2xl p-10 md:p-14 flex flex-col items-center justify-center text-center space-y-4">
              <div className="space-y-1.5 max-w-md">
                <h2 className="font-serif text-2xl text-[var(--ink)]">
                  Список персонажей пуст
                </h2>
                <p className="font-serif italic text-base text-[var(--muted)]">
                  Создайте своего первого героя, чтобы перейти к заполнению листа персонажа.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createCharacter()}
                className="rounded-full bg-[var(--ink)] text-[var(--paper)] hover:bg-[color-mix(in_srgb,var(--ink)_90%,transparent)] px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-semibold inline-flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Создать персонажа</span>
              </button>
            </section>
          ) : (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                  Выбор персонажа ({characters.length})
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {characters.map((char) => {
                  const charName = char.name.trim() || 'Новый персонаж';
                  const identityParts = [
                    char.species.trim(),
                    char.class_name.trim(),
                    (char.subclass_name ?? '').trim(),
                  ].filter(Boolean);
                  const identitySubtitle =
                    identityParts.length > 0
                      ? identityParts.join(' • ')
                      : 'Вид и класс не указаны';
                  const isConfirmingDelete = confirmDeleteId === char.id;

                  return (
                    <div
                      key={char.id}
                      onClick={() => selectCharacter(char.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectCharacter(char.id);
                        }
                      }}
                      className="group bg-[var(--card)] rounded-2xl p-4 hover:ring-1 hover:ring-[var(--ink)] transition-all cursor-pointer text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <span className="font-serif italic text-sm text-[var(--muted)] truncate block">
                            {identitySubtitle}
                          </span>
                          <h3 className="font-serif text-2xl leading-tight text-[var(--ink)] truncate">
                            {charName}
                          </h3>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className="rounded-full bg-[var(--paper)] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink)] tabular-nums">
                            Ур. {char.level}
                          </span>

                          <div
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {!isConfirmingDelete ? (
                              <button
                                type="button"
                                aria-label={`Удалить персонажа ${charName}`}
                                title="Удалить персонажа"
                                onClick={() => setConfirmDeleteId(char.id)}
                                className="w-7 h-7 rounded-full bg-[var(--paper)] hover:bg-[color-mix(in_srgb,var(--clay)_20%,transparent)] text-[var(--muted)] hover:text-[var(--clay)] inline-flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <div className="rounded-full bg-[var(--clay)] text-[var(--paper)] px-2.5 py-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    void deleteCharacter(char.id);
                                  }}
                                  className="font-bold underline cursor-pointer"
                                >
                                  Да
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="opacity-80 hover:opacity-100 cursor-pointer"
                                >
                                  Нет
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
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
    size = 'medium',
    stats,
    proficiencies,
    hp,
    exhaustion,
    spells,
    weapon_attacks: weaponAttacks,
    custom_resources: customResources = [],
    passive_traits: passiveTraits = [],
    inventory = [],
    bag_of_holding: bagOfHolding = { enabled: false, items: [] },
    currency = { pp: 0, gp: 0, sp: 0, cp: 0 },
  } = activeCharacter;

  const bagOfHoldingEnabled = Boolean(bagOfHolding.enabled);
  const bagOfHoldingItems = bagOfHolding.items ?? [];
  const rawTotalInventoryPounds =
    calculateInventoryTotalPoundsRaw(inventory) +
    (bagOfHoldingEnabled ? BAG_OF_HOLDING_SELF_WEIGHT_POUNDS : 0);
  const rawTotalBagPounds = calculateInventoryTotalPoundsRaw(bagOfHoldingItems);
  const carryingCapacity = calculateCarryingCapacity(stats.str, size);
  const pushDragLiftLimit = roundWeight(carryingCapacity * 2);
  const pushDragLiftLimitKg = poundsToKg(pushDragLiftLimit);

  const totalCopper = currencyToCopper(currency);
  const parsedCurrencyTxAmount =
    currencyTxAmount.trim() === ''
      ? 0
      : Number.parseInt(currencyTxAmount, 10) || 0;
  const currencyTxPreview =
    parsedCurrencyTxAmount > 0
      ? applyCurrencyTransaction({
          currency,
          coin: currencyTxCoin,
          amount: parsedCurrencyTxAmount,
          mode: currencyTxMode,
        })
      : null;

  const submitCurrencyTransaction = (): void => {
    if (!currencyTxPreview?.ok) return;
    applyCurrencyChange({
      coin: currencyTxCoin,
      amount: parsedCurrencyTxAmount,
      mode: currencyTxMode,
    });
    setCurrencyTxAmount('');
  };

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
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] pb-6">
      <div className="max-w-[1320px] mx-auto px-5 py-3.5 space-y-3.5">
        {/* =================================================================== */}
        {/* EDITORIAL HEADER (Compact for 14" laptop screen)                    */}
        {/* =================================================================== */}
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
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

          {/* Right: Unified Navigation & Controls Cluster with gray/card background */}
          <div className="bg-[var(--card)] rounded-full p-1.5 flex flex-wrap items-center gap-1.5 self-start xl:self-end">
            <button
              type="button"
              onClick={() => selectCharacter(null)}
              title="Вернуться к выбору персонажей"
              className="rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] px-3 py-1.5 text-xs uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>← Персонажи</span>
            </button>

            {/* Navigation Tabs Pill (light/dark harmonious, no inversion) */}
            <nav
              aria-label="Режимы листа персонажа"
              className="flex items-center gap-1"
            >
              <button
                type="button"
                onClick={() => setActiveDockTab('sheet')}
                className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeDockTab === 'sheet'
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--paper)_60%,transparent)]'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>Основной лист</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDockTab('inventory')}
                className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeDockTab === 'inventory'
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--paper)_60%,transparent)]'
                }`}
              >
                <Feather className="w-3.5 h-3.5 text-[var(--ochre)]" />
                <span>Инвентарь и Заклинания</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDockTab('notes')}
                className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeDockTab === 'notes'
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--paper)_60%,transparent)]'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-[var(--sea)]" />
                <span>Заметки</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDockTab('compendium')}
                className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeDockTab === 'compendium'
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--paper)_60%,transparent)]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-[var(--sage)]" />
                <span className="hidden sm:inline">Библиотека Obsidian</span>
                <span className="sm:hidden">Библиотека</span>
              </button>
            </nav>

            {/* Level Selector Pill */}
            <div className="rounded-full bg-[var(--paper)] px-3 py-1 flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                Ур.
              </span>
              <button
                type="button"
                onClick={() => setLevel(level - 1)}
                className="w-5 h-5 rounded-full bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
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
                className="w-5 h-5 rounded-full bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Day / Night Theme Toggle */}
            <button
              type="button"
              aria-label={night ? 'Дневной режим' : 'Ночной режим'}
              aria-pressed={night}
              title={night ? 'Дневной режим' : 'Ночной режим'}
              onClick={() => setNight((value) => !value)}
              className="w-8 h-8 rounded-full bg-[var(--paper)] text-[var(--ochre)] hover:bg-[var(--ink)] hover:text-[var(--paper)] inline-flex items-center justify-center transition-colors duration-300 cursor-pointer"
            >
              <span
                className={`inline-flex transition-transform duration-700 ease-out ${
                  night ? 'rotate-[360deg]' : 'rotate-0'
                }`}
              >
                {night ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </span>
            </button>

            {/* Manual Save Status / Trigger Icon Button */}
            <button
              type="button"
              aria-label={isSaving ? 'Сохранение изменений...' : 'Сохранено (нажмите для сохранения)'}
              title={isSaving ? 'Сохранение изменений...' : 'Все изменения сохранены (нажмите, чтобы сохранить вручную)'}
              onClick={() => void saveActiveCharacter()}
              className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition-all cursor-pointer ${
                isSaving
                  ? 'bg-[var(--paper)] text-[var(--muted)]'
                  : 'bg-[var(--paper)] text-[var(--sage)] hover:bg-[var(--sage)] hover:text-[var(--paper)]'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </header>

        {/* =================================================================== */}
        {/* MAIN WORKSPACE (Optimized to fit 14" Laptop Viewport at once)       */}
        {/* =================================================================== */}
        {activeDockTab === 'sheet' && (
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
                      const hasHeavyArmorDisadvantage = Boolean(
                        proficiencies.heavyArmorStealthDisadvantage
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

                            <div className="flex items-center gap-1.5">
                              {key === 'dex' && (
                                <button
                                  type="button"
                                  aria-pressed={hasHeavyArmorDisadvantage}
                                  aria-label="Тяжёлая броня: помеха на Скрытность"
                                  title={
                                    hasHeavyArmorDisadvantage
                                      ? 'Тяжёлая броня надета: помеха на Скрытность (нажмите, чтобы снять)'
                                      : 'Тяжёлая броня: нет помехи на Скрытность (нажмите, чтобы отметить)'
                                  }
                                  onClick={toggleHeavyArmorStealthDisadvantage}
                                  className={`w-6 h-6 rounded-md inline-flex items-center justify-center transition-all cursor-pointer ${
                                    hasHeavyArmorDisadvantage
                                      ? 'bg-[var(--clay)] text-[var(--paper)] shadow-xs'
                                      : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--ink)]'
                                  }`}
                                >
                                  <ArmorIcon filled={hasHeavyArmorDisadvantage} />
                                </button>
                              )}

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
                                  const isArmorStealthDisadvantage =
                                    skill.key === 'stealth' && hasHeavyArmorDisadvantage;
                                  const isSkillDisadvantaged =
                                    checkHindrance.length > 0 || isArmorStealthDisadvantage;

                                  return (
                                    <div
                                      key={skill.key}
                                      className="w-full py-0.5 flex items-center justify-between gap-2"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => cycleSkillProficiency(skill.key)}
                                        title={
                                          isArmorStealthDisadvantage
                                            ? 'Помеха на Скрытность из-за тяжёлой брони'
                                            : undefined
                                        }
                                        className="min-w-0 flex-1 flex items-center gap-2 text-left group cursor-pointer"
                                      >
                                        <SkillDot rank={rank} />
                                        <span
                                          className={`text-[11px] uppercase tracking-wider font-medium truncate transition-colors ${
                                            isArmorStealthDisadvantage
                                              ? 'text-[var(--clay)]'
                                              : 'text-[var(--ink)]'
                                          }`}
                                        >
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
                                          isArmorStealthDisadvantage
                                            ? 'Помеха на Скрытность (тяжёлая броня). Нажмите, чтобы изменить модификатор навыка'
                                            : individualBonus === 0 && globalSkillBonus === 0
                                              ? 'Нажмите, чтобы изменить модификатор навыка'
                                              : `Дополнительно ${formatSigned(individualBonus + globalSkillBonus)}. Нажмите, чтобы изменить`
                                        }
                                        ariaLabel={`Модификатор навыка ${skill.label}`}
                                        className={`w-11 bg-transparent text-right font-serif text-base font-semibold tabular-nums leading-none outline-none rounded-md cursor-text hover:bg-[var(--card)] focus:bg-[var(--card)] ${
                                          isSkillDisadvantaged
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

            {/* Conditions Card */}
            <section className="bg-[var(--card)] rounded-2xl p-4 space-y-3">
              <h2 className="pl-2 text-[10px] uppercase tracking-[0.15em] font-medium leading-none text-[var(--muted)]">
                СОСТОЯНИЯ
              </h2>
                  <div className="relative" ref={conditionMenuRef}>
                    <button
                      type="button"
                      aria-label="Добавить состояние"
                      aria-haspopup="listbox"
                      aria-expanded={conditionMenuOpen}
                      disabled={availableConditions.length === 0}
                      onClick={() => setConditionMenuOpen((open) => !open)}
                      className="w-full rounded-full border border-[var(--stone)] bg-[var(--paper)] px-3 py-1.5 flex items-center justify-between gap-2 text-left text-[10px] uppercase tracking-[0.12em] font-medium leading-none text-[var(--ink)] hover:border-[var(--muted)] outline-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default"
                    >
                      <span>
                        {availableConditions.length > 0 ? 'Добавить' : 'Все состояния'}
                      </span>
                      <ChevronUp
                        className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${
                          conditionMenuOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {conditionMenuOpen && availableConditions.length > 0 && (
                      <div
                        role="listbox"
                        aria-label="Список состояний"
                        className="absolute left-0 right-0 bottom-full mb-1.5 z-50 max-h-60 overflow-y-auto rounded-2xl bg-[var(--paper)] p-1.5 shadow-lg ring-1 ring-[var(--stone)] space-y-0.5"
                      >
                        {availableConditions.map((condition) => (
                          <button
                            key={condition.key}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => {
                              if (!activeConditions.includes(condition.key)) {
                                updateHpAndCombat({
                                  conditions: [...activeConditions, condition.key],
                                });
                              }
                              setConditionMenuOpen(false);
                            }}
                            className="w-full text-left rounded-xl px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] font-medium text-[var(--ink)] hover:bg-[var(--card)] transition-colors cursor-pointer"
                          >
                            {condition.label}
                          </button>
                        ))}
                      </div>
                    )}
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
                    const availableSlots = Math.max(0, maxSlots - spentSlots);

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
                            <ChargePips
                              available={availableSlots}
                              max={maxSlots}
                              sizeClass="w-3.5 h-3.5"
                              onChange={(nextAvailable) =>
                                updateSpellSlot(slotLvl, {
                                  current: Math.max(0, maxSlots - nextAvailable),
                                })
                              }
                              getAriaLabel={(idx, isAvailable) =>
                                `Ячейка ${slotLvl} круга №${idx + 1} (${
                                  isAvailable ? 'доступна' : 'потрачена'
                                })`
                              }
                              availableTitle="Ячейка доступна (нажмите, чтобы потратить)"
                              spentTitle="Ячейка потрачена (нажмите, чтобы восстановить)"
                            />
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

              {/* 4x2 Compact Bento Grid: Initiative, Passive Perception, AC, Speed, Hit Dice, Spell Save DC, Spell Attack, Death Saves */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Initiative */}
                <div className="bg-[var(--paper)] rounded-xl p-2.5 flex flex-col justify-between min-h-[72px]">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)] font-medium leading-tight">
                    ИНИЦИАТИВА
                  </span>
                  <div className="flex items-end mt-1.5">
                    <span
                      className={`font-serif text-2xl xl:text-[26px] leading-none ${
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
                  </div>
                </div>

                {/* Passive Wisdom (Perception) */}
                <div className="bg-[var(--paper)] rounded-xl p-2.5 flex flex-col justify-between min-h-[72px]">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)] font-medium leading-tight">
                    ПАССИВНАЯ МУДРОСТЬ
                  </span>
                  <div className="flex items-end mt-1.5">
                    <span
                      className={`font-serif text-2xl xl:text-[26px] leading-none ${
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
                  </div>
                </div>

                {/* Armor Class */}
                <div className="bg-[var(--paper)] rounded-xl p-2.5 flex flex-col justify-between min-h-[72px]">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)] font-medium leading-tight">
                    КЛАСС ДОСПЕХА
                  </span>
                  <div className="flex items-end mt-1.5">
                    <EditableNumberInput
                      min={0}
                      max={50}
                      value={armorClass}
                      onChange={(val) => updateHpAndCombat({ armor_class: val })}
                      ariaLabel="Класс доспеха"
                      className={`w-12 bg-transparent font-serif text-2xl xl:text-[26px] leading-none outline-none ${
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
                  </div>
                </div>

                {/* Speed */}
                <div className="bg-[var(--paper)] rounded-xl p-2.5 flex flex-col justify-between min-h-[72px]">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)] font-medium leading-tight">
                    СКОРОСТЬ
                  </span>
                  <div className="flex items-end justify-between gap-1 mt-1.5">
                    <span
                      className={`font-serif text-2xl xl:text-[26px] leading-none whitespace-nowrap ${
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
                      <span className="text-xs font-sans text-[var(--muted)] ml-0.5">фт</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
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
                        className="w-8 bg-[var(--card)] rounded px-1 py-0.5 text-center text-[11px] font-semibold text-[var(--ink)] outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Hit Dice */}
                <div
                  className="bg-[var(--paper)] rounded-xl p-2.5 flex flex-col justify-between min-h-[72px] gap-1.5"
                  title="Один долгий отдых возвращает половину костей (округление вверх). Второй долгий отдых возвращает остальные."
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)] font-medium leading-tight">
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
                      className="bg-[var(--card)] rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer shrink-0"
                    >
                      <option value="d6">d6</option>
                      <option value="d8">d8</option>
                      <option value="d10">d10</option>
                      <option value="d12">d12</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-1">
                    <EditableNumberInput
                      min={0}
                      max={hitDiceMax}
                      value={hitDiceCurrent}
                      onChange={(val) => updateHpAndCombat({ hit_dice_current: val })}
                      ariaLabel="Оставшиеся кости хитов"
                      title="Сколько костей хитов ещё не потрачено"
                      className="w-8 bg-transparent font-serif text-2xl xl:text-[26px] leading-none text-[var(--ink)] outline-none"
                    />
                    <span className="font-serif text-xs text-[var(--muted)] mb-0.5">/ {hitDiceMax}</span>
                  </div>
                </div>

                {/* Spell Save DC & Spellcasting Ability */}
                <div className="bg-[var(--paper)] rounded-xl p-2.5 flex flex-col justify-between min-h-[72px]">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)] font-medium leading-tight">
                      СЛ ЗАКЛИНАНИЙ
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[var(--mist)] shrink-0 mt-0.5" />
                  </div>

                  <div className="flex items-end justify-between gap-1 mt-1.5">
                    <span className="font-serif text-2xl xl:text-[26px] leading-none text-[var(--ink)]">
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
                      className="bg-[var(--card)] rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer"
                    >
                      <option value="none">Нет</option>
                      <option value="int">ИНТ</option>
                      <option value="wis">МДР</option>
                      <option value="cha">ХАР</option>
                    </select>
                  </div>
                </div>

                {/* Spell Attack Bonus */}
                <div className="bg-[var(--paper)] rounded-xl p-2.5 flex flex-col justify-between min-h-[72px]">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)] font-medium leading-tight">
                      АТАКА ЗАКЛИНАНИЕМ
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[var(--mist)] shrink-0 mt-0.5" />
                  </div>

                  <div className="flex items-end mt-1.5">
                    <span
                      className={`font-serif text-2xl xl:text-[26px] leading-none ${
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
                  </div>
                </div>

                {/* Death Saves */}
                <div className="bg-[var(--paper)] rounded-xl p-2.5 flex flex-col justify-between min-h-[72px] gap-1.5">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)] font-medium leading-tight">
                    СПАСБРОСКИ ОТ СМЕРТИ
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--sage)] font-semibold">
                        Успехи
                      </span>
                      <div className="flex items-center gap-1">
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
                              className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-all ${
                                filled
                                  ? 'bg-[var(--sage)]'
                                  : 'bg-[var(--card)] border border-[color-mix(in_srgb,var(--muted)_50%,transparent)] hover:border-[var(--sage)]'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--clay)] font-semibold">
                        Провалы
                      </span>
                      <div className="flex items-center gap-1">
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
                              className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-all ${
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

            {/* Special Features / Custom Resources (Особые умения) */}
            <section className="bg-[var(--card)] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                  Особые умения
                </h2>
                <button
                  type="button"
                  aria-label="Добавить особое умение"
                  title="Добавить умение"
                  disabled={customResources.length >= 20}
                  onClick={() =>
                    addCustomResource({
                      name: '',
                      max: 1,
                      current: 1,
                      reset_on: 'long_rest',
                    })
                  }
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
              </div>

              {customResources.map((resource) => {
                const description = (resource.description ?? '').trim();
                const restTitle =
                  resource.reset_on === 'short_rest'
                    ? 'Восстанавливается в короткий отдых'
                    : resource.reset_on === 'long_rest'
                      ? 'Восстанавливается в долгий отдых'
                      : 'Восстанавливается вручную';

                return (
                  <div
                    key={resource.id}
                    className="bg-[var(--paper)] rounded-xl px-2.5 py-2 space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="relative shrink-0"
                        ref={resourceMenuId === resource.id ? resourceMenuRef : undefined}
                      >
                        <button
                          type="button"
                          aria-label="Настройки и описание умения"
                          aria-expanded={resourceMenuId === resource.id}
                          onClick={() =>
                            setResourceMenuId((current) =>
                              current === resource.id ? null : resource.id
                            )
                          }
                          className={`w-6 h-6 rounded-full inline-flex items-center justify-center cursor-pointer ${
                            resourceMenuId === resource.id
                              ? 'bg-[var(--ink)] text-[var(--paper)]'
                              : 'text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]'
                          }`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {resourceMenuId === resource.id && (
                          <div className="absolute left-0 top-full mt-1.5 z-50 w-60 rounded-2xl bg-[var(--paper)] p-2.5 shadow-lg ring-1 ring-[var(--stone)] space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                                Использований
                              </span>
                              <EditableNumberInput
                                min={1}
                                max={30}
                                value={resource.max}
                                onChange={(val) => {
                                  const nextMax = Math.max(1, Math.min(30, val));
                                  const nextCurrent =
                                    resource.current === resource.max
                                      ? nextMax
                                      : Math.min(resource.current, nextMax);
                                  updateCustomResource(resource.id, {
                                    max: nextMax,
                                    current: nextCurrent,
                                  });
                                }}
                                ariaLabel="Максимум использований"
                                className="w-12 h-6 rounded-full bg-[var(--card)] text-center text-xs font-semibold text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink)]"
                              />
                            </div>

                            <label className="block space-y-1">
                              <span className="block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                                Восстановление
                              </span>
                              <select
                                aria-label="Восстановление умения"
                                value={resource.reset_on}
                                onChange={(e) =>
                                  updateCustomResource(resource.id, {
                                    reset_on: e.target.value as ResourceResetTrigger,
                                  })
                                }
                                className="w-full bg-[var(--card)] rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer"
                              >
                                <option value="short_rest">Короткий отдых</option>
                                <option value="long_rest">Долгий отдых</option>
                                <option value="manual">Вручную</option>
                              </select>
                            </label>

                            <label className="block space-y-1">
                              <span className="block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                                Описание
                              </span>
                              <textarea
                                value={resource.description ?? ''}
                                maxLength={400}
                                rows={3}
                                placeholder="Описание умения"
                                aria-label="Описание особого умения"
                                onChange={(e) =>
                                  updateCustomResource(resource.id, {
                                    description: e.target.value,
                                  })
                                }
                                className="w-full resize-none rounded-lg bg-[var(--card)] px-2 py-1.5 text-xs leading-snug text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      <input
                        type="text"
                        value={resource.name}
                        maxLength={80}
                        placeholder="Название умения"
                        aria-label="Название особого умения"
                        onChange={(e) =>
                          updateCustomResource(resource.id, { name: e.target.value })
                        }
                        className="min-w-0 flex-1 bg-transparent font-serif text-base leading-none text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_50%,transparent)]"
                      />

                      <button
                        type="button"
                        aria-label={`Удалить умение ${resource.name || ''}`.trim()}
                        onClick={() => deleteCustomResource(resource.id)}
                        className="w-6 h-6 rounded-full text-[var(--muted)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-sm leading-none flex items-center justify-center cursor-pointer"
                      >
                        ×
                      </button>
                    </div>

                    {description !== '' && (
                      <p className="text-[11px] leading-snug text-[var(--muted)] whitespace-pre-wrap">
                        {description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <div
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--ink)]"
                        title={restTitle}
                      >
                        {resource.reset_on === 'short_rest' && (
                          <Sun className="w-3.5 h-3.5 text-[var(--ochre)] shrink-0" />
                        )}
                        {resource.reset_on === 'long_rest' && (
                          <Moon className="w-3.5 h-3.5 text-[var(--ochre)] shrink-0" />
                        )}
                        <span>
                          {resource.current}/{resource.max}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                        <ChargePips
                          available={resource.current}
                          max={resource.max}
                          sizeClass="w-5 h-5"
                          onChange={(nextCurrent) =>
                            updateCustomResource(resource.id, { current: nextCurrent })
                          }
                          getAriaLabel={(idx, isAvailable) =>
                            `Использование ${idx + 1} (${
                              isAvailable ? 'доступно' : 'потрачено'
                            })`
                          }
                          availableTitle="Доступно (нажмите, чтобы потратить)"
                          spentTitle="Потрачено (нажмите, чтобы восстановить)"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Passive Features & Traits (Пассивные умения и черты) */}
            <section className="bg-[var(--card)] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                  Пассивные умения и черты
                </h2>
                <button
                  type="button"
                  aria-label="Добавить пассивное умение или черту"
                  title="Добавить пассивное умение или черту"
                  disabled={passiveTraits.length >= 30}
                  onClick={() =>
                    addPassiveTrait({
                      name: '',
                      description: '',
                    })
                  }
                  className="relative w-6 h-6 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
              </div>

              {passiveTraits.map((trait) => {
                const description = trait.description.trim();
                return (
                  <div
                    key={trait.id}
                    className="bg-[var(--paper)] rounded-xl px-2.5 py-2 space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="relative shrink-0"
                        ref={passiveMenuId === trait.id ? passiveMenuRef : undefined}
                      >
                        <button
                          type="button"
                          aria-label="Описание пассивного умения или черты"
                          aria-expanded={passiveMenuId === trait.id}
                          onClick={() =>
                            setPassiveMenuId((current) =>
                              current === trait.id ? null : trait.id
                            )
                          }
                          className={`w-6 h-6 rounded-full inline-flex items-center justify-center cursor-pointer ${
                            passiveMenuId === trait.id
                              ? 'bg-[var(--ink)] text-[var(--paper)]'
                              : 'text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]'
                          }`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {passiveMenuId === trait.id && (
                          <div className="absolute left-0 top-full mt-1.5 z-50 w-56 rounded-2xl bg-[var(--paper)] p-2.5 shadow-lg ring-1 ring-[var(--stone)] space-y-2">
                            <label className="block space-y-1">
                              <span className="block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-medium">
                                Описание
                              </span>
                              <textarea
                                value={trait.description}
                                maxLength={800}
                                rows={4}
                                placeholder="Эффект или заметка"
                                aria-label="Описание пассивного умения или черты"
                                onChange={(e) =>
                                  updatePassiveTrait(trait.id, {
                                    description: e.target.value,
                                  })
                                }
                                className="w-full resize-y rounded-lg bg-[var(--card)] px-2 py-1.5 text-xs leading-snug text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      <input
                        type="text"
                        value={trait.name}
                        maxLength={80}
                        placeholder="Название умения или черты"
                        aria-label="Название пассивного умения или черты"
                        onChange={(e) =>
                          updatePassiveTrait(trait.id, { name: e.target.value })
                        }
                        className="min-w-0 flex-1 bg-transparent font-serif text-base leading-none text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_50%,transparent)]"
                      />

                      <button
                        type="button"
                        aria-label={`Удалить умение ${trait.name || ''}`.trim()}
                        onClick={() => {
                          if (passiveMenuId === trait.id) setPassiveMenuId(null);
                          deletePassiveTrait(trait.id);
                        }}
                        className="w-6 h-6 rounded-full text-[var(--muted)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-sm leading-none flex items-center justify-center cursor-pointer transition-colors"
                      >
                        ×
                      </button>
                    </div>

                    {description && (
                      <p className="text-[11px] leading-snug text-[var(--muted)] whitespace-pre-wrap">
                        {description}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>

          </div>
        </main>
        )}

        {/* =================================================================== */}
        {/* INVENTORY & SPELLS WORKSPACE                                        */}
        {/* =================================================================== */}
        {activeDockTab === 'inventory' && (
          <main className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            {/* Left Column: Carry Weight Calculator, Inventory & Bag of Holding */}
            <div className="space-y-3">
              {/* Standalone Compact D&D 5.5e Carry Weight Calculator */}
              <section
                title={`Тяга / подъём: до ${pushDragLiftLimit} фт (${pushDragLiftLimitKg} кг)`}
                className="bg-[var(--card)] rounded-2xl px-3.5 py-2.5 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    ВЕС ИНВЕНТАРЯ
                  </h2>

                  <label className="inline-flex items-center gap-1.5 rounded-full bg-[var(--paper)] px-2.5 py-0.5 text-[10px] text-[var(--muted)]">
                    <span className="uppercase tracking-[0.12em] font-medium">
                      Размер:
                    </span>
                    <select
                      aria-label="Размер персонажа"
                      title="Размер персонажа для расчёта грузоподъёмности (D&D 5.5e)"
                      value={size}
                      onChange={(e) =>
                        updateIdentity({ size: e.target.value as CreatureSize })
                      }
                      className="bg-transparent text-[10px] uppercase tracking-wider font-semibold text-[var(--ink)] outline-none cursor-pointer"
                    >
                      {CREATURE_SIZE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} (×{opt.multiplier})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <CarryWeightMeter
                  rawUsedPounds={rawTotalInventoryPounds}
                  capacityPounds={carryingCapacity}
                  extraUsedNote={
                    bagOfHoldingEnabled ? (
                      <span
                        title={`Активная Сумка хранения весит ${BAG_OF_HOLDING_SELF_WEIGHT_POUNDS} фт (${poundsToKg(BAG_OF_HOLDING_SELF_WEIGHT_POUNDS)} кг) независимо от содержимого`}
                        className="rounded-full bg-[var(--paper)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--muted)]"
                      >
                        +{BAG_OF_HOLDING_SELF_WEIGHT_POUNDS} фт сумка
                      </span>
                    ) : undefined
                  }
                  overloadNote={
                    rawTotalInventoryPounds <= pushDragLiftLimit
                      ? `Макс. скорость 5 фт (тяга до ${pushDragLiftLimit} фт / ${pushDragLiftLimitKg} кг)`
                      : `Превышен лимит тяги (${pushDragLiftLimit} фт / ${pushDragLiftLimitKg} кг)`
                  }
                />
              </section>

              {/* Main Character Inventory */}
              <section className="bg-[var(--card)] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    ИНВЕНТАРЬ
                  </h2>

                  <button
                    type="button"
                    aria-label="Добавить предмет в инвентарь"
                    title="Добавить предмет"
                    onClick={() =>
                      addInventoryItem({
                        name: '',
                        description: '',
                        weight: 0,
                        weightUnit: 'lb',
                        quantity: 1,
                        chargesCurrent: 0,
                        chargesMax: 0,
                      })
                    }
                    className="relative w-6 h-6 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors cursor-pointer"
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
                </div>

                <InventoryItemsList
                  characterId={activeCharacter.id}
                  items={inventory}
                  onUpdate={updateInventoryItem}
                  onDelete={deleteInventoryItem}
                  onReorder={reorderInventoryItem}
                />
              </section>

              {/* Bag of Holding (D&D 5.5e) */}
              {!bagOfHoldingEnabled ? (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setBagOfHoldingEnabled(true)}
                    title={`Активировать Сумку хранения (D&D 5.5e: до ${BAG_OF_HOLDING_CAPACITY_POUNDS} фт / ${poundsToKg(BAG_OF_HOLDING_CAPACITY_POUNDS)} кг, ${BAG_OF_HOLDING_VOLUME_CUBIC_FEET} куб. фт, сама сумка весит ${BAG_OF_HOLDING_SELF_WEIGHT_POUNDS} фт)`}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--card)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-[var(--ink)] px-3.5 py-1.5 text-xs font-medium tracking-wide transition-colors cursor-pointer"
                  >
                    <Backpack className="w-3.5 h-3.5" />
                    <span>
                      Сумка хранения
                      {bagOfHoldingItems.length > 0
                        ? ` (${bagOfHoldingItems.length})`
                        : ''}
                    </span>
                  </button>
                </div>
              ) : (
                <section className="bg-[var(--card)] rounded-2xl p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Backpack className="w-3.5 h-3.5 text-[var(--muted)]" />
                      <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                        СУМКА ХРАНЕНИЯ
                      </h2>
                      <span
                        title={`Правила D&D 5.5e (2024): до ${BAG_OF_HOLDING_CAPACITY_POUNDS} фт (${poundsToKg(BAG_OF_HOLDING_CAPACITY_POUNDS)} кг) и ${BAG_OF_HOLDING_VOLUME_CUBIC_FEET} куб. фт (2×2×4 фт). Вес самой сумки — ${BAG_OF_HOLDING_SELF_WEIGHT_POUNDS} фт (${poundsToKg(BAG_OF_HOLDING_SELF_WEIGHT_POUNDS)} кг) независимо от содержимого. Достать предмет — действие «Использование».`}
                        className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[9px] uppercase tracking-wider font-semibold text-[var(--muted)] tabular-nums"
                      >
                        {BAG_OF_HOLDING_CAPACITY_POUNDS} фт ·{' '}
                        {BAG_OF_HOLDING_VOLUME_CUBIC_FEET} куб. фт
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBagOfHoldingEnabled(false)}
                        title="Деактивировать Сумку хранения (предметы сохранятся, +5 фт уберутся из веса персонажа)"
                        className="rounded-full bg-[var(--paper)] px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                      >
                        Скрыть
                      </button>

                      <button
                        type="button"
                        aria-label="Добавить предмет в Сумку хранения"
                        title="Добавить предмет в Сумку хранения"
                        onClick={() =>
                          addBagOfHoldingItem({
                            name: '',
                            description: '',
                            weight: 0,
                            weightUnit: 'lb',
                            quantity: 1,
                            chargesCurrent: 0,
                            chargesMax: 0,
                          })
                        }
                        className="relative w-6 h-6 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors cursor-pointer"
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
                    </div>
                  </div>

                  {/* Dedicated D&D 5.5e Bag of Holding Weight Calculator */}
                  <div className="bg-[var(--paper)] rounded-xl px-3 py-2">
                    <CarryWeightMeter
                      rawUsedPounds={rawTotalBagPounds}
                      capacityPounds={BAG_OF_HOLDING_CAPACITY_POUNDS}
                      barTrackClass="bg-[var(--card)]"
                      overloadNote={`Перегруз (> ${BAG_OF_HOLDING_CAPACITY_POUNDS} фт)! По правилам D&D 5.5e сумка рвётся, содержимое рассеивается на Астральном плане.`}
                    />
                  </div>

                  <InventoryItemsList
                    characterId={activeCharacter.id}
                    items={bagOfHoldingItems}
                    onUpdate={updateBagOfHoldingItem}
                    onDelete={deleteBagOfHoldingItem}
                    onReorder={reorderBagOfHoldingItem}
                    emptyHint={`Вместимость до ${BAG_OF_HOLDING_CAPACITY_POUNDS} фт (${BAG_OF_HOLDING_VOLUME_CUBIC_FEET} куб. фт). Вес сумки — ${BAG_OF_HOLDING_SELF_WEIGHT_POUNDS} фт независимо от содержимого; достать предмет — действие «Использование».`}
                  />
                </section>
              )}
            </div>

            {/* Right Column: Currency & Spells */}
            <div className="space-y-3">
              {/* Compact Currency Card */}
              <section className="bg-[var(--card)] rounded-2xl px-3.5 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    ЗОЛОТО И ВАЛЮТА
                  </h2>
                  <span
                    title="1 ПМ = 10 ЗМ = 100 СМ = 1000 ММ"
                    className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[9px] uppercase tracking-wider font-semibold text-[var(--muted)] tabular-nums"
                  >
                    Всего: {Math.round(totalCopper) / 100} зм
                  </span>
                </div>

                {/* All 4 Currencies Display (Compact Horizontal Tiles) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {CURRENCY_META.map((meta) => (
                    <label
                      key={meta.code}
                      title={`${meta.label} (${meta.short}) — можно вписать количество`}
                      className={`bg-[var(--paper)] rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-1.5 cursor-text ${
                        meta.highlight
                          ? 'ring-1 ring-[color-mix(in_srgb,var(--ochre)_45%,transparent)]'
                          : ''
                      }`}
                    >
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span
                          aria-hidden="true"
                          className={`w-2 h-2 rounded-full ${meta.dotClass}`}
                        />
                        <span className="flex flex-col leading-none">
                          <span
                            className={`text-[10px] uppercase tracking-[0.1em] font-semibold ${
                              meta.highlight
                                ? 'text-[var(--ochre)]'
                                : 'text-[var(--ink)]'
                            }`}
                          >
                            {meta.short}
                          </span>
                          <span className="text-[8px] text-[var(--muted)] mt-0.5">
                            {meta.label}
                          </span>
                        </span>
                      </span>
                      <EditableNumberInput
                        min={0}
                        max={9999999}
                        value={currency[meta.code]}
                        ariaLabel={`${meta.label} (${meta.short})`}
                        title={`${meta.label} — можно вписать количество`}
                        onChange={(val) => setCurrencyCoin(meta.code, val)}
                        className="w-full min-w-0 bg-transparent text-right font-serif text-lg leading-none font-semibold text-[var(--ink)] outline-none tabular-nums"
                      />
                    </label>
                  ))}
                </div>

                {/* Compact Deposit / Spend Calculator */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitCurrencyTransaction();
                  }}
                  className="bg-[var(--paper)] rounded-xl px-2 py-1.5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="bg-[var(--card)] rounded-full p-0.5 inline-flex shrink-0">
                      <button
                        type="button"
                        onClick={() => setCurrencyTxMode('add')}
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer ${
                          currencyTxMode === 'add'
                            ? 'bg-[var(--ink)] text-[var(--paper)]'
                            : 'text-[var(--muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        Внести
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrencyTxMode('spend')}
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer ${
                          currencyTxMode === 'spend'
                            ? 'bg-[var(--clay)] text-[var(--paper)]'
                            : 'text-[var(--muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        Трата
                      </button>
                    </div>

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={currencyTxAmount}
                      placeholder="Сумма"
                      aria-label="Сумма операции"
                      onChange={(e) =>
                        setCurrencyTxAmount(e.target.value.replace(/[^0-9]/g, ''))
                      }
                      className="w-20 flex-1 min-w-[4.5rem] h-6 rounded-lg bg-[var(--card)] px-2 text-xs font-semibold tabular-nums text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink)] placeholder:text-[color-mix(in_srgb,var(--muted)_55%,transparent)]"
                    />

                    <select
                      value={currencyTxCoin}
                      aria-label="Валюта операции"
                      onChange={(e) =>
                        setCurrencyTxCoin(e.target.value as CurrencyCode)
                      }
                      className="h-6 rounded-lg bg-[var(--card)] px-2 text-[11px] font-semibold text-[var(--ink)] outline-none cursor-pointer"
                    >
                      {CURRENCY_META.map((meta) => (
                        <option key={meta.code} value={meta.code}>
                          {meta.short} ({meta.label})
                        </option>
                      ))}
                    </select>

                    <button
                      type="submit"
                      disabled={!currencyTxPreview?.ok}
                      className="h-6 rounded-full bg-[var(--ink)] text-[var(--paper)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 text-[10px] uppercase tracking-wider font-semibold transition-opacity cursor-pointer shrink-0"
                    >
                      {currencyTxMode === 'add' ? '+ Внести' : '− Списать'}
                    </button>
                  </div>

                  {currencyTxPreview && (
                    <div className="text-[11px] leading-none tabular-nums">
                      {currencyTxPreview.ok ? (
                        <span className="text-[var(--muted)]">
                          Станет:{' '}
                          <strong className="font-semibold text-[var(--ink)]">
                            {currencyTxPreview.next.pp} ПМ ·{' '}
                            {currencyTxPreview.next.gp} ЗМ ·{' '}
                            {currencyTxPreview.next.sp} СМ ·{' '}
                            {currencyTxPreview.next.cp} ММ
                          </strong>
                        </span>
                      ) : (
                        <span className="text-[var(--clay)] font-medium">
                          Недостаточно средств (всего {Math.round(totalCopper) / 100} зм)
                        </span>
                      )}
                    </div>
                  )}
                </form>
              </section>

              <section className="bg-[var(--card)] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2.5">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
                    ЗАКЛИНАНИЯ
                  </h2>
                  <span className="text-[11px] font-serif text-[var(--muted)]">
                    {knownSlugs.length > 0 ? `Всего: ${knownSlugs.length}` : '0'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSpellModalOpen(true)}
                  aria-label="Добавить заклинание из справочника"
                  title="Добавить заклинание из справочника"
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-xs font-medium tracking-wide transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </button>
              </div>

              {/* Character's added spells list */}
              {knownSlugs.length === 0 ? (
                <div className="py-12 px-4 text-center rounded-xl bg-[var(--paper)]/50 border border-dashed border-[var(--line)] flex flex-col items-center justify-center space-y-2">
                  <Sparkles className="w-6 h-6 text-[var(--muted)]" />
                  <p className="font-serif text-sm text-[var(--muted)]">
                    Заклинания пока не добавлены
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsSpellModalOpen(true)}
                    className="text-xs text-[var(--ink)] underline hover:text-[var(--muted)] cursor-pointer"
                  >
                    Нажмите здесь, чтобы выбрать из справочника
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => {
                    const spellsAtLevel = characterSpellsByLevel[lvl];
                    if (!spellsAtLevel || spellsAtLevel.length === 0) return null;

                    return (
                      <div key={lvl} className="space-y-1.5">
                        {/* Circle Header */}
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-[var(--muted)]">
                            {SPELL_LEVEL_LABELS[lvl]}
                          </span>
                          <span className="text-[10px] text-[var(--muted)]">
                            {spellsAtLevel.length}
                          </span>
                        </div>

                        {/* List of spells in this circle */}
                        <div className="space-y-1.5">
                          {spellsAtLevel.map((spell) => {
                            const meta = spell.metadata as
                              | {
                                  school?: string;
                                  castingTime?: string;
                                  range?: string;
                                  components?: string;
                                  duration?: string;
                                  concentration?: boolean;
                                  ritual?: boolean;
                                  classes?: string[];
                                  ruName?: string;
                                  enName?: string;
                                }
                              | undefined;
                            const isExpanded = expandedSpellSlugs.has(spell.slug);
                            const isPrepared = preparedSlugs.includes(spell.slug);

                            return (
                              <div
                                key={spell.slug}
                                className="bg-[var(--paper)] rounded-xl px-3 py-2 space-y-2 transition-all border border-transparent hover:border-[var(--line)]"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {/* Preparation toggle circle for leveled spells */}
                                    {lvl > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => togglePreparedSpell(spell.slug)}
                                        title={
                                          isPrepared
                                            ? 'Заклинание подготовлено'
                                            : 'Заклинание не подготовлено'
                                        }
                                        aria-label={
                                          isPrepared
                                            ? 'Снять подготовку заклинания'
                                            : 'Подготовить заклинание'
                                        }
                                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                                          isPrepared
                                            ? 'bg-[var(--ink)] border-[var(--ink)] text-[var(--paper)]'
                                            : 'border-[var(--muted)]/60 hover:border-[var(--ink)]'
                                        }`}
                                      >
                                        {isPrepared && <Check className="w-2.5 h-2.5" />}
                                      </button>
                                    )}

                                    <div className="min-w-0">
                                      <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <span className="font-serif text-sm font-medium text-[var(--ink)] leading-snug">
                                          {meta?.ruName || spell.title}
                                        </span>
                                        {meta?.enName && (
                                          <span className="text-xs font-serif italic text-[var(--muted)]">
                                            ({meta.enName})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Badges & actions */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {meta?.school && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--muted)]">
                                        {meta.school}
                                      </span>
                                    )}
                                    {meta?.concentration && (
                                      <span
                                        title="Концентрация"
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                      >
                                        К
                                      </span>
                                    )}
                                    {meta?.ritual && (
                                      <span
                                        title="Ритуал"
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300"
                                      >
                                        Р
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => toggleSpellExpanded(spell.slug)}
                                      aria-label="Подробнее"
                                      className="w-6 h-6 rounded-full text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)] flex items-center justify-center cursor-pointer transition-colors"
                                    >
                                      {isExpanded ? (
                                        <ChevronUp className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => removeSpellFromCharacter(spell.slug)}
                                      aria-label={`Удалить ${spell.title}`}
                                      className="w-6 h-6 rounded-full text-[var(--muted)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-sm flex items-center justify-center cursor-pointer transition-colors"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>

                                {/* Meta line */}
                                <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-serif flex-wrap">
                                  {meta?.castingTime && <span>{meta.castingTime}</span>}
                                  {meta?.range && <span>• {meta.range}</span>}
                                  {meta?.duration && <span>• {meta.duration}</span>}
                                </div>

                                {/* Expanded text */}
                                {isExpanded && (
                                  <div className="pt-2 border-t border-[var(--line)]/50 text-xs space-y-1.5 text-[var(--ink)]">
                                    {meta?.components && (
                                      <p className="text-[11px] text-[var(--muted)]">
                                        <span className="font-semibold text-[var(--ink)]">
                                          Компоненты:
                                        </span>{' '}
                                        {meta.components}
                                      </p>
                                    )}
                                    {meta?.classes && meta.classes.length > 0 && (
                                      <p className="text-[11px] text-[var(--muted)]">
                                        <span className="font-semibold text-[var(--ink)]">
                                          Классы:
                                        </span>{' '}
                                        {meta.classes.join(', ')}
                                      </p>
                                    )}
                                    {spell.raw_content && (
                                      <div className="whitespace-pre-wrap leading-relaxed font-serif text-xs opacity-90 pt-1">
                                        {spell.raw_content}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </section>
            </div>
          </main>
        )}

        {/* =================================================================== */}
        {/* OBSIDIAN LIBRARY WORKSPACE                                          */}
        {/* =================================================================== */}
        {activeDockTab === 'compendium' && (
          <main className="space-y-4">
            <section className="bg-[var(--card)] rounded-2xl p-4 sm:p-6 space-y-4">
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] font-medium">
                      Библиотека кампании
                    </span>
                    <span className="text-[10px] bg-[var(--paper)] px-2 py-0.5 rounded-full font-semibold text-[var(--ink)] tabular-nums">
                      {vaultTotalFiles} документов .md
                    </span>
                  </div>
                  <h2 className="font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)]">
                    Справочник Obsidian
                  </h2>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => void syncVaultWithGit()}
                    disabled={isVaultSyncing}
                    title="Подтянуть свежие изменения из репозитория GitHub"
                    className="rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] px-3.5 py-1.5 text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isVaultSyncing ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {isVaultSyncing ? 'Синхронизация...' : 'Синхронизировать'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSpellModalOpen(true)}
                    className="rounded-full bg-[var(--ink)] text-[var(--paper)] px-4 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Фильтр заклинаний</span>
                  </button>
                </div>
              </div>

              {/* 2-Column Explorer: Left Tree, Right Reader */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Left Column: Folder & File Explorer (4 cols) */}
                <div className="lg:col-span-4 bg-[var(--paper)]/60 rounded-2xl p-3 border border-[var(--line)] flex flex-col space-y-2.5 max-h-[75vh]">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={vaultSearchQuery}
                      onChange={(e) => setVaultSearchQuery(e.target.value)}
                      placeholder="Поиск по документам..."
                      className="w-full bg-[var(--card)] rounded-xl pl-8 pr-7 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] border border-[var(--line)] outline-none focus:border-[var(--ink)] transition-colors"
                    />
                    {vaultSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setVaultSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between text-[11px] text-[var(--muted)] px-1">
                    <span>
                      {vaultSearchQuery ? 'Найдено' : 'Структура'}:{' '}
                      {filteredVaultTree.length} папок/файлов
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={expandAllVaultFolders}
                        className="hover:text-[var(--ink)] underline cursor-pointer"
                      >
                        Развернуть всё
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={collapseAllVaultFolders}
                        className="hover:text-[var(--ink)] underline cursor-pointer"
                      >
                        Свернуть
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Tree */}
                  <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
                    {isVaultLoading ? (
                      <div className="py-12 text-center text-xs text-[var(--muted)] flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--sage)]" />
                        <span>Чтение хранилища...</span>
                      </div>
                    ) : filteredVaultTree.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[var(--muted)] font-serif">
                        {vaultSearchQuery
                          ? 'Документы по запросу не найдены'
                          : 'Хранилище пусто'}
                      </div>
                    ) : (
                      filteredVaultTree.map((node) => renderVaultTreeNode(node))
                    )}
                  </div>
                </div>

                {/* Right Column: Document Viewer (8 cols) */}
                <div className="lg:col-span-8 bg-[var(--paper)]/40 rounded-2xl p-5 md:p-7 border border-[var(--line)] flex flex-col min-h-[550px]">
                  {isVaultFileLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-20 space-y-2">
                      <Loader2 className="w-7 h-7 animate-spin text-[var(--sage)]" />
                      <p className="font-serif italic text-sm text-[var(--muted)]">
                        Загрузка документа...
                      </p>
                    </div>
                  ) : selectedVaultFile ? (
                    <div className="space-y-4">
                      {/* Top Bar: Breadcrumbs & Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                        <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] flex-wrap">
                          {selectedVaultFile.path
                            .split('/')
                            .map((part, idx, arr) => (
                              <React.Fragment key={idx}>
                                {idx > 0 && <span className="opacity-40">/</span>}
                                <span
                                  className={
                                    idx === arr.length - 1
                                      ? 'text-[var(--ink)] font-semibold'
                                      : 'hover:text-[var(--ink)] cursor-pointer'
                                  }
                                  onClick={() => {
                                    if (idx < arr.length - 1) {
                                      const folderPath = arr
                                        .slice(0, idx + 1)
                                        .join('/');
                                      toggleVaultFolder(folderPath);
                                    }
                                  }}
                                >
                                  {part.replace(/\.md$/i, '')}
                                </span>
                              </React.Fragment>
                            ))}
                        </div>

                        {matchingSpellForSelectedVaultFile && activeCharacter && (
                          <div>
                            {knownSlugs.includes(
                              matchingSpellForSelectedVaultFile.slug
                            ) ? (
                              <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-medium inline-flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5" />
                                <span>В книге заклинаний</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  addSpellToCharacter(
                                    matchingSpellForSelectedVaultFile.slug
                                  )
                                }
                                className="px-3 py-1 rounded-full bg-[var(--ink)] text-[var(--paper)] text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Добавить персонажу</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Document Title */}
                      <h1 className="font-serif text-2xl md:text-3xl font-bold text-[var(--ink)] leading-tight">
                        {selectedVaultFile.title}
                      </h1>

                      {/* Rendered Markdown Body */}
                      <div
                        className="markdown-body overflow-y-auto max-h-[65vh] pr-2 scrollbar-thin"
                        onClick={handleMarkdownClick}
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(selectedVaultFile.content),
                        }}
                      />
                    </div>
                  ) : (
                    /* Welcome View when no file is chosen */
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 space-y-6 max-w-xl mx-auto">
                      <div className="space-y-2">
                        <div className="w-12 h-12 rounded-full bg-[var(--card)] text-[var(--sage)] flex items-center justify-center mx-auto shadow-xs">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                          Библиотека кампании D&amp;D 5.5e
                        </h3>
                        <p className="font-serif italic text-sm text-[var(--muted)]">
                          Все материалы, правила, виды, заклинания и черты из вашего репозитория Obsidian собраны здесь.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                        <div
                          onClick={() => {
                            toggleVaultFolder('Справочник/Виды');
                            void loadVaultFile(
                              'Справочник/Виды D&D 2024 (Species Overview).md'
                            );
                          }}
                          className="bg-[var(--card)] hover:ring-1 hover:ring-[var(--ink)] p-3.5 rounded-2xl cursor-pointer transition-all space-y-1"
                        >
                          <div className="flex items-center gap-2 font-serif font-semibold text-[var(--ink)] text-sm">
                            <span className="text-[var(--ochre)]">◈</span>
                            <span>Виды (Species)</span>
                          </div>
                          <p className="text-xs text-[var(--muted)]">
                            10 видов D&amp;D 2024 (Аасимар, Эльф, Дварф, Человек...)
                          </p>
                        </div>

                        <div
                          onClick={() => {
                            toggleVaultFolder('Справочник/Заклинания');
                            void loadVaultFile(
                              'Справочник/Справочник D&D 5.5e (Compendium).md'
                            );
                          }}
                          className="bg-[var(--card)] hover:ring-1 hover:ring-[var(--ink)] p-3.5 rounded-2xl cursor-pointer transition-all space-y-1"
                        >
                          <div className="flex items-center gap-2 font-serif font-semibold text-[var(--ink)] text-sm">
                            <span className="text-[var(--sage)]">◈</span>
                            <span>Заклинания (Spells)</span>
                          </div>
                          <p className="text-xs text-[var(--muted)]">
                            399 заклинаний по кругам (0–9) и классам
                          </p>
                        </div>

                        <div
                          onClick={() => {
                            toggleVaultFolder('Справочник/Правила');
                            void loadVaultFile(
                              'Справочник/Правила/Сводка правил D&D 5.5e (Rules Overview).md'
                            );
                          }}
                          className="bg-[var(--card)] hover:ring-1 hover:ring-[var(--ink)] p-3.5 rounded-2xl cursor-pointer transition-all space-y-1"
                        >
                          <div className="flex items-center gap-2 font-serif font-semibold text-[var(--ink)] text-sm">
                            <span className="text-[var(--sea)]">◈</span>
                            <span>Правила (Rules)</span>
                          </div>
                          <p className="text-xs text-[var(--muted)]">
                            Действия, мастерство оружия, состояния, хоумбрю
                          </p>
                        </div>

                        <div
                          onClick={() => {
                            toggleVaultFolder('Справочник/Черты');
                            void loadVaultFile(
                              'Справочник/Черты D&D 2024 (Feats Overview).md'
                            );
                          }}
                          className="bg-[var(--card)] hover:ring-1 hover:ring-[var(--ink)] p-3.5 rounded-2xl cursor-pointer transition-all space-y-1"
                        >
                          <div className="flex items-center gap-2 font-serif font-semibold text-[var(--ink)] text-sm">
                            <span className="text-[var(--clay)]">◈</span>
                            <span>Черты (Feats)</span>
                          </div>
                          <p className="text-xs text-[var(--muted)]">
                            62 черты для персонажей редакции 2024
                          </p>
                        </div>
                      </div>

                      <p className="text-[11px] text-[var(--muted)]">
                        Выберите любой документ в дереве слева для чтения
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </main>
        )}

        {/* =================================================================== */}
        {/* NOTES WORKSPACE                                                     */}
        {/* =================================================================== */}
        {activeDockTab === 'notes' && <NotesPage />}

        {/* =================================================================== */}
        {/* MODAL: ADD SPELL FROM COMPENDIUM                                    */}
        {/* =================================================================== */}
        {isSpellModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6"
            onClick={() => setIsSpellModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--card)] text-[var(--ink)] w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[var(--line)]"
            >
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-[var(--ink)]">
                    Справочник заклинаний
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    D&amp;D 5.5e (2024) • {compendiumSpells.length} заклинаний в базе Obsidian
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSpellModalOpen(false)}
                  aria-label="Закрыть окно заклинаний"
                  className="w-8 h-8 rounded-full bg-[var(--paper)] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--line)] flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Filter Toolbar */}
              <div className="p-4 border-b border-[var(--line)] bg-[var(--paper)]/50 space-y-3">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={spellSearchQuery}
                    onChange={(e) => setSpellSearchQuery(e.target.value)}
                    placeholder="Поиск по названию (рус/англ) или описанию..."
                    aria-label="Поиск заклинания"
                    className="w-full bg-[var(--card)] rounded-xl pl-9 pr-8 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] border border-[var(--line)] outline-none focus:border-[var(--ink)] transition-colors"
                  />
                  {spellSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSpellSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Level Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  <button
                    type="button"
                    onClick={() => setSpellLevelFilter('all')}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                      spellLevelFilter === 'all'
                        ? 'bg-[var(--ink)] text-[var(--paper)]'
                        : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--line)]'
                    }`}
                  >
                    Все круги
                  </button>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSpellLevelFilter(lvl)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                        spellLevelFilter === lvl
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--line)]'
                      }`}
                    >
                      {lvl === 0 ? 'Заговоры' : `${lvl} круг`}
                    </button>
                  ))}
                </div>

                {/* Dropdowns & Toggles Row */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {/* Class Select */}
                  <select
                    value={spellClassFilter}
                    onChange={(e) => setSpellClassFilter(e.target.value)}
                    className="bg-[var(--card)] text-[var(--ink)] px-2.5 py-1.5 rounded-xl border border-[var(--line)] outline-none cursor-pointer"
                  >
                    <option value="all">Все классы</option>
                    {SPELL_CLASSES.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>

                  {/* School Select */}
                  <select
                    value={spellSchoolFilter}
                    onChange={(e) => setSpellSchoolFilter(e.target.value)}
                    className="bg-[var(--card)] text-[var(--ink)] px-2.5 py-1.5 rounded-xl border border-[var(--line)] outline-none cursor-pointer"
                  >
                    <option value="all">Все школы</option>
                    {SPELL_SCHOOLS.map((sch) => (
                      <option key={sch} value={sch}>
                        {sch}
                      </option>
                    ))}
                  </select>

                  {/* Concentration Toggle */}
                  <button
                    type="button"
                    onClick={() => setSpellConcentrationFilter((p) => !p)}
                    className={`px-2.5 py-1.5 rounded-xl border cursor-pointer transition-colors font-medium ${
                      spellConcentrationFilter
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-[var(--card)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Концентрация
                  </button>

                  {/* Ritual Toggle */}
                  <button
                    type="button"
                    onClick={() => setSpellRitualFilter((p) => !p)}
                    className={`px-2.5 py-1.5 rounded-xl border cursor-pointer transition-colors font-medium ${
                      spellRitualFilter
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-[var(--card)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Ритуал
                  </button>

                  {/* Reset Filters */}
                  {(spellSearchQuery ||
                    spellLevelFilter !== 'all' ||
                    spellClassFilter !== 'all' ||
                    spellSchoolFilter !== 'all' ||
                    spellConcentrationFilter ||
                    spellRitualFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSpellSearchQuery('');
                        setSpellLevelFilter('all');
                        setSpellClassFilter('all');
                        setSpellSchoolFilter('all');
                        setSpellConcentrationFilter(false);
                        setSpellRitualFilter(false);
                      }}
                      className="text-xs text-[var(--muted)] hover:text-[var(--ink)] underline cursor-pointer ml-auto"
                    >
                      Сбросить фильтры
                    </button>
                  )}
                </div>
              </div>

              {/* Results Count Header */}
              <div className="px-5 py-2 bg-[var(--card)] border-b border-[var(--line)] flex items-center justify-between text-xs text-[var(--muted)]">
                <span>Найдено заклинаний: {filteredCompendiumSpells.length}</span>
                <span>Добавлено персонажу: {knownSlugs.length}</span>
              </div>

              {/* Spell Results List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {filteredCompendiumSpells.length === 0 ? (
                  <div className="text-center py-12 text-[var(--muted)] font-serif text-sm">
                    Заклинания по заданным фильтрам не найдены
                  </div>
                ) : (
                  filteredCompendiumSpells.map((spell) => {
                    const meta = spell.metadata as
                      | {
                          spellLevel?: number;
                          school?: string;
                          castingTime?: string;
                          range?: string;
                          components?: string;
                          duration?: string;
                          concentration?: boolean;
                          ritual?: boolean;
                          classes?: string[];
                          ruName?: string;
                          enName?: string;
                        }
                      | undefined;
                    const isKnown = knownSlugs.includes(spell.slug);
                    const isExpanded = expandedSpellSlugs.has(spell.slug);

                    return (
                      <div
                        key={spell.slug}
                        className="bg-[var(--paper)] rounded-2xl p-3.5 space-y-2 border border-transparent hover:border-[var(--line)] transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
                                {meta?.ruName || spell.title}
                              </h3>
                              {meta?.enName && (
                                <span className="text-xs font-serif italic text-[var(--muted)]">
                                  ({meta.enName})
                                </span>
                              )}
                            </div>

                            {/* Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                              <span className="px-2 py-0.5 rounded-full bg-[var(--card)] font-medium text-[var(--ink)]">
                                {meta?.spellLevel === 0 ? 'Заговор' : `${meta?.spellLevel} круг`}
                              </span>
                              {meta?.school && (
                                <span className="px-2 py-0.5 rounded-full bg-[var(--card)] text-[var(--muted)]">
                                  {meta.school}
                                </span>
                              )}
                              {meta?.concentration && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                                  Концентрация
                                </span>
                              )}
                              {meta?.ritual && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium">
                                  Ритуал
                                </span>
                              )}
                              {meta?.castingTime && (
                                <span className="text-[var(--muted)]">
                                  • {meta.castingTime}
                                </span>
                              )}
                              {meta?.range && (
                                <span className="text-[var(--muted)]">
                                  • {meta.range}
                                </span>
                              )}
                            </div>

                            {meta?.classes && meta.classes.length > 0 && (
                              <p className="text-[11px] text-[var(--muted)] font-serif">
                                Классы: {meta.classes.join(', ')}
                              </p>
                            )}
                          </div>

                          {/* Add / Added Button */}
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleSpellExpanded(spell.slug)}
                              aria-label="Подробнее"
                              className="p-1.5 rounded-full text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>

                            {isKnown ? (
                              <button
                                type="button"
                                onClick={() => removeSpellFromCharacter(spell.slug)}
                                title="Нажмите, чтобы удалить из книги"
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-rose-500/15 hover:text-rose-600 text-xs font-medium transition-colors cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Добавлено</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addSpellToCharacter(spell.slug)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--ink)] text-[var(--paper)] hover:opacity-90 text-xs font-medium transition-opacity cursor-pointer shadow-xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Добавить</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-[var(--line)]/60 text-xs space-y-2 text-[var(--ink)]">
                            <div className="grid grid-cols-2 gap-2 text-[11px] bg-[var(--card)] p-2.5 rounded-xl text-[var(--muted)]">
                              <div>
                                <strong className="text-[var(--ink)]">Время:</strong>{' '}
                                {meta?.castingTime || '—'}
                              </div>
                              <div>
                                <strong className="text-[var(--ink)]">Дистанция:</strong>{' '}
                                {meta?.range || '—'}
                              </div>
                              <div>
                                <strong className="text-[var(--ink)]">Длительность:</strong>{' '}
                                {meta?.duration || '—'}
                              </div>
                              <div>
                                <strong className="text-[var(--ink)]">Компоненты:</strong>{' '}
                                {meta?.components || '—'}
                              </div>
                            </div>
                            {spell.raw_content && (
                              <div className="whitespace-pre-wrap leading-relaxed font-serif text-xs opacity-90 pt-1">
                                {spell.raw_content}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
