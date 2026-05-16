'use client';

import { useState } from 'react';

export interface FeedbackMessages {
  positive: string;
  negative: string;
  positiveHeading: string;
  positiveBody: string;
  reviewCta: string;
  negativeHeading: string;
  negativeBody: string;
  placeholder: string;
  submit: string;
  submitting: string;
  doneHeading: string;
  doneBody: string;
}

interface Props {
  bookingCode: string;
  googleReviewUrl: string | null;
  messages: FeedbackMessages;
}

type Step = 'choice' | 'positive' | 'negative' | 'done';

const choiceBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  padding: 'var(--space-5) var(--space-6)',
  border: '1.5px solid rgb(var(--border))',
  borderRadius: 'var(--radius)',
  fontSize: '15px',
  fontWeight: 500,
  cursor: 'pointer',
  background: 'rgb(var(--surface))',
  color: 'rgb(var(--text))',
  textAlign: 'center',
  transition: 'border-color 0.15s, background 0.15s',
  fontFamily: 'inherit',
};

export default function FeedbackFunnel({ bookingCode, googleReviewUrl, messages: m }: Props) {
  const [step, setStep] = useState<Step>('choice');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async () => {
    if (!feedback.trim() || submitting) return;
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

  if (step === 'choice') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <button type="button" style={choiceBtnStyle} onClick={() => setStep('positive')}>
          {m.positive}
        </button>
        <button type="button" style={choiceBtnStyle} onClick={() => setStep('negative')}>
          {m.negative}
        </button>
      </div>
    );
  }

  if (step === 'positive') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))' }}>
          {m.positiveHeading}
        </h2>
        <p style={{ fontSize: '14px', color: 'rgb(var(--text-secondary))', lineHeight: 1.65, margin: 0 }}>
          {m.positiveBody}
        </p>
        {googleReviewUrl && (
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
        )}
      </div>
    );
  }

  if (step === 'negative') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))' }}>
        {m.doneHeading}
      </h2>
      <p style={{ fontSize: '14px', color: 'rgb(var(--text-secondary))', lineHeight: 1.65, margin: 0 }}>
        {m.doneBody}
      </p>
    </div>
  );
}
