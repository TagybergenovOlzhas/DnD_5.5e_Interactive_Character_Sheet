import { create } from 'zustand';
import {
  CreatureSizeSchema,
  type AbilityKey,
  type BagOfHolding,
  type Character,
  type CharacterCurrency,
  type CharacterHp,
  type CharacterNote,
  type CharacterStats,
  type CompendiumEntry,
  type CurrencyCode,
  type CustomProficiencyEntry,
  type CustomResource,
  type InventoryItem,
  type PassiveTrait,
  type ProficiencyRank,
  type SkillKey,
  type UpdateCharacterPatch,
  type VaultFileNode,
  type WeaponAttack,
} from '@shared/types';
import {
  applyCurrencyTransaction,
  hitDiceAfterLongRest,
  MAX_EXHAUSTION_LEVEL,
} from '@shared/rulesEngine';

function clampCoin(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(9999999, Math.floor(value)))
    : 0;
}

function normalizeInventoryList(rawItems: unknown): InventoryItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((raw, index) => {
    const item = raw as Partial<InventoryItem> | undefined;
    const chargesMax =
      typeof item?.chargesMax === 'number'
        ? Math.max(0, Math.min(30, Math.floor(item.chargesMax)))
        : 0;
    const rawChargesCurrent =
      typeof item?.chargesCurrent === 'number'
        ? Math.max(0, Math.floor(item.chargesCurrent))
        : chargesMax;
    return {
      id: typeof item?.id === 'string' && item.id.trim() !== '' ? item.id : `item-${index}`,
      compendium_slug: item?.compendium_slug,
      name: typeof item?.name === 'string' ? item.name : '',
      description: typeof item?.description === 'string' ? item.description : '',
      quantity:
        typeof item?.quantity === 'number'
          ? Math.max(0, Math.min(9999, Math.floor(item.quantity)))
          : 1,
      equipped: Boolean(item?.equipped),
      attuned: Boolean(item?.attuned),
      weight: typeof item?.weight === 'number' ? Math.max(0, item.weight) : 0,
      weightUnit: item?.weightUnit === 'kg' ? 'kg' : 'lb',
      chargesMax,
      chargesCurrent: Math.min(chargesMax, rawChargesCurrent),
      overrides: item?.overrides,
    };
  });
}

function appendInventoryItem(
  items: InventoryItem[],
  item?: Partial<InventoryItem>
): InventoryItem[] {
  const chargesMax =
    item?.chargesMax !== undefined
      ? Math.max(0, Math.min(30, Math.floor(item.chargesMax)))
      : 0;
  const chargesCurrent =
    item?.chargesCurrent !== undefined
      ? Math.max(0, Math.min(chargesMax, Math.floor(item.chargesCurrent)))
      : chargesMax;
  return [
    ...items,
    {
      id: item?.id ?? crypto.randomUUID(),
      name: typeof item?.name === 'string' ? item.name : '',
      description: typeof item?.description === 'string' ? item.description : '',
      quantity:
        typeof item?.quantity === 'number'
          ? Math.max(0, Math.min(9999, Math.floor(item.quantity)))
          : 1,
      equipped: Boolean(item?.equipped),
      attuned: Boolean(item?.attuned),
      weight: typeof item?.weight === 'number' ? Math.max(0, item.weight) : 0,
      weightUnit: item?.weightUnit === 'kg' ? 'kg' : 'lb',
      chargesMax,
      chargesCurrent,
    },
  ];
}

function patchInventoryItem(
  items: InventoryItem[],
  id: string,
  patch: Partial<InventoryItem>
): InventoryItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const nextChargesMax =
      patch.chargesMax !== undefined
        ? Math.max(0, Math.min(30, Math.floor(patch.chargesMax)))
        : item.chargesMax ?? 0;
    const rawChargesCurrent =
      patch.chargesCurrent !== undefined
        ? Math.max(0, Math.floor(patch.chargesCurrent))
        : item.chargesCurrent ?? 0;
    return {
      ...item,
      ...patch,
      quantity:
        patch.quantity !== undefined
          ? Math.max(0, Math.min(9999, Math.floor(patch.quantity)))
          : item.quantity,
      weight:
        patch.weight !== undefined
          ? Math.max(0, patch.weight)
          : item.weight ?? 0,
      weightUnit:
        patch.weightUnit !== undefined
          ? patch.weightUnit === 'kg'
            ? 'kg'
            : 'lb'
          : item.weightUnit === 'kg'
            ? 'kg'
            : 'lb',
      chargesMax: nextChargesMax,
      chargesCurrent: Math.min(nextChargesMax, rawChargesCurrent),
    };
  });
}

function moveItemById<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after'
): T[] {
  if (sourceId === targetId) return items;
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  if (sourceIndex === -1) return items;
  const rest = items.filter((item) => item.id !== sourceId);
  const destIndex = rest.findIndex((item) => item.id === targetId);
  if (destIndex === -1) return items;
  const insertIndex = position === 'after' ? destIndex + 1 : destIndex;
  if (insertIndex === sourceIndex) return items;
  const next = [...rest];
  next.splice(insertIndex, 0, items[sourceIndex]!);
  return next;
}

function normalizeNoteCards(
  rawCards: unknown,
  legacyNotes: unknown
): CharacterNote[] {
  if (Array.isArray(rawCards)) {
    return rawCards.map((entry, index) => {
      const note = entry as Partial<CharacterNote> | undefined;
      return {
        id:
          typeof note?.id === 'string' && note.id.trim().length > 0
            ? note.id
            : `note-${index + 1}`,
        title: typeof note?.title === 'string' ? note.title.slice(0, 120) : '',
        content:
          typeof note?.content === 'string' ? note.content.slice(0, 4000) : '',
      };
    });
  }
  if (typeof legacyNotes === 'string' && legacyNotes.trim().length > 0) {
    return [
      {
        id: 'legacy-note',
        title: 'Заметка',
        content: legacyNotes.slice(0, 4000),
      },
    ];
  }
  return [];
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPatches = new Map<string, UpdateCharacterPatch>();

const ACTIVE_CHARACTER_STORAGE_KEY = 'dnd-sheet-active-character-id';

function getStoredCharacterId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_CHARACTER_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function setStoredCharacterId(id: string | null): void {
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_CHARACTER_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_CHARACTER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

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
  const parsedSize = CreatureSizeSchema.safeParse(raw.size);
  return {
    ...raw,
    subclass_name: raw.subclass_name ?? null,
    size: parsedSize.success ? parsedSize.data : 'medium',
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
      customProficiencies: Array.isArray(raw.proficiencies?.customProficiencies)
        ? raw.proficiencies.customProficiencies.map((entry, index) => ({
            id: typeof entry?.id === 'string' && entry.id.trim() !== '' ? entry.id : `prof-${index}`,
            text: typeof entry?.text === 'string' ? entry.text.slice(0, 200) : '',
          }))
        : [],
      heavyArmorStealthDisadvantage: Boolean(raw.proficiencies?.heavyArmorStealthDisadvantage),
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
    custom_resources: Array.isArray(raw.custom_resources)
      ? raw.custom_resources.map((res, index) => ({
          id: typeof res?.id === 'string' && res.id.trim() !== '' ? res.id : `res-${index}`,
          name: typeof res?.name === 'string' ? res.name : '',
          current: typeof res?.current === 'number' ? Math.max(0, res.current) : 1,
          max: typeof res?.max === 'number' ? Math.max(1, res.max) : 1,
          reset_on:
            res?.reset_on === 'short_rest' ||
            res?.reset_on === 'long_rest' ||
            res?.reset_on === 'dawn' ||
            res?.reset_on === 'manual'
              ? res.reset_on
              : 'long_rest',
          description: typeof res?.description === 'string' ? res.description : '',
        }))
      : [],
    inventory: normalizeInventoryList(raw.inventory),
    bag_of_holding: {
      enabled: Boolean(raw.bag_of_holding?.enabled),
      items: normalizeInventoryList(raw.bag_of_holding?.items),
    },
    passive_traits: Array.isArray(raw.passive_traits)
      ? raw.passive_traits.map((trait, index) => ({
          id: typeof trait?.id === 'string' && trait.id.trim().length > 0 ? trait.id : `passive-${index + 1}`,
          name: typeof trait?.name === 'string' ? trait.name.slice(0, 80) : '',
          description: typeof trait?.description === 'string' ? trait.description.slice(0, 800) : '',
        }))
      : [],
    currency: {
      pp: clampCoin(raw.currency?.pp),
      gp: clampCoin(raw.currency?.gp),
      sp: clampCoin(raw.currency?.sp),
      cp: clampCoin(raw.currency?.cp),
    },
    weapon_attacks: normalizeWeaponAttacks(raw.weapon_attacks),
    note_cards: normalizeNoteCards(raw.note_cards, raw.notes),
  };
}

interface CharacterStoreState {
  characters: Character[];
  activeCharacterId: string | null;
  isLoading: boolean;
  isSaving: boolean;

  fetchCharacters: () => Promise<void>;
  selectCharacter: (id: string | null) => void;
  createCharacter: () => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;

  updateIdentity: (
    patch: Partial<Pick<Character, 'name' | 'species' | 'class_name' | 'subclass_name' | 'size'>>
  ) => void;
  setLevel: (level: number) => void;
  setExhaustion: (exhaustion: number) => void;
  setStat: (stat: AbilityKey, value: number) => void;
  toggleSavingThrowProficiency: (ability: AbilityKey) => void;
  cycleSkillProficiency: (skill: SkillKey) => void;
  setSkillBonus: (skill: SkillKey, bonus: number) => void;
  setSaveBonus: (ability: AbilityKey, bonus: number) => void;
  addBonusToAllSkills: (amount: number) => void;
  addCustomProficiency: (text?: string) => string;
  updateCustomProficiency: (id: string, text: string) => void;
  deleteCustomProficiency: (id: string) => void;
  toggleHeavyArmorStealthDisadvantage: () => void;
  updateHpAndCombat: (patch: Partial<CharacterHp>) => void;
  setSpellcastingAbility: (ability: AbilityKey | null) => void;
  updateSpellSlot: (slotLevel: number, patch: { current?: number; max?: number }) => void;
  setVisibleSpellSlotLevels: (count: number) => void;
  resetAllSpellSlots: () => void;
  setWeaponAttacks: (attacks: WeaponAttack[]) => void;
  addCustomResource: (resource?: Partial<CustomResource>) => void;
  updateCustomResource: (id: string, patch: Partial<CustomResource>) => void;
  deleteCustomResource: (id: string) => void;
  addPassiveTrait: (trait?: Partial<PassiveTrait>) => void;
  updatePassiveTrait: (id: string, patch: Partial<PassiveTrait>) => void;
  deletePassiveTrait: (id: string) => void;
  addInventoryItem: (item?: Partial<InventoryItem>) => void;
  updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => void;
  deleteInventoryItem: (id: string) => void;
  reorderInventoryItem: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  setBagOfHoldingEnabled: (enabled: boolean) => void;
  addBagOfHoldingItem: (item?: Partial<InventoryItem>) => void;
  updateBagOfHoldingItem: (id: string, patch: Partial<InventoryItem>) => void;
  deleteBagOfHoldingItem: (id: string) => void;
  reorderBagOfHoldingItem: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  setCurrencyCoin: (coin: CurrencyCode, amount: number) => void;
  applyCurrencyChange: (params: {
    coin: CurrencyCode;
    amount: number;
    mode: 'add' | 'spend';
  }) => void;
  addSpellToCharacter: (slug: string) => void;
  removeSpellFromCharacter: (slug: string) => void;
  togglePreparedSpell: (slug: string) => void;
  compendiumSpells: CompendiumEntry[];
  isCompendiumLoading: boolean;
  fetchCompendiumSpells: () => Promise<void>;
  vaultTree: VaultFileNode[];
  vaultTotalFiles: number;
  isVaultLoading: boolean;
  isVaultSyncing: boolean;
  fetchVaultTree: () => Promise<void>;
  syncVaultWithGit: () => Promise<void>;
  takeShortRest: () => void;
  takeLongRest: () => void;
  updateNotes: (notes: string) => void;
  addNoteCard: (note?: Partial<CharacterNote>) => string;
  updateNoteCard: (
    id: string,
    patch: Partial<Pick<CharacterNote, 'title' | 'content'>>
  ) => void;
  deleteNoteCard: (id: string) => void;
  reorderNoteCard: (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after'
  ) => void;
  saveActiveCharacter: () => Promise<void>;
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

  const updateCustomProficiencies = (
    transform: (entries: CustomProficiencyEntry[]) => CustomProficiencyEntry[]
  ) => {
    applyActiveUpdate((current) => {
      const nextProficiencies = {
        ...current.proficiencies,
        customProficiencies: transform(current.proficiencies.customProficiencies ?? []),
      };
      return {
        updated: { ...current, proficiencies: nextProficiencies },
        patch: { proficiencies: nextProficiencies },
      };
    });
  };

  const updatePassiveTraits = (
    transform: (traits: PassiveTrait[]) => PassiveTrait[]
  ) => {
    applyActiveUpdate((current) => {
      const nextTraits = transform(current.passive_traits ?? []);
      return {
        updated: { ...current, passive_traits: nextTraits },
        patch: { passive_traits: nextTraits },
      };
    });
  };

  const updateInventory = (
    transform: (items: InventoryItem[]) => InventoryItem[]
  ) => {
    applyActiveUpdate((current) => {
      const nextInventory = transform(current.inventory ?? []);
      return {
        updated: { ...current, inventory: nextInventory },
        patch: { inventory: nextInventory },
      };
    });
  };

  const updateBagOfHolding = (
    transform: (bag: BagOfHolding) => BagOfHolding
  ) => {
    applyActiveUpdate((current) => {
      const currentBag: BagOfHolding = current.bag_of_holding ?? {
        enabled: false,
        items: [],
      };
      const nextBag = transform(currentBag);
      return {
        updated: { ...current, bag_of_holding: nextBag },
        patch: { bag_of_holding: nextBag },
      };
    });
  };

  return {
    characters: [],
    activeCharacterId: getStoredCharacterId(),
    isLoading: true,
    isSaving: false,
    compendiumSpells: [],
    isCompendiumLoading: false,
    vaultTree: [],
    vaultTotalFiles: 0,
    isVaultLoading: false,
    isVaultSyncing: false,

    fetchCharacters: async () => {
      set({ isLoading: true });
      try {
        const res = await fetch('/api/characters');
        const data = (await res.json()) as { items?: Character[] };
        const list = (data.items ?? []).map(normalizeCharacter);

        const storedId = get().activeCharacterId ?? getStoredCharacterId();
        const validStoredId =
          storedId && list.some((c) => c.id === storedId) ? storedId : null;

        if (!validStoredId) {
          setStoredCharacterId(null);
        }

        set({
          characters: list,
          activeCharacterId: validStoredId,
          isLoading: false,
        });

        if (get().compendiumSpells.length === 0) {
          void get().fetchCompendiumSpells();
        }
        if (get().vaultTree.length === 0) {
          void get().fetchVaultTree();
        }
      } catch (err) {
        console.error('Failed to fetch characters:', err);
        set({ isLoading: false });
      }
    },

    fetchCompendiumSpells: async () => {
      set({ isCompendiumLoading: true });
      try {
        const res = await fetch('/api/compendium?category=spell');
        const data = (await res.json()) as { items?: CompendiumEntry[] };
        set({ compendiumSpells: data.items ?? [], isCompendiumLoading: false });
      } catch (err) {
        console.error('Failed to fetch compendium spells:', err);
        set({ isCompendiumLoading: false });
      }
    },

    fetchVaultTree: async () => {
      set({ isVaultLoading: true });
      try {
        const res = await fetch('/api/vault/tree');
        const data = (await res.json()) as {
          tree?: VaultFileNode[];
          totalFiles?: number;
        };
        set({
          vaultTree: data.tree ?? [],
          vaultTotalFiles: data.totalFiles ?? 0,
          isVaultLoading: false,
        });
      } catch (err) {
        console.error('Failed to fetch vault tree:', err);
        set({ isVaultLoading: false });
      }
    },

    syncVaultWithGit: async () => {
      set({ isVaultSyncing: true });
      try {
        const res = await fetch('/api/vault/sync', { method: 'POST' });
        const data = (await res.json()) as {
          vault?: { tree?: VaultFileNode[]; totalFiles?: number };
        };
        if (data.vault?.tree) {
          set({
            vaultTree: data.vault.tree,
            vaultTotalFiles: data.vault.totalFiles ?? 0,
          });
        } else {
          await get().fetchVaultTree();
        }
        await get().fetchCompendiumSpells();
        set({ isVaultSyncing: false });
      } catch (err) {
        console.error('Failed to sync vault with git:', err);
        set({ isVaultSyncing: false });
      }
    },

    selectCharacter: (id) => {
      setStoredCharacterId(id);
      set({ activeCharacterId: id });
    },

    createCharacter: async () => {
      try {
        const res = await fetch('/api/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: '',
            species: '',
            class_name: '',
            subclass_name: null,
          }),
        });
        const data = (await res.json()) as { item?: Character };
        if (!data?.item) {
          console.error('Server did not return created character:', data);
          return;
        }
        const created = normalizeCharacter(data.item);
        setStoredCharacterId(created.id);
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
        const wasActive = get().activeCharacterId === id;
        if (wasActive) {
          setStoredCharacterId(null);
        }

        set((state) => ({
          characters: remaining,
          activeCharacterId: state.activeCharacterId === id ? null : state.activeCharacterId,
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

    addCustomProficiency: (text = '') => {
      const id = crypto.randomUUID();
      updateCustomProficiencies((entries) => [...entries, { id, text: text.slice(0, 200) }]);
      return id;
    },

    updateCustomProficiency: (id, text) => {
      updateCustomProficiencies((entries) =>
        entries.map((entry) =>
          entry.id === id ? { ...entry, text: text.slice(0, 200) } : entry
        )
      );
    },

    deleteCustomProficiency: (id) => {
      updateCustomProficiencies((entries) => entries.filter((entry) => entry.id !== id));
    },

    toggleHeavyArmorStealthDisadvantage: () => {
      applyActiveUpdate((current) => {
        const nextProficiencies = {
          ...current.proficiencies,
          heavyArmorStealthDisadvantage: !Boolean(
            current.proficiencies.heavyArmorStealthDisadvantage
          ),
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

    addCustomResource: (resource) => {
      applyActiveUpdate((current) => {
        const initialMax =
          resource?.max !== undefined ? Math.max(1, Math.min(30, Math.floor(resource.max))) : 1;
        const initialCurrent =
          resource?.current !== undefined
            ? Math.max(0, Math.min(initialMax, Math.floor(resource.current)))
            : initialMax;
        const nextResources: CustomResource[] = [
          ...(current.custom_resources ?? []),
          {
            id: resource?.id ?? crypto.randomUUID(),
            name: resource?.name ?? '',
            current: initialCurrent,
            max: initialMax,
            reset_on: resource?.reset_on ?? 'long_rest',
            description: resource?.description ?? '',
          },
        ];
        return {
          updated: { ...current, custom_resources: nextResources },
          patch: { custom_resources: nextResources },
        };
      });
    },

    updateCustomResource: (id, patch) => {
      applyActiveUpdate((current) => {
        const nextResources = (current.custom_resources ?? []).map((res) => {
          if (res.id !== id) return res;
          const nextMax =
            patch.max !== undefined
              ? Math.max(1, Math.min(30, Math.floor(patch.max)))
              : res.max;
          let nextCurrent =
            patch.current !== undefined
              ? Math.max(0, Math.min(nextMax, Math.floor(patch.current)))
              : Math.min(res.current, nextMax);
          return {
            ...res,
            ...patch,
            max: nextMax,
            current: nextCurrent,
          };
        });
        return {
          updated: { ...current, custom_resources: nextResources },
          patch: { custom_resources: nextResources },
        };
      });
    },

    deleteCustomResource: (id) => {
      applyActiveUpdate((current) => {
        const nextResources = (current.custom_resources ?? []).filter((res) => res.id !== id);
        return {
          updated: { ...current, custom_resources: nextResources },
          patch: { custom_resources: nextResources },
        };
      });
    },

    addPassiveTrait: (trait) => {
      updatePassiveTraits((traits) => {
        if (traits.length >= 30) return traits;
        const newTrait: PassiveTrait = {
          id: trait?.id?.trim() || crypto.randomUUID(),
          name: (trait?.name ?? '').slice(0, 80),
          description: (trait?.description ?? '').slice(0, 800),
        };
        return [...traits, newTrait];
      });
    },

    updatePassiveTrait: (id, patch) => {
      updatePassiveTraits((traits) =>
        traits.map((trait) => {
          if (trait.id !== id) return trait;
          return {
            ...trait,
            name: patch.name !== undefined ? patch.name.slice(0, 80) : trait.name,
            description:
              patch.description !== undefined
                ? patch.description.slice(0, 800)
                : trait.description,
          };
        })
      );
    },

    deletePassiveTrait: (id) => {
      updatePassiveTraits((traits) => traits.filter((trait) => trait.id !== id));
    },

    addInventoryItem: (item) => {
      updateInventory((items) => appendInventoryItem(items, item));
    },

    updateInventoryItem: (id, patch) => {
      updateInventory((items) => patchInventoryItem(items, id, patch));
    },

    deleteInventoryItem: (id) => {
      updateInventory((items) => items.filter((item) => item.id !== id));
    },

    reorderInventoryItem: (sourceId, targetId, position) => {
      updateInventory((items) =>
        moveItemById(items, sourceId, targetId, position)
      );
    },

    setBagOfHoldingEnabled: (enabled) => {
      updateBagOfHolding((bag) => ({
        ...bag,
        enabled,
      }));
    },

    addBagOfHoldingItem: (item) => {
      updateBagOfHolding((bag) => ({
        ...bag,
        items: appendInventoryItem(bag.items, item),
      }));
    },

    updateBagOfHoldingItem: (id, patch) => {
      updateBagOfHolding((bag) => ({
        ...bag,
        items: patchInventoryItem(bag.items, id, patch),
      }));
    },

    deleteBagOfHoldingItem: (id) => {
      updateBagOfHolding((bag) => ({
        ...bag,
        items: bag.items.filter((item) => item.id !== id),
      }));
    },

    reorderBagOfHoldingItem: (sourceId, targetId, position) => {
      updateBagOfHolding((bag) => ({
        ...bag,
        items: moveItemById(bag.items, sourceId, targetId, position),
      }));
    },

    setCurrencyCoin: (coin, amount) => {
      applyActiveUpdate((current) => {
        const prev = current.currency ?? { pp: 0, gp: 0, sp: 0, cp: 0 };
        const nextCurrency: CharacterCurrency = {
          ...prev,
          [coin]: clampCoin(amount),
        };
        return {
          updated: { ...current, currency: nextCurrency },
          patch: { currency: nextCurrency },
        };
      });
    },

    applyCurrencyChange: ({ coin, amount, mode }) => {
      const safeAmount = clampCoin(amount);
      if (safeAmount <= 0) return;
      const { activeCharacterId, characters } = get();
      const active = characters.find((c) => c.id === activeCharacterId);
      if (!active) return;

      const prev = active.currency ?? { pp: 0, gp: 0, sp: 0, cp: 0 };
      const result = applyCurrencyTransaction({
        currency: prev,
        coin,
        amount: safeAmount,
        mode,
      });
      if (!result.ok) return;

      applyActiveUpdate((current) => ({
        updated: { ...current, currency: result.next },
        patch: { currency: result.next },
      }));
    },

    addSpellToCharacter: (slug) => {
      applyActiveUpdate((current) => {
        const known = current.spells?.knownSlugs ?? [];
        if (known.includes(slug)) {
          return {
            updated: current,
            patch: {},
          };
        }
        const nextSpells = {
          ...current.spells,
          knownSlugs: [...known, slug],
        };
        return {
          updated: { ...current, spells: nextSpells },
          patch: { spells: nextSpells },
        };
      });
    },

    removeSpellFromCharacter: (slug) => {
      applyActiveUpdate((current) => {
        const known = (current.spells?.knownSlugs ?? []).filter((s) => s !== slug);
        const prepared = (current.spells?.preparedSlugs ?? []).filter((s) => s !== slug);
        const nextSpells = {
          ...current.spells,
          knownSlugs: known,
          preparedSlugs: prepared,
        };
        return {
          updated: { ...current, spells: nextSpells },
          patch: { spells: nextSpells },
        };
      });
    },

    togglePreparedSpell: (slug) => {
      applyActiveUpdate((current) => {
        const prepared = current.spells?.preparedSlugs ?? [];
        const isPrep = prepared.includes(slug);
        const nextPrepared = isPrep
          ? prepared.filter((s) => s !== slug)
          : [...prepared, slug];
        const nextSpells = {
          ...current.spells,
          preparedSlugs: nextPrepared,
        };
        return {
          updated: { ...current, spells: nextSpells },
          patch: { spells: nextSpells },
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

    addNoteCard: (note) => {
      const id =
        note?.id && note.id.trim().length > 0 ? note.id : crypto.randomUUID();
      applyActiveUpdate((current) => {
        const nextCards: CharacterNote[] = [
          ...(current.note_cards ?? []),
          {
            id,
            title:
              typeof note?.title === 'string' ? note.title.slice(0, 120) : '',
            content:
              typeof note?.content === 'string'
                ? note.content.slice(0, 4000)
                : '',
          },
        ];
        return {
          updated: { ...current, note_cards: nextCards },
          patch: { note_cards: nextCards },
        };
      });
      return id;
    },

    updateNoteCard: (id, patch) => {
      applyActiveUpdate((current) => {
        const nextCards = (current.note_cards ?? []).map((card) =>
          card.id !== id
            ? card
            : {
                ...card,
                title:
                  patch.title !== undefined
                    ? patch.title.slice(0, 120)
                    : card.title,
                content:
                  patch.content !== undefined
                    ? patch.content.slice(0, 4000)
                    : card.content,
              }
        );
        return {
          updated: { ...current, note_cards: nextCards },
          patch: { note_cards: nextCards },
        };
      });
    },

    deleteNoteCard: (id) => {
      applyActiveUpdate((current) => {
        const nextCards = (current.note_cards ?? []).filter(
          (card) => card.id !== id
        );
        return {
          updated: { ...current, note_cards: nextCards },
          patch: { note_cards: nextCards },
        };
      });
    },

    reorderNoteCard: (sourceId, targetId, position) => {
      applyActiveUpdate((current) => {
        const currentCards = current.note_cards ?? [];
        const nextCards = moveItemById(
          currentCards,
          sourceId,
          targetId,
          position
        );
        return {
          updated: { ...current, note_cards: nextCards },
          patch: { note_cards: nextCards },
        };
      });
    },

    saveActiveCharacter: async () => {
      const { activeCharacterId, characters } = get();
      if (!activeCharacterId) return;

      const current = characters.find((c) => c.id === activeCharacterId);
      if (!current) return;

      const existingTimer = debounceTimers.get(activeCharacterId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        debounceTimers.delete(activeCharacterId);
      }
      pendingPatches.delete(activeCharacterId);

      set({ isSaving: true });
      const fullPatch: UpdateCharacterPatch = {
        name: current.name,
        level: current.level,
        species: current.species,
        class_name: current.class_name,
        subclass_name: current.subclass_name,
        size: current.size,
        stats: current.stats,
        proficiencies: current.proficiencies,
        hp: current.hp,
        exhaustion: current.exhaustion,
        custom_resources: current.custom_resources,
        passive_traits: current.passive_traits,
        inventory: current.inventory,
        bag_of_holding: current.bag_of_holding,
        currency: current.currency,
        weapon_attacks: current.weapon_attacks,
        spells: current.spells,
        notes: current.notes,
        note_cards: current.note_cards,
      };

      try {
        await Promise.all([
          fetch(`/api/characters/${activeCharacterId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullPatch),
          }),
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]);
      } catch (err) {
        console.error('Failed to manually save character:', err);
      } finally {
        if (debounceTimers.size === 0) {
          set({ isSaving: false });
        }
      }
    },
  };
});
