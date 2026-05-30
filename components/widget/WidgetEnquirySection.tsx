'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import WidgetEnquiryForm from './WidgetEnquiryForm'

interface FormVehicle {
  id: string
  name: string
  registration: string
}

export interface DayPrefill {
  vehicleId: string
  pickupDate: string
  returnDate?: string
  seq: number
}

interface Props {
  companyId: string
  vehicles: FormVehicle[]
  primaryColor: string
  prefill?: DayPrefill | null
}

function hexToRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '54 143 139'
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`
}

export default function WidgetEnquirySection({ companyId, vehicles, primaryColor, prefill }: Props) {
  const t = useTranslations('widget')
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const brandRgb = hexToRgb(primaryColor)

  const handleOpen = useCallback(() => {
    setOpen(true)
    // Allow React to apply display:block before scrolling/focusing
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        const first = formRef.current.querySelector<HTMLElement>('select, input, textarea')
        first?.focus({ preventScroll: true })
      }
    }, 60)
  }, [])

  useEffect(() => {
    if (prefill == null) return
    handleOpen()
  }, [prefill, handleOpen])

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e5e5e5' }}>

      {/* CTA button — hidden once form is open */}
      <button
        onClick={handleOpen}
        aria-expanded={open}
        style={{
          display: open ? 'none' : 'inline-flex',
          alignItems: 'center',
          padding: '10px 22px',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: `rgb(${brandRgb})`,
          border: 'none',
          borderRadius: 7,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'opacity 0.15s',
        }}
      >
        {t('enquiry.ctaButton')}
      </button>

      {/* Form — always mounted so vehicle selection is preserved; shown via CSS only */}
      <div ref={formRef} style={{ display: open ? 'block' : 'none' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: '#282828' }}>
          {t('enquiry.formTitle')}
        </h2>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>
          {t('enquiry.formSubtitle')}
        </p>
        <WidgetEnquiryForm
          companyId={companyId}
          vehicles={vehicles}
          primaryColor={primaryColor}
          prefill={prefill}
        />
      </div>
    </div>
  )
}
