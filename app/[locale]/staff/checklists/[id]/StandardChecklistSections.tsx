'use client';

import { useTranslations } from 'next-intl';
import ChecklistItem from './ChecklistItem';
import type { ChecklistItemType } from './types';

type Section = { name: string; items: ChecklistItemType[] };

type StandardChecklistSectionsProps = {
  sections: Section[];
  isChecklistLocked: boolean;
  collapsedSections: Record<string, boolean>;
  onToggleSection: (name: string) => void;
  onCompleteSection: (name: string, items: ChecklistItemType[]) => void;
  renderItemProps: (item: ChecklistItemType) => React.ComponentProps<typeof ChecklistItem>;
};

export default function StandardChecklistSections({
  sections,
  isChecklistLocked,
  collapsedSections,
  onToggleSection,
  onCompleteSection,
  renderItemProps,
}: StandardChecklistSectionsProps) {
  const t = useTranslations('checklistDetail');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {sections.map(({ name, items: sectionItems }) => {
        const completedCount = sectionItems.filter((it) => it.checked).length;
        const totalCount = sectionItems.length;
        const allDone = completedCount === totalCount;
        const isCollapsed = !!collapsedSections[name];

        return (
          <div
            key={name}
            className="surface"
            style={{ borderRadius: '8px', overflow: 'hidden' }}
          >
            {/* Section header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: isCollapsed ? 'none' : '1px solid rgb(var(--border))',
                gap: '12px',
              }}
            >
              <button
                type="button"
                onClick={() => onToggleSection(name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    flexShrink: 0,
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                    color: 'rgb(var(--muted))',
                  }}
                >
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'rgb(var(--text))' }}>
                  {name}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    color: allDone ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
                    flexShrink: 0,
                  }}
                >
                  {t('sectionProgress', { completed: completedCount, total: totalCount })}
                </span>
              </button>

              {!isChecklistLocked && !allDone && (
                <button
                  type="button"
                  onClick={() => onCompleteSection(name, sectionItems)}
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'rgb(var(--brand))',
                    background: 'none',
                    border: '1px solid rgb(var(--brand))',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('completeSection')}
                </button>
              )}
            </div>

            {/* Section items */}
            {!isCollapsed && (
              <div
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {sectionItems.map((item) => (
                  <ChecklistItem key={item.id} {...renderItemProps(item)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
