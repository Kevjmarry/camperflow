'use client';

import { useTranslations } from 'next-intl';
import type { EvidencePhoto } from './types';

type EvidencePhotos = { general: EvidencePhoto[]; damage: EvidencePhoto[]; id: EvidencePhoto[] };

type EvidenceBlockProps = {
  evidencePhotos: EvidencePhotos;
  onAdd: (group: 'general' | 'damage' | 'id', files: File[]) => void;
  onRemove: (group: 'general' | 'damage' | 'id', index: number) => void;
  isLocked: boolean;
  highlight?: boolean;
  title?: string;
  variant?: 'return';
};

export default function EvidenceBlock({ evidencePhotos, onAdd, onRemove, isLocked, highlight, title, variant }: EvidenceBlockProps) {
  const t = useTranslations('checklistDetail');
  const totalPhotos = evidencePhotos.general.length + evidencePhotos.damage.length + evidencePhotos.id.length;

  return (
    <div style={{
      border: highlight ? '1px solid #fca5a5' : '1px solid rgb(var(--border))',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: highlight ? 'rgba(239,68,68,0.03)' : undefined,
      transition: 'border-color 0.2s, background-color 0.2s',
    }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid rgb(var(--border))',
          backgroundColor: 'rgba(var(--brand), 0.02)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'rgb(var(--text))' }}>
          {title ?? t('auditEvidenceTitle')}
        </span>
      </div>

      <div
        style={{
          padding: '8px 14px 10px',
          borderBottom: '1px solid rgb(var(--border))',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0, lineHeight: '1.5' }}>
          {variant === 'return'
            ? <>Photograph the vehicle&apos;s general condition on return, then document any <strong style={{ fontWeight: 600, color: 'rgb(var(--text))' }}>new damage found</strong>.</>
            : t('auditEvidenceDesc')}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
          <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', fontWeight: 500 }}>
            {t('evidencePhotosCount', { count: totalPhotos })}
          </span>
        </div>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '0' }}>
        {(['general', 'damage', 'id'] as const).filter((g) => g !== 'id' || variant !== 'return').map((group) => (
          <div key={group} style={{
            display: 'flex', flexDirection: 'column', gap: '6px',
            ...(group !== 'general'
              ? { borderTop: '1px solid rgb(var(--border))', marginTop: '12px', paddingTop: '12px' }
              : {}),
          }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
              {group === 'general'
                ? 'General condition photos'
                : group === 'damage'
                  ? variant === 'return' ? <><strong style={{ fontWeight: 700 }}>New</strong> damage photos</> : 'Damage photos'
                  : <>{t('evidenceGroupId')} <span style={{ fontWeight: 400 }}>{t('evidenceGroupIdHint')}</span></>}
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {evidencePhotos[group].map((photo, idx) => {
                const src = photo.kind === 'new'
                  ? URL.createObjectURL(photo.file)
                  : photo.url;
                const alt = `${group} ${idx + 1}`;
                const isUploading = photo.kind === 'new';
                return (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      width: '64px',
                      height: '64px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: '1px solid rgb(var(--border))',
                      flexShrink: 0,
                      opacity: isUploading ? 0.6 : 1,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={alt}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {isUploading && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0,0,0,0.25)',
                      }}>
                        <span style={{ fontSize: '9px', color: '#fff', fontWeight: 600 }}>…</span>
                      </div>
                    )}
                    {!isLocked && !isUploading && (
                      <button
                        type="button"
                        onClick={() => onRemove(group, idx)}
                        style={{
                          position: 'absolute',
                          top: '3px',
                          right: '3px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0,0,0,0.55)',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '10px',
                          lineHeight: '16px',
                          textAlign: 'center',
                          padding: 0,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}

              {!isLocked && (
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    width: '64px',
                    height: '64px',
                    borderRadius: '6px',
                    border: '1.5px dashed rgb(var(--border))',
                    backgroundColor: 'rgb(var(--surface))',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > 0) onAdd(group, files);
                      e.target.value = '';
                    }}
                  />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5v14M5 12h14" stroke="rgb(var(--muted))" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span
                    style={{
                      fontSize: '9px',
                      color: 'rgb(var(--muted))',
                      textAlign: 'center',
                      lineHeight: '1.2',
                    }}
                  >
                    Add
                  </span>
                </label>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
