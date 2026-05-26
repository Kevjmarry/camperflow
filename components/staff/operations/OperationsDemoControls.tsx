'use client'

import { useState, useEffect } from 'react'

export default function OperationsDemoControls() {
  const [screenshotMode, setScreenshotMode] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('demo-screenshot-mode', screenshotMode)
    return () => { document.body.classList.remove('demo-screenshot-mode') }
  }, [screenshotMode])

  async function handleReset() {
    if (resetting) return
    setResetting(true)
    try {
      const res = await fetch('/api/staff/demo/reset', { method: 'POST' })
      if (res.ok) {
        window.location.reload()
      } else {
        console.error('[demo reset] failed', res.status, await res.json())
        setResetting(false)
      }
    } catch (err) {
      console.error('[demo reset] error', err)
      setResetting(false)
    }
  }

  return (
    <>
      <style>{`body.demo-screenshot-mode .ops-demo-banner { display: none; }`}</style>
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
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Reset demo data"
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#92400e',
              background: 'transparent',
              border: '1px solid #fcd34d',
              borderRadius: 'var(--radius)',
              padding: '7px 12px',
              cursor: resetting ? 'not-allowed' : 'pointer',
              opacity: resetting ? 0.4 : 0.75,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {resetting ? 'Resetting…' : 'Reset demo data'}
          </button>
          <button
            onClick={() => setScreenshotMode(true)}
            title="Hide demo labels for screenshots"
            style={{
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
            }}
          >
            Screenshot mode
          </button>
        </div>
      )}
    </>
  )
}
