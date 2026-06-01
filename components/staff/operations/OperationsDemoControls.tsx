'use client'

import { useState, useEffect, useRef } from 'react'

type DryRunResult = {
  dryRun: true
  snapshotCapturedAt: string
  needsConfirmation: boolean
  counts: Record<string, { current: number; snapshot: number }>
}

const SHORTCUTS = [
  { label: 'Pickup story',     id: 'ops-section-on-rent' },
  { label: 'Return story',     id: 'ops-section-next-up' },
  { label: 'Review story',     id: 'ops-section-reminders' },
  { label: 'Compliance story', id: 'ops-section-attention' },
] as const

export default function OperationsDemoControls() {
  const [screenshotMode, setScreenshotMode] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [restored, setRestored] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const shortcutsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.classList.toggle('demo-screenshot-mode', screenshotMode)
    return () => { document.body.classList.remove('demo-screenshot-mode') }
  }, [screenshotMode])

  useEffect(() => {
    if (!shortcutsOpen) return
    function handleClick(e: MouseEvent) {
      if (!shortcutsRef.current?.contains(e.target as Node)) setShortcutsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [shortcutsOpen])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setShortcutsOpen(false)
  }

  async function handleReset() {
    if (resetting) return
    setResetting(true)
    setResetError(null)
    setDryRunResult(null)
    setRestored(false)
    try {
      const res = await fetch('/api/staff/demo/reset', { method: 'POST' })
      const body = await res.json()
      if (res.ok && body.dryRun) {
        setDryRunResult(body as DryRunResult)
        setResetting(false)
      } else if (res.ok) {
        window.location.reload()
      } else {
        setResetError(body.error ?? 'Reset failed')
        setResetting(false)
      }
    } catch (err) {
      console.error('[demo reset] error', err)
      setResetError('Reset failed')
      setResetting(false)
    }
  }

  async function handleConfirm() {
    if (confirming) return
    setConfirming(true)
    setResetError(null)
    try {
      const res = await fetch('/api/staff/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmRestore: true }),
      })
      const body = await res.json()
      if (res.ok && body.restored) {
        setDryRunResult(null)
        setRestored(true)
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setResetError(body.error ?? 'Restore failed')
        setConfirming(false)
      }
    } catch (err) {
      console.error('[demo restore] error', err)
      setResetError('Restore failed')
      setConfirming(false)
    }
  }

  const sharedBtnStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 500,
    color: '#92400e',
    background: 'transparent',
    border: '1px solid #fcd34d',
    borderRadius: 'var(--radius)',
    padding: '7px 12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    opacity: 0.75,
  }

  return (
    <>
      <style>{`
        body.demo-screenshot-mode .ops-demo-banner { display: none; }
        .ops-shortcut-item:hover { background: rgb(var(--border) / 0.35) !important; }
      `}</style>
      {screenshotMode ? (
        <button
          onClick={() => setScreenshotMode(false)}
          title="Exit screenshot mode"
          style={{
            fontSize: '10px',
            fontWeight: 400,
            color: 'rgb(var(--muted))',
            background: 'transparent',
            border: 'none',
            padding: '4px 6px',
            cursor: 'pointer',
            opacity: 0.4,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            letterSpacing: '0.01em',
          }}
        >
          Exit screenshot mode
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

          {/* Demo shortcuts dropdown */}
          <div ref={shortcutsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShortcutsOpen(v => !v)}
              style={sharedBtnStyle}
            >
              Demo shortcuts ▾
            </button>
            {shortcutsOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: 'rgb(var(--surface))',
                border: '1px solid rgb(var(--border))',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow)',
                zIndex: 50,
                minWidth: '152px',
                overflow: 'hidden',
              }}>
                {SHORTCUTS.map(s => (
                  <button
                    key={s.id}
                    className="ops-shortcut-item"
                    onClick={() => scrollTo(s.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 400,
                      color: 'rgb(var(--text))',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset button + dry-run / confirm panel */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <button
                onClick={handleReset}
                disabled={resetting || confirming}
                title="Reset demo data"
                style={{
                  ...sharedBtnStyle,
                  cursor: (resetting || confirming) ? 'not-allowed' : 'pointer',
                  opacity: (resetting || confirming) ? 0.4 : 0.75,
                }}
              >
                {resetting ? 'Checking…' : restored ? 'Restored!' : 'Reset demo data'}
              </button>
              {resetError && (
                <span style={{ fontSize: '10px', color: '#b91c1c', whiteSpace: 'nowrap' }}>
                  {resetError}
                </span>
              )}
            </div>

            {dryRunResult && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: 'rgb(var(--surface))',
                border: '1px solid rgb(var(--border))',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow)',
                zIndex: 50,
                padding: '10px 14px',
                fontSize: '11px',
                color: 'rgb(var(--text))',
                minWidth: '320px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, color: '#92400e' }}>Dry-run — no changes made</span>
                  <button
                    onClick={() => setDryRunResult(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'rgb(var(--muted))', padding: '0 0 0 8px', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ color: 'rgb(var(--muted))', marginBottom: '8px', fontSize: '10px' }}>
                  Snapshot: {new Date(dryRunResult.snapshotCapturedAt).toLocaleString()}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgb(var(--border))' }}>
                      <th style={{ textAlign: 'left', padding: '2px 6px 4px 0', fontWeight: 500, color: 'rgb(var(--muted))' }}>Table</th>
                      <th style={{ textAlign: 'right', padding: '2px 6px 4px', fontWeight: 500, color: 'rgb(var(--muted))' }}>Current</th>
                      <th style={{ textAlign: 'right', padding: '2px 0 4px 6px', fontWeight: 500, color: 'rgb(var(--muted))' }}>Snapshot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dryRunResult.counts).map(([table, { current, snapshot }]) => (
                      <tr key={table} style={{ borderBottom: '1px solid rgb(var(--border) / 0.4)' }}>
                        <td style={{ padding: '3px 6px 3px 0', fontFamily: 'monospace', fontSize: '10px' }}>{table}</td>
                        <td style={{ textAlign: 'right', padding: '3px 6px' }}>{current}</td>
                        <td style={{
                          textAlign: 'right',
                          padding: '3px 0 3px 6px',
                          color: current !== snapshot ? '#b45309' : 'inherit',
                          fontWeight: current !== snapshot ? 600 : 400,
                        }}>{snapshot}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                  {dryRunResult.needsConfirmation ? (
                    <>
                      <span style={{ fontSize: '10px', color: 'rgb(var(--muted))' }}>
                        Counts differ — restore to snapshot?
                      </span>
                      <button
                        onClick={handleConfirm}
                        disabled={confirming}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#fff',
                          background: confirming ? '#9a3412' : '#c2410c',
                          border: 'none',
                          borderRadius: 'var(--radius)',
                          padding: '5px 12px',
                          cursor: confirming ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {confirming ? 'Restoring…' : 'Confirm Restore'}
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '10px', color: '#059669' }}>
                        All counts match snapshot
                      </span>
                      <button
                        onClick={handleConfirm}
                        disabled={confirming}
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: '#374151',
                          background: 'transparent',
                          border: '1px solid rgb(var(--border))',
                          borderRadius: 'var(--radius)',
                          padding: '5px 12px',
                          cursor: confirming ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                          opacity: confirming ? 0.4 : 1,
                        }}
                      >
                        {confirming ? 'Restoring…' : 'Restore anyway'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setScreenshotMode(true)}
            title="Hide demo labels for screenshots"
            style={sharedBtnStyle}
          >
            Screenshot mode
          </button>
        </div>
      )}
    </>
  )
}
