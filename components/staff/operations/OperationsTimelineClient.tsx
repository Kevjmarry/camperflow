'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import OperationsBookingTimeline, { TimelineVehicleBlock } from './OperationsBookingTimeline'
import type { OpsTimelineVehicle, OpsTimelineBooking } from '@/lib/staff/operations/getOpsBookingTimeline'

const BLOCK_TYPES = ['unavailable', 'maintenance', 'work', 'owner_use', 'manual_note', 'external_hold'] as const
const BLOCK_TYPE_ICON: Record<string, string> = {
  maintenance:   '🔧',
  work:          '🛠',
  owner_use:     '🏠',
  manual_note:   '📝',
  external_hold: '🔗',
  unavailable:   '⛔',
}

interface BlockModalState {
  blockId?: string // undefined = create mode
  vehicleId: string
  blockType: string
  label: string
  startAt: string
  endAt: string
  sourceType?: string | null
  syncLocked?: boolean | null
}

interface CellMenu {
  vehicleId: string
  vehicleName: string
  dateISO: string
  x: number
  y: number
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dateToDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  vehicles: OpsTimelineVehicle[]
  bookings: OpsTimelineBooking[]
  vehicleBlocks?: TimelineVehicleBlock[]
  companyTimezone?: string
  today?: string
}

export default function OperationsTimelineClient({ vehicles, bookings, vehicleBlocks, companyTimezone, today }: Props) {
  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string
  const tBM = useTranslations('bookings.blockModal')
  const tBookings = useTranslations('bookings')
  const tBlockTypes = useTranslations('staff.operations.blockTypes')

  const [blockModal, setBlockModal] = useState<BlockModalState | null>(null)
  const [blockSaving, setBlockSaving] = useState(false)
  const [blockError, setBlockError] = useState('')
  const [cellMenu, setCellMenu] = useState<CellMenu | null>(null)

  const handleEditBlock = (block: TimelineVehicleBlock & { vehicleName: string }) => {
    setBlockError('')
    setBlockModal({
      blockId: block.id,
      vehicleId: block.vehicleId,
      blockType: block.blockType ?? 'unavailable',
      label: block.label ?? '',
      startAt: isoToDatetimeLocal(block.startAt),
      endAt: isoToDatetimeLocal(block.endAt),
      sourceType: block.sourceType,
      syncLocked: block.syncLocked,
    })
  }

  const handleCellClick = (payload: CellMenu) => {
    setCellMenu(payload)
  }

  const openCreateBlock = () => {
    if (!cellMenu) return
    setCellMenu(null)
    setBlockError('')
    const [y, mo, d] = cellMenu.dateISO.split('-').map(Number)
    const start = new Date(y, mo - 1, d, 9, 0)
    const end = new Date(y, mo - 1, d, 17, 0)
    setBlockModal({
      vehicleId: cellMenu.vehicleId,
      blockType: 'unavailable',
      label: '',
      startAt: dateToDatetimeLocal(start),
      endAt: dateToDatetimeLocal(end),
    })
  }

  const openNewBooking = () => {
    if (!cellMenu) return
    const params = new URLSearchParams()
    if (cellMenu.dateISO) params.set('date', cellMenu.dateISO)
    if (cellMenu.vehicleId) params.set('vehicleId', cellMenu.vehicleId)
    setCellMenu(null)
    router.push(`/${locale}/staff/bookings/new?${params.toString()}`)
  }

  const handleBlockSave = async () => {
    if (!blockModal) return
    setBlockError('')
    if (!blockModal.vehicleId || !blockModal.blockType || !blockModal.startAt || !blockModal.endAt) {
      setBlockError(tBM('errorRequired'))
      return
    }
    const startISO = new Date(blockModal.startAt).toISOString()
    const endISO = new Date(blockModal.endAt).toISOString()
    if (new Date(endISO) <= new Date(startISO)) {
      setBlockError(tBM('errorEndBeforeStart'))
      return
    }
    setBlockSaving(true)
    try {
      const isEdit = !!blockModal.blockId
      const res = await fetch(
        isEdit ? `/api/staff/vehicle-blocks/${blockModal.blockId}` : '/api/staff/vehicle-blocks',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleId: blockModal.vehicleId,
            blockType: blockModal.blockType,
            label: blockModal.label || null,
            startAt: startISO,
            endAt: endISO,
          }),
        },
      )
      if (!res.ok) {
        const d = await res.json()
        setBlockError(d.error || tBM('errorSave'))
        return
      }
      setBlockModal(null)
      router.refresh()
    } catch {
      setBlockError(tBM('errorSave'))
    } finally {
      setBlockSaving(false)
    }
  }

  const handleBlockDelete = async () => {
    if (!blockModal?.blockId) return
    setBlockSaving(true)
    try {
      await fetch(`/api/staff/vehicle-blocks/${blockModal.blockId}`, { method: 'DELETE' })
      setBlockModal(null)
      router.refresh()
    } catch {
      setBlockError(tBM('errorSave'))
    } finally {
      setBlockSaving(false)
    }
  }

  return (
    <>
      <OperationsBookingTimeline
        vehicles={vehicles}
        bookings={bookings}
        vehicleBlocks={vehicleBlocks}
        companyTimezone={companyTimezone}
        today={today}
        onEditBlock={handleEditBlock}
        onCellClick={handleCellClick}
      />

      {/* Cell-click context menu */}
      {cellMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1500 }}
          onClick={() => setCellMenu(null)}
        >
          <div
            style={{
              position: 'fixed',
              top: Math.min(cellMenu.y + 8, window.innerHeight - 96),
              left: Math.min(cellMenu.x + 8, window.innerWidth - 200),
              background: 'rgb(var(--surface))',
              border: '1px solid rgb(var(--border))',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-lg)',
              padding: '4px',
              zIndex: 1501,
              minWidth: '190px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 10px', fontSize: '13px', color: 'rgb(var(--text))', borderRadius: 'var(--radius-sm)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--muted) / 0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={openCreateBlock}
            >
              ⛔ {tBookings('addBlockedPeriod')}
            </button>
            <button
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 10px', fontSize: '13px', color: 'rgb(var(--text))', borderRadius: 'var(--radius-sm)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--muted) / 0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={openNewBooking}
            >
              + {tBookings('action.newBooking')}
            </button>
          </div>
        </div>
      )}

      {/* Blocked period create / edit modal */}
      {blockModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / 0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setBlockModal(null)}
        >
          <div
            style={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', minWidth: '280px', maxWidth: '440px', width: '90vw', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
                {blockModal.blockId ? tBM('titleEdit') : tBM('titleCreate')}
              </h2>
              <button onClick={() => setBlockModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: 'rgb(var(--muted))', fontSize: '16px', lineHeight: 1 }} aria-label="Close">✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('vehicleLabel')}</label>
                <select
                  className="input"
                  value={blockModal.vehicleId}
                  onChange={e => setBlockModal(m => m && ({ ...m, vehicleId: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('blockTypeLabel')}</label>
                <select
                  className="input"
                  value={blockModal.blockType}
                  onChange={e => setBlockModal(m => m && ({ ...m, blockType: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  {BLOCK_TYPES.map(bt => (
                    <option key={bt} value={bt}>{BLOCK_TYPE_ICON[bt]} {tBlockTypes(bt)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('labelField')}</label>
                <input
                  type="text"
                  className="input"
                  value={blockModal.label}
                  onChange={e => setBlockModal(m => m && ({ ...m, label: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('startAtLabel')}</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={blockModal.startAt}
                    onChange={e => setBlockModal(m => m && ({ ...m, startAt: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('endAtLabel')}</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={blockModal.endAt}
                    onChange={e => setBlockModal(m => m && ({ ...m, endAt: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {blockError && (
                <div style={{ fontSize: '13px', color: 'rgb(var(--error))' }}>{blockError}</div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBlockSave}
                  disabled={blockSaving}
                  style={{ flex: 1 }}
                >
                  {blockSaving ? '…' : tBM('save')}
                </button>
                {blockModal.blockId && (!blockModal.sourceType || blockModal.sourceType === 'manual' || blockModal.syncLocked === true) && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleBlockDelete}
                    disabled={blockSaving}
                  >
                    {tBM('delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
