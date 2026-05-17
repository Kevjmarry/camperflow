'use client';

import { useState } from 'react';

export interface FeedbackMessages {
  positive: string;
  negative: string;
  positiveSubtext: string;
  negativeSubtext: string;
  positiveHeading: string;
  positiveBody: string;
  reviewCta: string;
  positiveNoReviewUrl: string;
  negativeHeading: string;
  negativeBody: string;
  placeholder: string;
  submit: string;
  submitting: string;
  doneHeading: string;
  doneBody: string;
  previewBadge: string;
}

interface Props {
  bookingCode: string;
  googleReviewUrl: string | null;
  messages: FeedbackMessages;
  isPreview?: boolean;
}

type Step = 'choice' | 'positive' | 'negative' | 'done';


export default function FeedbackFunnel({ bookingCode, googleReviewUrl, messages: m, isPreview = false }: Props) {
  const [step, setStep] = useState<Step>('choice');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async () => {
    if (!feedback.trim() || submitting) return;
    if (isPreview) { setStep('done'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/guest/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: bookingCode, message: feedback.trim() }),
      });
      if (!res.ok) throw new Error('failed');
      setStep('done');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewBadge = isPreview ? (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <span style={{
        display: 'inline-block',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        padding: '2px 9px',
        borderRadius: '9999px',
        background: 'rgb(var(--brand-light))',
        color: 'rgb(var(--brand))',
        border: '1px solid rgb(var(--brand) / 0.25)',
        textTransform: 'uppercase',
      }}>
        {m.previewBadge}
      </span>
    </div>
  ) : null;

  function renderStep() {
    if (step === 'choice') {
      return (
        <>
          <style>{`
            .cf-fc { transition: box-shadow 0.15s, transform 0.15s; }
            .cf-fc:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.09); transform: translateY(-1px); }
            .cf-fc:active { transform: none; box-shadow: none; }
          `}</style>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '700px', margin: '0 auto' }}>
            <button
              type="button"
              className="cf-fc"
              onClick={() => setStep('positive')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                width: '100%',
                boxSizing: 'border-box',
                padding: 'var(--space-6)',
                border: '1.5px solid rgb(var(--success) / 0.35)',
                borderRadius: 'var(--radius-lg)',
                background: 'rgb(var(--success) / 0.04)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'rgb(var(--success) / 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                marginBottom: 'var(--space-4)',
                flexShrink: 0,
              }}>😊</div>
              <span style={{ display: 'block', fontSize: '17px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-2)' }}>
                {m.positive}
              </span>
              <span style={{ display: 'block', fontSize: '13px', color: 'rgb(var(--text-secondary))', lineHeight: 1.5, marginBottom: 'var(--space-4)' }}>
                {m.positiveSubtext}
              </span>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgb(var(--success))',
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 4l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>

            <button
              type="button"
              className="cf-fc"
              onClick={() => setStep('negative')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                width: '100%',
                boxSizing: 'border-box',
                padding: 'var(--space-6)',
                border: '1.5px solid rgb(var(--error) / 0.25)',
                borderRadius: 'var(--radius-lg)',
                background: 'rgb(var(--error) / 0.03)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'rgb(var(--error) / 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                marginBottom: 'var(--space-4)',
                flexShrink: 0,
              }}>😔</div>
              <span style={{ display: 'block', fontSize: '17px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-2)' }}>
                {m.negative}
              </span>
              <span style={{ display: 'block', fontSize: '13px', color: 'rgb(var(--text-secondary))', lineHeight: 1.5, marginBottom: 'var(--space-4)' }}>
                {m.negativeSubtext}
              </span>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '1.5px solid rgb(var(--error) / 0.4)',
                color: 'rgb(var(--error))',
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>
          </div>
        </>
      );
    }

    if (step === 'positive') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '700px', margin: '0 auto', width: '100%' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))' }}>
            {m.positiveHeading}
          </h2>
          <p style={{ fontSize: '14px', color: 'rgb(var(--text-secondary))', lineHeight: 1.65, margin: 0 }}>
            {m.positiveBody}
          </p>
          {googleReviewUrl ? (
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                alignSelf: 'flex-start',
                padding: 'var(--space-3) var(--space-5)',
                background: 'rgb(var(--brand))',
                color: 'white',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              {m.reviewCta}
            </a>
          ) : (
            <p style={{ fontSize: '14px', color: 'rgb(var(--text-secondary))', lineHeight: 1.65, margin: 0 }}>
              {m.positiveNoReviewUrl}
            </p>
          )}
        </div>
      );
    }

    if (step === 'negative') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '700px', margin: '0 auto', width: '100%' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))' }}>
            {m.negativeHeading}
          </h2>
          <p style={{ fontSize: '14px', color: 'rgb(var(--text-secondary))', lineHeight: 1.65, margin: 0 }}>
            {m.negativeBody}
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={m.placeholder}
            rows={5}
            style={{
              width: '100%',
              padding: 'var(--space-3) var(--space-4)',
              border: '1.5px solid rgb(var(--border))',
              borderRadius: 'var(--radius)',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
              color: 'rgb(var(--text))',
              background: 'rgb(var(--surface))',
              boxSizing: 'border-box',
            }}
          />
          {submitError && (
            <p style={{ fontSize: '13px', color: 'rgb(var(--error))', margin: 0 }}>{submitError}</p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !feedback.trim()}
            style={{
              alignSelf: 'flex-start',
              padding: 'var(--space-3) var(--space-5)',
              background: 'rgb(var(--brand))',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: submitting || !feedback.trim() ? 'not-allowed' : 'pointer',
              opacity: submitting || !feedback.trim() ? 0.55 : 1,
              fontFamily: 'inherit',
            }}
          >
            {submitting ? m.submitting : m.submit}
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: '700px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))' }}>
          {m.doneHeading}
        </h2>
        <p style={{ fontSize: '14px', color: 'rgb(var(--text-secondary))', lineHeight: 1.65, margin: 0 }}>
          {m.doneBody}
        </p>
      </div>
    );
  }

  return (
    <>
      {previewBadge}
      {renderStep()}
    </>
  );
}
