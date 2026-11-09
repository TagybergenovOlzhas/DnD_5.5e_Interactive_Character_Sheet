import { create } from 'zustand';
import {
  type AbilityKey,
  type Character,
  type CharacterHp,
  type CharacterStats,
  type ProficiencyRank,
  type SkillKey,
  type UpdateCharacterPatch,
  type WeaponAttack,
} from '@shared/types';
import { hitDiceAfterLongRest, MAX_EXHAUSTION_LEVEL } from '@shared/rulesEngine';

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPatches = new Map<string, UpdateCharacterPatch>();

function clampSkillBonus(value: number): number {
  return Math.max(-150, Math.min(150, Math.trunc(value)));
}

const WEAPON_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

function normalizeWeaponAttacks(raw: WeaponAttack[] | undefined): WeaponAttack[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((attack, index) => {
    const ability = WEAPON_ABILITIES.includes(attack?.ability) ? attack.ability : 'str';
    return {
      id: typeof attack?.id === 'string' && attack.id.trim() !== '' ? attack.id : `weapon-${index}`,
      name: typeof attack?.name === 'string' ? attack.name.slice(0, 80) : '',
      proficient: attack?.proficient === true,
      ability,
      damage: typeof attack?.damage === 'string' ? attack.damage.slice(0, 40) : '',
      magicBonus:
        attack?.magicBonus === 1 || attack?.magicBonus === 2 || attack?.magicBonus === 3
          ? attack.magicBonus
          : 0,
      description: typeof attack?.description === 'string' ? attack.description.slice(0, 400) : '',
    };
  });
}

function normalizeCharacter(raw: Character): Character {
  return {
    ...raw,
    subclass_name: raw.subclass_name ?? null,
    stats: {
      str: raw.stats?.str ?? 10,
      dex: raw.stats?.dex ?? 10,
      con: raw.stats?.con ?? 10,
      int: raw.stats?.int ?? 10,
      wis: raw.stats?.wis ?? 10,
      cha: raw.stats?.cha ?? 10,
    },
    proficiencies: {
      savingThrows: raw.proficiencies?.savingThrows ?? [],
      skills: raw.proficiencies?.skills ?? {},
      skillBonuses: raw.proficiencies?.skillBonuses ?? {},
      globalSkillBonus: raw.proficiencies?.globalSkillBonus ?? 0,
      saveBonuses: raw.proficiencies?.saveBonuses ?? {},
      weapons: raw.proficiencies?.weapons ?? [],
      weaponMasteries: raw.proficiencies?.weaponMasteries ?? [],
      armor: raw.proficiencies?.armor ?? [],
      tools: raw.proficiencies?.tools ?? [],
      languages: raw.proficiencies?.languages ?? ['Common'],
    },
    hp: {
      current: raw.hp?.current ?? 10,
      max: raw.hp?.max ?? 10,
      temp: raw.hp?.temp ?? 0,
      hit_dice_current: raw.hp?.hit_dice_current ?? 1,
      hit_dice_max: raw.hp?.hit_dice_max ?? 1,
      hit_die_type: raw.hp?.hit_die_type ?? 'd8',
      death_save_successes: raw.hp?.death_save_successes ?? 0,
      death_save_failures: raw.hp?.death_save_failures ?? 0,
      conditions: raw.hp?.conditions ?? [],
      armor_class: raw.hp?.armor_class ?? 10,
      speed: raw.hp?.speed ?? 30,
    },
    spells: {
      spellcastingAbility: raw.spells?.spellcastingAbility ?? null,
      visibleSlotLevels: Math.max(
        1,
        Math.min(9, Math.floor(raw.spells?.visibleSlotLevels ?? 1))
      ),
      slots: raw.spells?.slots ?? {},
      pactSlots: raw.spells?.pactSlots,
      preparedSlugs: raw.spells?.preparedSlugs ?? [],
      knownSlugs: raw.spells?.knownSlugs ?? [],
    },
    weapon_attacks: normalizeWeaponAttacks(raw.weapon_attacks),
  };
}

interface CharacterStoreState {
  characters: Character[];
  activeCharacterId: string | null;
  isLoading: boolean;
  isSaving: boolean;

  fetchCharacters: () => Promise<void>;
  selectCharacter: (id: string) => void;
  createCharacter: () => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;

  updateIdentity: (
    patch: Partial<Pick<Character, 'name' | 'species' | 'class_name' | 'subclass_name'>>
  ) => void;
  setLevel: (level: number) => void;
  setExhaustion: (exhaustion: number) => void;
  setStat: (stat: AbilityKey, value: number) => void;
  toggleSavingThrowProficiency: (ability: AbilityKey) => void;
  cycleSkillProficiency: (skill: SkillKey) => void;
  setSkillBonus: (skill: SkillKey, bonus: number) => void;
  setSaveBonus: (ability: AbilityKey, bonus: number) => void;
  addBonusToAllSkills: (amount: number) => void;
  updateHpAndCombat: (patch: Partial<CharacterHp>) => void;
  setSpellcastingAbility: (ability: AbilityKey | null) => void;
  updateSpellSlot: (slotLevel: number, patch: { current?: number; max?: number }) => void;
  setVisibleSpellSlotLevels: (count: number) => void;
  resetAllSpellSlots: () => void;
  setWeaponAttacks: (attacks: WeaponAttack[]) => void;
  takeShortRest: () => void;
  takeLongRest: () => void;
  updateNotes: (notes: string) => void;
}

export const useCharacterStore = create<CharacterStoreState>((set, get) => {
  const schedulePatch = (characterId: string, patch: UpdateCharacterPatch) => {
    const existingPatch = pendingPatches.get(characterId) ?? {};
    const mergedPatch: UpdateCharacterPatch = {
      ...existingPatch,
      ...patch,
    };
    pendingPatches.set(characterId, mergedPatch);

    const existingTimer = debounceTimers.get(characterId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    set({ isSaving: true });

    const timer = setTimeout(async () => {
      debounceTimers.delete(characterId);
      const finalPatch = pendingPatches.get(characterId);
      pendingPatches.delete(characterId);

      if (!finalPatch) {
        set({ isSaving: false });
        return;
      }

      try {
        await fetch(`/api/characters/${characterId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalPatch),
        });
      } catch (err) {
        console.error('Failed to auto-save character patch:', err);
      } finally {
        if (debounceTimers.size === 0) {
          set({ isSaving: false });
        }
      }
    }, 300);

    debounceTimers.set(characterId, timer);
  };

  const applyActiveUpdate = (
    updater: (current: Character) => { updated: Character; patch: UpdateCharacterPatch }
  ) => {
    const { activeCharacterId, characters } = get();
    if (!activeCharacterId) return;

    const current = characters.find((c) => c.id === activeCharacterId);
    if (!current) return;

    const { updated, patch } = updater(current);
    set({
      characters: characters.map((c) => (c.id === activeCharacterId ? updated : c)),
    });
    schedulePatch(activeCharacterId, patch);
  };

  return {
    characters: [],
    activeCharacterId: null,
    isLoading: true,
    isSaving: false,

    fetchCharacters: async () => {
      set({ isLoading: true });
      try {
        const res = await fetch('/api/characters');
        const data = (await res.json()) as { items?: Character[] };
        const list = (data.items ?? []).map(normalizeCharacter);

        if (list.length === 0) {
          const createRes = await fetch('/api/characters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const createdData = (await createRes.json()) as { item: Character };
          const normalized = normalizeCharacter(createdData.item);
          set({
            characters: [normalized],
            activeCharacterId: normalized.id,
            isLoading: false,
          });
          return;
        }

        set((state) => ({
          characters: list,
          activeCharacterId:
            state.activeCharacterId && list.some((c) => c.id === state.activeCharacterId)
              ? state.activeCharacterId
              : (list[0]?.id ?? null),
          isLoading: false,
        }));
      } catch (err) {
        console.error('Failed to fetch characters:', err);
        set({ isLoading: false });
      }
    },

    selectCharacter: (id) => {
      set({ activeCharacterId: id });
    },

    createCharacter: async () => {
      try {
        const res = await fetch('/api/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Новый персонаж',
            species: 'Человек',
            class_name: 'Воин',
            subclass_name: null,
          }),
        });
        const data = (await res.json()) as { item: Character };
        const created = normalizeCharacter(data.item);
        set((state) => ({
          characters: [created, ...state.characters],
          activeCharacterId: created.id,
        }));
      } catch (err) {
        console.error('Failed to create character:', err);
      }
    },

    deleteCharacter: async (id) => {
      const existingTimer = debounceTimers.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        debounceTimers.delete(id);
      }
      pendingPatches.delete(id);

      try {
        await fetch(`/api/characters/${id}`, { method: 'DELETE' });
        const remaining = get().characters.filter((c) => c.id !== id);

        if (remaining.length === 0) {
          await get().createCharacter();
          return;
        }

        set((state) => ({
          characters: remaining,
          activeCharacterId:
            state.activeCharacterId === id
              ? (remaining[0]?.id ?? null)
              : state.activeCharacterId,
        }));
      } catch (err) {
        console.error('Failed to delete character:', err);
      }
    },

    updateIdentity: (patch) => {
      applyActiveUpdate((current) => {
        const updated: Character = {
          ...current,
          ...patch,
        };
        return { updated, patch };
      });
    },

    setLevel: (level) => {
      const clamped = Math.max(1, Math.min(20, Math.floor(level) || 1));
      applyActiveUpdate((current) => {
        const delta = clamped - current.level;
        const previousDice = current.hp.hit_dice_current ?? current.level;
        const nextHitDice =
          delta >= 0
            ? Math.min(clamped, previousDice + delta)
            : Math.min(previousDice, clamped);
        const nextHp: CharacterHp = {
          ...current.hp,
          hit_dice_current: nextHitDice,
          hit_dice_max: clamped,
        };
        return {
          updated: { ...current, level: clamped, hp: nextHp },
          patch: { level: clamped, hp: nextHp },
        };
      });
    },

    setExhaustion: (exhaustion) => {
      const clamped = Math.max(
        0,
        Math.min(MAX_EXHAUSTION_LEVEL, Math.floor(exhaustion) || 0)
      );
      applyActiveUpdate((current) => ({
        updated: { ...current, exhaustion: clamped },
        patch: { exhaustion: clamped },
      }));
    },

    setStat: (stat, value) => {
      const clamped = Math.max(1, Math.min(30, Math.floor(value) || 1));
      applyActiveUpdate((current) => {
        const nextStats: CharacterStats = {
          ...current.stats,
          [stat]: clamped,
        };
        return {
          updated: { ...current, stats: nextStats },
          patch: { stats: nextStats },
        };
      });
    },

    toggleSavingThrowProficiency: (ability) => {
      applyActiveUpdate((current) => {
        const currentSaves = current.proficiencies.savingThrows ?? [];
        const exists = currentSaves.includes(ability);
        const nextSaves = exists
          ? currentSaves.filter((a) => a !== ability)
          : [...currentSaves, ability];

        const nextProficiencies = {
          ...current.proficiencies,
          savingThrows: nextSaves,
        };
        return {
          updated: { ...current, proficiencies: nextProficiencies },
          patch: { proficiencies: nextProficiencies },
        };
      });
    },

    cycleSkillProficiency: (skill) => {
      applyActiveUpdate((current) => {
        const currentRank = (current.proficiencies.skills?.[skill] ?? 0) as ProficiencyRank;
        const nextRank = (((currentRank + 1) % 3) as ProficiencyRank);

        const nextSkills = {
          ...current.proficiencies.skills,
          [skill]: nextRank,
        };
        const nextProficiencies = {
          ...current.proficiencies,
          skills: nextSkills,
        };
        return {
          updated: { ...current, proficiencies: nextProficiencies },
          patch: { proficiencies: nextProficiencies },
        };
      });
    },

    setSkillBonus: (skill, bonus) => {
      applyActiveUpdate((current) => {
        const nextBonuses = { ...(current.proficiencies.skillBonuses ?? {}) };
        const clamped = clampSkillBonus(bonus);
        if (clamped === 0) {
          delete nextBonuses[skill];
        } else {
          nextBonuses[skill] = clamped;
        }
        const nextProficiencies = {
          ...current.proficiencies,
          skillBonuses: nextBonuses,
        };
        return {
          updated: { ...current, proficiencies: nextProficiencies },
          patch: { proficiencies: nextProficiencies },
        };
      });
    },

    setSaveBonus: (ability, bonus) => {
      applyActiveUpdate((current) => {
        const nextBonuses = { ...(current.proficiencies.saveBonuses ?? {}) };
        const clamped = clampSkillBonus(bonus);
        if (clamped === 0) {
          delete nextBonuses[ability];
        } else {
          nextBonuses[ability] = clamped;
        }
        const nextProficiencies = {
          ...current.proficiencies,
          saveBonuses: nextBonuses,
        };
        return {
          updated: { ...current, proficiencies: nextProficiencies },
          patch: { proficiencies: nextProficiencies },
        };
      });
    },

    addBonusToAllSkills: (amount) => {
      const delta = Math.trunc(amount);
      if (!Number.isFinite(delta) || delta === 0) return;

      applyActiveUpdate((current) => {
        const nextGlobal = clampSkillBonus(
          (current.proficiencies.globalSkillBonus ?? 0) + delta
        );
        const nextProficiencies = {
          ...current.proficiencies,
          globalSkillBonus: nextGlobal,
        };
        return {
          updated: { ...current, proficiencies: nextProficiencies },
          patch: { proficiencies: nextProficiencies },
        };
      });
    },

    updateHpAndCombat: (patch) => {
      applyActiveUpdate((current) => {
        const nextCurrent =
          patch.current !== undefined ? Math.max(0, Math.floor(patch.current)) : current.hp.current;
        const nextMax =
          patch.max !== undefined ? Math.max(1, Math.floor(patch.max)) : current.hp.max;
        const nextTemp =
          patch.temp !== undefined ? Math.max(0, Math.floor(patch.temp)) : current.hp.temp;
        const nextAc =
          patch.armor_class !== undefined
            ? Math.max(0, Math.min(50, Math.floor(patch.armor_class)))
            : current.hp.armor_class;
        const nextSpeed =
          patch.speed !== undefined
            ? Math.max(0, Math.min(300, Math.floor(patch.speed)))
            : current.hp.speed;

        const hitDiceMax = Math.max(1, current.level);
        const nextHitDiceCurrent =
          patch.hit_dice_current !== undefined
            ? Math.max(0, Math.min(hitDiceMax, Math.floor(patch.hit_dice_current)))
            : Math.max(0, Math.min(hitDiceMax, current.hp.hit_dice_current ?? hitDiceMax));
        const allowedDice = ['d6', 'd8', 'd10', 'd12'] as const;
        const requestedDie = patch.hit_die_type;
        const nextHitDie = allowedDice.includes(
          requestedDie as (typeof allowedDice)[number]
        )
          ? (requestedDie as (typeof allowedDice)[number])
          : (current.hp.hit_die_type ?? 'd8');
        const clampDeathSave = (value: number | undefined, fallback: number): number => {
          const source = value !== undefined ? value : fallback;
          return Math.max(0, Math.min(3, Math.floor(source) || 0));
        };
        const nextDeathSuccesses = clampDeathSave(
          patch.death_save_successes,
          current.hp.death_save_successes ?? 0
        );
        const nextDeathFailures = clampDeathSave(
          patch.death_save_failures,
          current.hp.death_save_failures ?? 0
        );

        const nextHp: CharacterHp = {
          ...current.hp,
          ...patch,
          current: nextCurrent,
          max: nextMax,
          temp: nextTemp,
          armor_class: nextAc,
          speed: nextSpeed,
          hit_dice_current: nextHitDiceCurrent,
          hit_dice_max: hitDiceMax,
          hit_die_type: nextHitDie,
          death_save_successes: nextDeathSuccesses,
          death_save_failures: nextDeathFailures,
        };
        return {
          updated: { ...current, hp: nextHp },
          patch: { hp: nextHp },
        };
      });
    },

    setSpellcastingAbility: (ability) => {
      applyActiveUpdate((current) => {
        const nextSpells = {
          ...current.spells,
          spellcastingAbility: ability,
        };
        return {
          updated: { ...current, spells: nextSpells },
          patch: { spells: nextSpells },
        };
      });
    },

    setVisibleSpellSlotLevels: (count) => {
      const nextCount = Math.max(1, Math.min(9, Math.floor(count)));
      applyActiveUpdate((current) => {
        const nextSpells = {
          ...current.spells,
          visibleSlotLevels: nextCount,
        };
        return {
          updated: { ...current, spells: nextSpells },
          patch: { spells: nextSpells },
        };
      });
    },

    updateSpellSlot: (slotLevel, patch) => {
      const key = String(Math.max(1, Math.min(9, Math.floor(slotLevel))));
      applyActiveUpdate((current) => {
        const existingSlot = current.spells.slots?.[key] ?? { current: 0, max: 0 };
        const nextMax =
          patch.max !== undefined
            ? Math.max(0, Math.min(12, Math.floor(patch.max)))
            : existingSlot.max;
        const rawCurrent =
          patch.current !== undefined
            ? Math.max(0, Math.floor(patch.current))
            : existingSlot.current;
        const nextCurrent = Math.min(nextMax, rawCurrent);

        const nextSlots = {
          ...current.spells.slots,
          [key]: {
            current: nextCurrent,
            max: nextMax,
          },
        };
        const nextSpells = {
          ...current.spells,
          slots: nextSlots,
        };
        return {
          updated: { ...current, spells: nextSpells },
          patch: { spells: nextSpells },
        };
      });
    },

    setWeaponAttacks: (attacks) => {
      applyActiveUpdate((current) => {
        const nextAttacks = normalizeWeaponAttacks(attacks);
        return {
          updated: { ...current, weapon_attacks: nextAttacks },
          patch: { weapon_attacks: nextAttacks },
        };
      });
    },

    resetAllSpellSlots: () => {
      applyActiveUpdate((current) => {
        const nextSlots: Record<string, { current: number; max: number }> = {};
        for (let lvl = 1; lvl <= 9; lvl++) {
          const key = String(lvl);
          const slot = current.spells.slots?.[key] ?? { current: 0, max: 0 };
          nextSlots[key] = {
            current: 0,
            max: slot.max,
          };
        }
        const nextSpells = {
          ...current.spells,
          slots: nextSlots,
        };
        return {
          updated: { ...current, spells: nextSpells },
          patch: { spells: nextSpells },
        };
      });
    },

    /**
     * D&D 5.5e (2024) Short Rest:
     * - Restores pact magic slots (if any) and custom resources with `reset_on === 'short_rest'`.
     * - Clears death saving throws and active conditions.
     */
    takeShortRest: () => {
      applyActiveUpdate((current) => {
        const nextCustomResources = (current.custom_resources ?? []).map((res) =>
          res.reset_on === 'short_rest' ? { ...res, current: res.max } : res
        );

        const nextSpells = current.spells.pactSlots
          ? {
              ...current.spells,
              pactSlots: {
                ...current.spells.pactSlots,
                current: 0,
              },
            }
          : current.spells;

        const nextHp: CharacterHp = {
          ...current.hp,
          death_save_successes: 0,
          death_save_failures: 0,
          conditions: [],
        };

        return {
          updated: {
            ...current,
            hp: nextHp,
            custom_resources: nextCustomResources,
            spells: nextSpells,
          },
          patch: {
            hp: nextHp,
            custom_resources: nextCustomResources,
            spells: nextSpells,
          },
        };
      });
    },

    /**
     * D&D 5.5e (2024) Long Rest:
     * - Restores all HP (`current = max`) and clears Temporary HP (`temp = 0`).
     * - Restores half of the hit dice pool (rounded up). A second long rest restores the rest.
     * - Clears death saving throws.
     * - Reduces Exhaustion by 1 level (`Math.max(0, exhaustion - 1)`).
     * - Restores all expended Spell Slots (1–9 circles) and Pact Slots (`current = 0` spent).
     * - Restores all custom resources (`short_rest`, `long_rest`, `dawn`).
     */
    takeLongRest: () => {
      applyActiveUpdate((current) => {
        const nextHp: CharacterHp = {
          ...current.hp,
          current: current.hp.max,
          temp: 0,
          hit_dice_max: current.level,
          hit_dice_current: hitDiceAfterLongRest(
            current.hp.hit_dice_current ?? 0,
            current.level
          ),
          death_save_successes: 0,
          death_save_failures: 0,
          conditions: [],
        };

        const nextExhaustion = Math.max(0, (current.exhaustion ?? 0) - 1);

        const nextSlots: Record<string, { current: number; max: number }> = {};
        for (let lvl = 1; lvl <= 9; lvl++) {
          const key = String(lvl);
          const slot = current.spells.slots?.[key] ?? { current: 0, max: 0 };
          nextSlots[key] = {
            current: 0,
            max: slot.max,
          };
        }

        const nextSpells = {
          ...current.spells,
          slots: nextSlots,
          ...(current.spells.pactSlots
            ? {
                pactSlots: {
                  ...current.spells.pactSlots,
                  current: 0,
                },
              }
            : {}),
        };

        const nextCustomResources = (current.custom_resources ?? []).map((res) =>
          res.reset_on === 'short_rest' ||
          res.reset_on === 'long_rest' ||
          res.reset_on === 'dawn'
            ? { ...res, current: res.max }
            : res
        );

        return {
          updated: {
            ...current,
            hp: nextHp,
            exhaustion: nextExhaustion,
            spells: nextSpells,
            custom_resources: nextCustomResources,
          },
          patch: {
            hp: nextHp,
            exhaustion: nextExhaustion,
            spells: nextSpells,
            custom_resources: nextCustomResources,
          },
        };
      });
    },

    updateNotes: (notes) => {
      applyActiveUpdate((current) => ({
        updated: { ...current, notes },
        patch: { notes },
      }));
    },
  };
});
