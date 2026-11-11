import React, { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { useCharacterStore } from '../store';

/**
 * Notes workspace page with a full-width Custom Proficiencies & Skills bar on top
 * (adding responsive auto-sizing fields horizontally first, then wrapping vertically)
 * and a 4-column drag-reorderable Notes grid below.
 */
export function NotesPage(): React.JSX.Element | null {
  const {
    characters,
    activeCharacterId,
    addCustomProficiency,
    updateCustomProficiency,
    deleteCustomProficiency,
    addNoteCard,
    updateNoteCard,
    deleteNoteCard,
    reorderNoteCard,
  } = useCharacterStore();

  const activeCharacter = characters.find((c) => c.id === activeCharacterId);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [pendingFocusNoteId, setPendingFocusNoteId] = useState<string | null>(
    null
  );
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const noteTitleRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    setDraggedNoteId(null);
    setDragOverTarget(null);
  }, [activeCharacterId]);

  useEffect(() => {
    if (!pendingFocusId) return;
    const input = inputRefs.current.get(pendingFocusId);
    if (input) {
      input.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, activeCharacter?.proficiencies.customProficiencies]);

  useEffect(() => {
    if (!pendingFocusNoteId) return;
    const input = noteTitleRefs.current.get(pendingFocusNoteId);
    if (input) {
      input.focus();
      setPendingFocusNoteId(null);
    }
  }, [pendingFocusNoteId, activeCharacter?.note_cards]);

  if (!activeCharacter) {
    return null;
  }

  const customProficiencies = activeCharacter.proficiencies.customProficiencies ?? [];
  const noteCards = activeCharacter.note_cards ?? [];

  const handleAddRow = () => {
    const newId = addCustomProficiency('');
    setPendingFocusId(newId);
  };

  const handleAddNote = () => {
    const newId = addNoteCard({ title: '', content: '' });
    setPendingFocusNoteId(newId);
  };

  return (
    <main className="space-y-4">
      {/* Top: Full-Width Custom Proficiencies & Skills Panel */}
      <section className="bg-[var(--card)] rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
            ВЛАДЕНИЯ И НАВЫКИ
          </h2>

          <button
            type="button"
            aria-label="Добавить владение"
            title="Добавить владение"
            onClick={handleAddRow}
            className="relative w-6 h-6 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors cursor-pointer shrink-0"
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

        {customProficiencies.length === 0 ? (
          <div className="rounded-xl bg-[var(--paper)]/60 px-3 py-3 text-center">
            <p className="text-xs text-[var(--muted)] font-serif">
              Нажмите +, чтобы добавить владение
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {customProficiencies.map((entry) => (
              <div
                key={entry.id}
                className="inline-flex max-w-full items-center gap-1.5 bg-[var(--paper)] rounded-xl px-2.5 py-1.5"
              >
                <span
                  className="inline-grid min-w-0 flex-1 items-center overflow-hidden"
                  style={{ gridTemplateColumns: 'minmax(0, max-content)' }}
                >
                  <span
                    aria-hidden="true"
                    className="col-start-1 row-start-1 invisible whitespace-pre pointer-events-none select-none px-0.5 text-xs"
                  >
                    {entry.text.length > 0 ? entry.text : 'Впишите владение...'}
                  </span>
                  <input
                    ref={(el) => {
                      if (el) {
                        inputRefs.current.set(entry.id, el);
                      } else {
                        inputRefs.current.delete(entry.id);
                      }
                    }}
                    type="text"
                    size={1}
                    value={entry.text}
                    maxLength={200}
                    placeholder="Впишите владение..."
                    aria-label="Своё владение"
                    onChange={(e) => updateCustomProficiency(entry.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRow();
                      }
                    }}
                    className="col-start-1 row-start-1 w-full min-w-[4ch] bg-transparent px-0.5 text-xs text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_55%,transparent)]"
                  />
                </span>

                <button
                  type="button"
                  aria-label={`Удалить владение ${entry.text || ''}`.trim()}
                  title="Удалить поле"
                  onClick={() => deleteCustomProficiency(entry.id)}
                  className="w-5 h-5 rounded-full text-[var(--muted)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-sm leading-none flex items-center justify-center cursor-pointer transition-colors shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bottom: 4-per-row Reorderable Notes Grid */}
      <section className="bg-[var(--card)] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-medium">
            ЗАМЕТКИ
          </h2>

          <button
            type="button"
            aria-label="Добавить заметку"
            title="Добавить заметку"
            onClick={handleAddNote}
            className="relative w-6 h-6 rounded-full bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors cursor-pointer shrink-0"
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

        {noteCards.length === 0 ? (
          <div className="rounded-xl bg-[var(--paper)]/60 px-3 py-8 text-center">
            <p className="text-xs text-[var(--muted)] font-serif">
              Нажмите +, чтобы добавить заметку
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5"
            onDragOver={(e) => {
              if (draggedNoteId) e.preventDefault();
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverTarget(null);
              }
            }}
            onDrop={() => {
              if (draggedNoteId && dragOverTarget) {
                reorderNoteCard(
                  draggedNoteId,
                  dragOverTarget.id,
                  dragOverTarget.position
                );
              }
              setDraggedNoteId(null);
              setDragOverTarget(null);
            }}
          >
            {noteCards.map((note) => {
              const isDragging = draggedNoteId === note.id;
              const dropPosition =
                dragOverTarget?.id === note.id ? dragOverTarget.position : null;

              return (
                <article
                  key={note.id}
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
                    setDraggedNoteId(note.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', note.id);
                  }}
                  onDragOver={(e) => {
                    if (!draggedNoteId || draggedNoteId === note.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: 'before' | 'after' =
                      e.clientX < rect.left + rect.width / 2
                        ? 'before'
                        : 'after';
                    if (
                      dragOverTarget?.id !== note.id ||
                      dragOverTarget.position !== position
                    ) {
                      setDragOverTarget({ id: note.id, position });
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const sourceId =
                      draggedNoteId ?? e.dataTransfer.getData('text/plain');
                    if (sourceId && sourceId !== note.id) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const position: 'before' | 'after' =
                        e.clientX < rect.left + rect.width / 2
                          ? 'before'
                          : 'after';
                      reorderNoteCard(sourceId, note.id, position);
                    }
                    setDraggedNoteId(null);
                    setDragOverTarget(null);
                  }}
                  onDragEnd={() => {
                    setDraggedNoteId(null);
                    setDragOverTarget(null);
                  }}
                  className={`relative bg-[var(--paper)] rounded-xl p-2.5 flex flex-col gap-2 transition-all ${
                    isDragging ? 'opacity-45 scale-[0.98]' : ''
                  }`}
                >
                  {dropPosition === 'before' && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-1.5 top-2 bottom-2 w-0.5 rounded-full bg-[var(--ink)]"
                    />
                  )}
                  {dropPosition === 'after' && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-1.5 top-2 bottom-2 w-0.5 rounded-full bg-[var(--ink)]"
                    />
                  )}

                  {/* Note Header: Drag Handle + Title + Delete */}
                  <div className="flex items-center gap-1.5 border-b border-[var(--line)]/60 pb-1.5">
                    <span
                      title="Перетащите, чтобы поменять заметки местами"
                      aria-label="Перетащить заметку"
                      className="w-4 h-6 inline-flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] cursor-grab active:cursor-grabbing shrink-0 select-none"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>

                    <input
                      ref={(el) => {
                        if (el) {
                          noteTitleRefs.current.set(note.id, el);
                        } else {
                          noteTitleRefs.current.delete(note.id);
                        }
                      }}
                      type="text"
                      value={note.title}
                      maxLength={120}
                      placeholder="Заголовок..."
                      aria-label="Заголовок заметки"
                      onChange={(e) =>
                        updateNoteCard(note.id, { title: e.target.value })
                      }
                      className="min-w-0 flex-1 bg-transparent font-serif text-sm font-semibold leading-snug text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_55%,transparent)]"
                    />

                    <button
                      type="button"
                      aria-label={`Удалить заметку ${note.title || ''}`.trim()}
                      title="Удалить заметку"
                      onClick={() => deleteNoteCard(note.id)}
                      className="w-5 h-5 rounded-full text-[var(--muted)] hover:bg-[var(--ink)] hover:text-[var(--paper)] text-sm leading-none flex items-center justify-center cursor-pointer transition-colors shrink-0"
                    >
                      ×
                    </button>
                  </div>

                  {/* Note Body */}
                  <textarea
                    value={note.content}
                    rows={5}
                    maxLength={4000}
                    placeholder="Информация..."
                    aria-label="Информация заметки"
                    onChange={(e) =>
                      updateNoteCard(note.id, { content: e.target.value })
                    }
                    className="w-full min-h-[110px] flex-1 resize-y rounded-lg bg-[var(--card)] px-2.5 py-2 text-xs leading-relaxed text-[var(--ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_55%,transparent)]"
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
