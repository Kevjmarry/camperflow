'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import type { DayPrefill } from './WidgetEnquirySection'

interface FormVehicle {
  id: string
  name: string
  registration: string
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

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 14,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
  color: '#282828',
  background: '#fff',
  boxSizing: 'border-box',
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 4,
}

export default function WidgetEnquiryForm({ companyId, vehicles, primaryColor, prefill }: Props) {
  const t = useTranslations('widget')
  const brandRgb = hexToRgb(primaryColor)

  const [vehicleId, setVehicleId] = useState(vehicles.length === 1 ? vehicles[0].id : '')
  const [pickupDate, setPickupDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const returnInputRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)

  // Apply timeline range-click prefill: set vehicle + pickup date + optional return date
  useEffect(() => {
    if (prefill == null) return
    setVehicleId(prefill.vehicleId)
    setPickupDate(prefill.pickupDate)
    setReturnDate(prefill.returnDate ?? '')
    // Only focus the return input when return date is not yet set
    if (!prefill.returnDate) {
      setTimeout(() => returnInputRef.current?.focus(), 100)
    }
  }, [prefill])

  // Derive vehicle display name for the email
  const selectedVehicle = vehicles.find(v => v.id === vehicleId)
  const vehicleName = selectedVehicle
    ? `${selectedVehicle.name} (${selectedVehicle.registration})`
    : ''

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim() || !pickupDate || !returnDate) {
      setError(t('enquiry.errorRequired'))
      return
    }
    if (returnDate <= pickupDate) {
      setError(t('enquiry.errorReturnDate'))
      return
    }
    if (vehicles.length > 1 && !vehicleId) {
      setError(t('enquiry.errorVehicle'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/widget/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          vehicleName,
          pickupDate,
          returnDate,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          message: message.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('enquiry.errorGeneric'))
      } else {
        setSubmitted(true)
      }
    } catch {
      setError(t('enquiry.errorNetwork'))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        padding: '20px 24px',
        background: `rgb(${brandRgb} / 0.08)`,
        border: `1px solid rgb(${brandRgb} / 0.30)`,
        borderRadius: 8,
        fontSize: 14,
        color: '#282828',
        lineHeight: 1.6,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>{t('enquiry.successTitle')}</div>
        {t('enquiry.successMessage')}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }} noValidate>

      {/* Vehicle selector — only shown when multiple vehicles */}
      {vehicles.length > 1 && (
        <div>
          <label htmlFor="wf-vehicle" style={LABEL_STYLE}>
            {t('enquiry.vehicleLabel')} <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            id="wf-vehicle"
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value)}
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            required
          >
            <option value="">{t('enquiry.vehiclePlaceholder')}</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.name} – {v.registration}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Date row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <label htmlFor="wf-pickup" style={LABEL_STYLE}>
            {t('enquiry.pickupLabel')} <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="wf-pickup"
            type="date"
            min={today}
            value={pickupDate}
            onChange={e => {
              setPickupDate(e.target.value)
              if (returnDate && e.target.value >= returnDate) setReturnDate('')
            }}
            style={INPUT_STYLE}
            required
          />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label htmlFor="wf-return" style={LABEL_STYLE}>
            {t('enquiry.returnLabel')} <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="wf-return"
            ref={returnInputRef}
            type="date"
            min={pickupDate || today}
            value={returnDate}
            onChange={e => setReturnDate(e.target.value)}
            style={INPUT_STYLE}
            required
          />
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="wf-name" style={LABEL_STYLE}>
          {t('enquiry.nameLabel')} <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="wf-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('enquiry.namePlaceholder')}
          style={INPUT_STYLE}
          required
          autoComplete="name"
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="wf-email" style={LABEL_STYLE}>
          {t('enquiry.emailLabel')} <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="wf-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={t('enquiry.emailPlaceholder')}
          style={INPUT_STYLE}
          required
          autoComplete="email"
        />
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="wf-phone" style={LABEL_STYLE}>{t('enquiry.phoneLabel')}</label>
        <input
          id="wf-phone"
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder={t('enquiry.phonePlaceholder')}
          style={INPUT_STYLE}
          autoComplete="tel"
        />
      </div>

      {/* Message */}
      <div>
        <label htmlFor="wf-message" style={LABEL_STYLE}>{t('enquiry.messageLabel')}</label>
        <textarea
          id="wf-message"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={t('enquiry.messagePlaceholder')}
          rows={3}
          style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 12px',
          background: 'rgb(239 68 68 / 0.08)',
          border: '1px solid rgb(239 68 68 / 0.35)',
          borderRadius: 6,
          fontSize: 13,
          color: '#b91c1c',
        }}>
          {error}
        </div>
      )}

      {/* Submit */}
      <div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            background: submitting ? `rgb(${brandRgb} / 0.60)` : `rgb(${brandRgb})`,
            border: 'none',
            borderRadius: 6,
            cursor: submitting ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
            fontFamily: 'inherit',
          }}
        >
          {submitting ? t('enquiry.submitting') : t('enquiry.submit')}
        </button>
      </div>
    </form>
  )
}
