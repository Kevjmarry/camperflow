'use client'

import { FormEvent, useState } from 'react'
import { useParams } from 'next/navigation'

interface Props {
  email: string
  sessionId: string
  plan: string | null
}

export default function SignupForm({ email, sessionId, plan }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/staff/stripe-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          password,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.error === 'email_taken') {
          setError('An account with this email already exists. Please sign in instead.')
        } else {
          setError(data.error || 'Something went wrong. Please try again.')
        }
        return
      }

      setSuccess(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'rgb(var(--success) / 0.1)',
          border: '1px solid rgb(var(--success) / 0.3)',
          borderRadius: 'var(--radius)',
          color: 'rgb(var(--success))',
          fontSize: '15px',
          textAlign: 'center',
          lineHeight: '1.6',
        }}
      >
        Account created! Check <strong>{email}</strong> to confirm your address, then{' '}
        <a
          href={`/${locale}/staff/login`}
          style={{ color: 'inherit', textDecoration: 'underline' }}
        >
          sign in here
        </a>
        .
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      {plan && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'rgb(var(--brand) / 0.08)',
            border: '1px solid rgb(var(--brand) / 0.25)',
            borderRadius: 'var(--radius)',
            fontSize: '13px',
            color: 'rgb(var(--brand))',
          }}
        >
          Plan: {plan}
        </div>
      )}

      <div>
        <label htmlFor="email" className="label">Email</label>
        <input
          id="email"
          type="email"
          className="input"
          value={email}
          readOnly
          style={{ width: '100%', opacity: 0.65, cursor: 'default' }}
        />
      </div>

      <div>
        <label htmlFor="fullName" className="label">Full name</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          className="input"
          placeholder="Jane Smith"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
          autoFocus
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label htmlFor="companyName" className="label">Company name</label>
        <input
          id="companyName"
          name="companyName"
          type="text"
          className="input"
          placeholder="Acme Camping Co."
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          autoComplete="organization"
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label htmlFor="password" className="label">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          style={{ width: '100%' }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgb(var(--error) / 0.1)',
            border: '1px solid rgb(var(--error) / 0.3)',
            borderRadius: 'var(--radius)',
            color: 'rgb(var(--error))',
            fontSize: '15px',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={loading}
        style={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  )
}
