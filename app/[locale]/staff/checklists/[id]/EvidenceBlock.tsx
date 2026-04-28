'use client';

import { useRef, useState, useEffect, type CSSProperties, type ChangeEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { EvidencePhoto } from './types';

type EvidencePhotos = { general: EvidencePhoto[]; damage: EvidencePhoto[]; id: EvidencePhoto[] };
type Group = 'general' | 'damage' | 'id';

type EvidenceBlockProps = {
  evidencePhotos: EvidencePhotos;
  onAdd: (group: Group, files: File[]) => void;
  onRemove: (group: Group, index: number) => void;
  onRotate?: (group: Group, index: number, rotation: number) => void;
  onRetry?: (group: Group, index: number) => void;
  isLocked: boolean;
  highlight?: boolean;
  title?: string;
  variant?: 'return';
};

/** A photo resolved to a plain src string, safe to pass across component boundaries. */
type ResolvedPhoto = {
  src: string;
  /** Only present for stored photos — used to show the download button. */
  downloadUrl?: string;
  /** Storage path, used to parse a timestamp for stored photos. */
  path?: string;
  /** Persisted rotation in degrees (0 | 90 | 180 | 270). */
  rotation: number;
};

type LightboxState = { photos: ResolvedPhoto[]; index: number; group: Group } | null;

const menuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '10px 14px',
  border: 'none',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  fontSize: '13px',
  color: 'rgb(var(--text))',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

/** Attempt to parse a Unix-ms timestamp from a storage filename like `1713456789000_abc.jpg`. */
function tryParseTimestamp(path: string, locale: string): string | null {
  try {
    const filename = path.split('/').pop() ?? '';
    const ts = parseInt(filename.split('_')[0], 10);
    // Must be a plausible ms timestamp (after 2001-09-09)
    if (!Number.isFinite(ts) || ts < 1_000_000_000_000) return null;
    return new Date(ts).toLocaleString(locale);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lightbox — receives pre-resolved photo data only; never calls createObjectURL
// ---------------------------------------------------------------------------

function PhotoLightbox({
  photos,
  group,
  initialIndex,
  onClose,
  onRotate,
}: {
  photos: ResolvedPhoto[];
  group: Group;
  initialIndex: number;
  onClose: () => void;
  onRotate?: (index: number, rotation: number) => void;
}) {
  const t = useTranslations('checklistDetail');
  const locale = useLocale();
  const [index, setIndex] = useState(initialIndex);
  const total = photos.length;
  const photo = photos[Math.min(index, total - 1)];
  const [rotation, setRotation] = useState(photo.rotation);
  const timestamp = photo.path ? tryParseTimestamp(photo.path, locale) : null;
  const showNav = total > 1;

  // Reset to the stored rotation of the newly displayed photo
  useEffect(() => { setRotation(photos[Math.min(index, photos.length - 1)].rotation); }, [index, photos]);

  const label =
    group === 'general'
      ? t('evidenceLabelGeneral')
      : group === 'damage'
        ? t('evidenceLabelDamage')
        : t('evidenceLabelId');

  // Keyboard: Escape closes, arrows navigate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (!showNav) return;
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, total, showNav]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const navBtn = (disabled: boolean): CSSProperties => ({
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#fff',
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.3 : 1,
    fontSize: '22px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s',
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        backgroundColor: 'rgba(0,0,0,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
          maxWidth: 'min(92vw, 920px)',
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('lightboxClose')}
          style={{
            position: 'absolute',
            top: '-44px',
            right: 0,
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.18)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>

        {/* Image — square bounding box fits any rotation without conditional logic:
            the shorter of (width budget, height budget) is used for both axes. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          alt={`${label} ${index + 1}`}
          style={{
            maxWidth: 'min(min(92vw, 920px), calc(90vh - 160px))',
            maxHeight: 'min(min(92vw, 920px), calc(90vh - 160px))',
            objectFit: 'contain',
            borderRadius: '8px',
            display: 'block',
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.2s ease',
          }}
        />

        {/* Rotate controls */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => {
              const next = (rotation - 90 + 360) % 360;
              setRotation(next);
              onRotate?.(index, next);
            }}
            aria-label={t('lightboxRotateLeft')}
            style={navBtn(false)}
          >
            ↺
          </button>
          <button
            type="button"
            onClick={() => {
              const next = (rotation + 90) % 360;
              setRotation(next);
              onRotate?.(index, next);
            }}
            aria-label={t('lightboxRotateRight')}
            style={navBtn(false)}
          >
            ↻
          </button>
        </div>

        {/* Navigation row — only rendered when group has more than one photo */}
        {showNav ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: '12px',
          }}>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
              style={navBtn(index === 0)}
              aria-label={t('lightboxPrev')}
            >
              ‹
            </button>
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '12px', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{label}</div>
              <div style={{ opacity: 0.7 }}>{index + 1} / {total}</div>
              {timestamp && <div style={{ opacity: 0.55, fontSize: '11px' }}>{timestamp}</div>}
            </div>
            <button
              type="button"
              disabled={index === total - 1}
              onClick={() => setIndex((i) => i + 1)}
              style={navBtn(index === total - 1)}
              aria-label={t('lightboxNext')}
            >
              ›
            </button>
          </div>
        ) : (
          /* Single photo: just show label + optional timestamp, no nav buttons */
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '12px', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>{label}</div>
            {timestamp && <div style={{ opacity: 0.55, fontSize: '11px' }}>{timestamp}</div>}
          </div>
        )}

        {/* Download — only for stored photos */}
        {photo.downloadUrl && (
          <a
            href={photo.downloadUrl}
            download
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255,255,255,0.13)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 500,
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {t('lightboxDownload')}
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EvidenceBlock
// ---------------------------------------------------------------------------

export default function EvidenceBlock({ evidencePhotos, onAdd, onRemove, onRotate, onRetry, isLocked, highlight, title, variant }: EvidenceBlockProps) {
  const t = useTranslations('checklistDetail');
  const totalPhotos = evidencePhotos.general.length + evidencePhotos.damage.length + evidencePhotos.id.length;
  const [openChooser, setOpenChooser] = useState<Group | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState>(null);

  const cameraRefs = useRef<Partial<Record<Group, HTMLInputElement>>>({});
  const galleryRefs = useRef<Partial<Record<Group, HTMLInputElement>>>({});

  // -------------------------------------------------------------------------
  // Object-URL cache: one stable blob URL per File, created once, revoked on
  // removal or unmount — never called bare inside render.
  // -------------------------------------------------------------------------
  const urlCache = useRef<Map<File, string>>(new Map());

  // Revoke URLs for files that have left evidencePhotos (e.g. removed or uploaded)
  useEffect(() => {
    const activeFiles = new Set<File>();
    for (const g of ['general', 'damage', 'id'] as const) {
      for (const p of evidencePhotos[g]) {
        if (p.kind === 'new' || p.kind === 'failed') activeFiles.add(p.file);
      }
    }
    urlCache.current.forEach((url, file) => {
      if (!activeFiles.has(file)) {
        URL.revokeObjectURL(url);
        urlCache.current.delete(file);
      }
    });
  }, [evidencePhotos]);

  // Revoke all on unmount
  useEffect(() => {
    const cache = urlCache.current;
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  /** Return a stable src string for any photo. Creates a blob URL once per File and caches it. */
  function getPreviewSrc(photo: EvidencePhoto): string {
    if (photo.kind === 'stored') return photo.url;
    const cached = urlCache.current.get(photo.file);
    if (cached) return cached;
    const url = URL.createObjectURL(photo.file);
    urlCache.current.set(photo.file, url);
    return url;
  }

  /** Build a pre-resolved snapshot of one group's photos for the lightbox. */
  function resolveGroup(group: Group): ResolvedPhoto[] {
    return evidencePhotos[group].map((p) => ({
      src: getPreviewSrc(p),
      downloadUrl: p.kind === 'stored'
        ? (p.url.includes('?') ? `${p.url}&download=` : `${p.url}?download=`)
        : undefined,
      path: p.kind === 'stored' ? p.path : undefined,
      rotation: p.kind === 'stored' ? p.rotation : 0,
    }));
  }

  // Close chooser on Escape (lightbox handles its own Escape separately)
  useEffect(() => {
    if (openChooser === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenChooser(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openChooser]);

  const handleFiles = (group: Group, e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onAdd(group, files);
    e.target.value = '';
    setOpenChooser(null);
  };

  return (
    <>
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          group={lightbox.group}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onRotate={onRotate ? (photoIndex, rot) => onRotate(lightbox.group, photoIndex, rot) : undefined}
        />
      )}

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
              ? t.rich('evidenceReturnDesc', { strong: (chunks) => <strong style={{ fontWeight: 600, color: 'rgb(var(--text))' }}>{chunks}</strong> })
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
                  ? t('evidenceGroupGeneral')
                  : group === 'damage'
                    ? variant === 'return' ? t.rich('evidenceGroupDamageReturn', { strong: (chunks) => <strong style={{ fontWeight: 700 }}>{chunks}</strong> }) : t('evidenceGroupDamage')
                    : <>{t('evidenceGroupId')} <span style={{ fontWeight: 400 }}>{t('evidenceGroupIdHint')}</span></>}
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {evidencePhotos[group].map((photo, idx) => {
                  const src = getPreviewSrc(photo);
                  const alt = `${group} ${idx + 1}`;
                  const isUploading = photo.kind === 'new';
                  const isFailed = photo.kind === 'failed';
                  return (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: '64px',
                        height: '64px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: isFailed ? '1.5px solid #ef4444' : '1px solid rgb(var(--border))',
                        flexShrink: 0,
                        opacity: isUploading ? 0.6 : 1,
                        cursor: (isUploading || isFailed) ? 'default' : 'zoom-in',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={alt}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          transform: photo.kind === 'stored' && photo.rotation
                            ? `rotate(${photo.rotation}deg)`
                            : undefined,
                        }}
                        onClick={(isUploading || isFailed) ? undefined : () => {
                          setLightbox({ photos: resolveGroup(group), index: idx, group });
                        }}
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
                      {isFailed && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(239,68,68,0.62)',
                          gap: '4px',
                        }}>
                          <span style={{ fontSize: '8px', color: '#fff', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, padding: '0 4px' }}>
                            {t('evidencePendingUpload')}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRetry?.(group, idx); }}
                            style={{
                              fontSize: '8px',
                              color: '#fff',
                              fontWeight: 600,
                              backgroundColor: 'rgba(255,255,255,0.22)',
                              border: '1px solid rgba(255,255,255,0.55)',
                              borderRadius: '3px',
                              padding: '2px 5px',
                              cursor: 'pointer',
                            }}
                          >
                            {t('evidenceRetry')}
                          </button>
                        </div>
                      )}
                      {!isLocked && !isUploading && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRemove(group, idx); }}
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
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {/* Hidden camera input (mobile: opens camera) */}
                    <input
                      ref={(el) => { cameraRefs.current[group] = el ?? undefined; }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      onChange={(e) => handleFiles(group, e)}
                    />
                    {/* Hidden gallery input (mobile: opens photo picker) */}
                    <input
                      ref={(el) => { galleryRefs.current[group] = el ?? undefined; }}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      onChange={(e) => handleFiles(group, e)}
                    />

                    {/* Add tile */}
                    <button
                      type="button"
                      aria-haspopup="true"
                      aria-expanded={openChooser === group}
                      onClick={() => setOpenChooser(openChooser === group ? null : group)}
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
                        padding: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 5v14M5 12h14" stroke="rgb(var(--muted))" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <span style={{ fontSize: '9px', color: 'rgb(var(--muted))', textAlign: 'center', lineHeight: '1.2' }}>
                        {t('evidenceAdd')}
                      </span>
                    </button>

                    {/* Chooser popover */}
                    {openChooser === group && (
                      <>
                        {/* Pointer backdrop */}
                        <div
                          style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                          onClick={() => setOpenChooser(null)}
                        />
                        <div
                          role="menu"
                          style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 6px)',
                            left: 0,
                            zIndex: 11,
                            backgroundColor: 'rgb(var(--surface))',
                            border: '1px solid rgb(var(--border))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                            overflow: 'hidden',
                            minWidth: '170px',
                          }}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            style={menuItemStyle}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(var(--brand),0.06)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            onClick={() => {
                              setOpenChooser(null);
                              cameraRefs.current[group]?.click();
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                            {t('evidenceTakePhoto')}
                          </button>
                          <div style={{ height: '1px', backgroundColor: 'rgb(var(--border))', margin: '0 10px' }} />
                          <button
                            type="button"
                            role="menuitem"
                            style={menuItemStyle}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(var(--brand),0.06)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            onClick={() => {
                              setOpenChooser(null);
                              galleryRefs.current[group]?.click();
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                              <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            {t('evidenceChoosePhoto')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
