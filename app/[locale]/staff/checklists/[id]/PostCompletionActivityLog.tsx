'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { ActivityLogEntry } from './types';

type PostCompletionActivityLogProps = {
  entries: ActivityLogEntry[];
  initialsByUserId: Record<string, string>;
  /** True once the checklist is completed and eligible for a general (non-item) supplementary note. */
  canAddNote?: boolean;
  onAddNote?: (text: string) => void;
};

type GroupedEntry = {
  key: string;
  created_by: string;
  created_at: string;
  kind: 'note' | 'photo';
  noteText?: string;
  photoCount?: number;
};

/** Photos uploaded together in a single batch share the same created_at (one INSERT statement) — group them into one "Added N photos" line. */
function groupEntries(entries: ActivityLogEntry[]): GroupedEntry[] {
  const sorted = [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groups = new Map<string, GroupedEntry>();
  for (const entry of sorted) {
    if (entry.kind === 'photo') {
      const key = `photo:${entry.created_by}:${entry.created_at}`;
      const existing = groups.get(key);
      if (existing) {
        existing.photoCount = (existing.photoCount ?? 0) + 1;
      } else {
        groups.set(key, {
          key,
          created_by: entry.created_by,
          created_at: entry.created_at,
          kind: 'photo',
          photoCount: 1,
        });
      }
    } else {
      groups.set(`note:${entry.id}`, {
        key: `note:${entry.id}`,
        created_by: entry.created_by,
        created_at: entry.created_at,
        kind: 'note',
        noteText: entry.note_text ?? '',
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export default function PostCompletionActivityLog({ entries, initialsByUserId, canAddNote, onAddNote }: PostCompletionActivityLogProps) {
  const t = useTranslations('checklistDetail');
  const locale = useLocale();
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  if (entries.length === 0 && !canAddNote) return null;

  const grouped = groupEntries(entries);

  const submitNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    onAddNote?.(trimmed);
    setNoteDraft('');
    setIsAddingNote(false);
  };

  return (
    <div
      className="surface"
      style={{
        marginBottom: '16px',
        borderRadius: '8px',
        border: '1px solid rgb(var(--border))',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '12px' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'rgb(var(--muted))',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {t('postCompletionAdditionsTitle')}
        </div>
        {canAddNote && !isAddingNote && (
          <button
            type="button"
            onClick={() => setIsAddingNote(true)}
            style={{
              fontSize: '12px',
              color: 'rgb(var(--brand))',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t('addNote')}
          </button>
        )}
      </div>

      {isAddingNote && (
        <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <textarea
            placeholder={t('notesPlaceholder')}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            className="input"
            autoFocus
            style={{ width: '100%', resize: 'vertical', fontSize: '14px', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={submitNote}
              disabled={!noteDraft.trim()}
              className="btn btn-primary"
              style={{ padding: '4px 12px', fontSize: '12px' }}
            >
              {t('saveNote')}
            </button>
            <button
              type="button"
              onClick={() => { setIsAddingNote(false); setNoteDraft(''); }}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid rgb(var(--border))',
                backgroundColor: 'rgb(var(--surface))',
                color: 'rgb(var(--muted))',
                cursor: 'pointer',
              }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {grouped.map((g) => (
          <div key={g.key} style={{ fontSize: '13px' }}>
            <div style={{ color: 'rgb(var(--muted))', fontSize: '12px' }}>
              {new Date(g.created_at).toLocaleString(locale)}
            </div>
            <div style={{ color: 'rgb(var(--text))', marginTop: '2px' }}>
              {g.kind === 'photo'
                ? t('activityAddedPhotos', { count: g.photoCount ?? 1 })
                : t('activityAddedNotePrefix')}
              {g.kind === 'note' && (
                <span style={{ display: 'block', fontStyle: 'italic', marginTop: '2px' }}>
                  &ldquo;{g.noteText}&rdquo;
                </span>
              )}
            </div>
            <div style={{ color: 'rgb(var(--muted))', fontSize: '12px', marginTop: '2px' }}>
              {initialsByUserId[g.created_by] ?? '?'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
