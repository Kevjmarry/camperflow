'use client'

import { useState, useEffect, useRef } from 'react'

const SHORTCUTS = [
  { label: 'Pickup story',     id: 'ops-section-on-rent' },
  { label: 'Return story',     id: 'ops-section-next-up' },
  { label: 'Review story',     id: 'ops-section-reminders' },
  { label: 'Compliance story', id: 'ops-section-attention' },
] as const

export default function OperationsDemoControls() {
  const [screenshotMode, setScreenshotMode] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
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
    try {
      const res = await fetch('/api/staff/demo/reset', { method: 'POST' })
      if (res.ok) {
        window.location.reload()
      } else {
        const body = await res.json()
        setResetError(body.error ?? 'Reset failed')
        setResetting(false)
      }
    } catch (err) {
      console.error('[demo reset] error', err)
      setResetError('Reset failed')
      setResetting(false)
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

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <button
              onClick={handleReset}
              disabled={resetting}
              title="Reset demo data"
              style={{
                ...sharedBtnStyle,
                cursor: resetting ? 'not-allowed' : 'pointer',
                opacity: resetting ? 0.4 : 0.75,
              }}
            >
              {resetting ? 'Resetting…' : 'Reset demo data'}
            </button>
            {resetError && (
              <span style={{ fontSize: '10px', color: '#b91c1c', whiteSpace: 'nowrap' }}>
                {resetError}
              </span>
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
