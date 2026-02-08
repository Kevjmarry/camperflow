"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import PageContainer from "@/components/PageContainer";

export default function DemoPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    contact: "",
    message: "",
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <PageContainer maxWidth="540px" showSignOut={false}>
      {!submitted ? (
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
                Request a demo
              </h1>
              <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
                Leave your details and we'll get back to you
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 'var(--space-4)' 
            }}>
              <div>
                <label htmlFor="name" className="label">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  className="input"
                  placeholder="Your name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label htmlFor="company" className="label">
                  Company
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  className="input"
                  placeholder="Your rental company"
                  value={formData.company}
                  onChange={handleChange}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label htmlFor="contact" className="label">
                  Email or phone
                </label>
                <input
                  id="contact"
                  name="contact"
                  type="text"
                  className="input"
                  placeholder="How can we reach you?"
                  value={formData.contact}
                  onChange={handleChange}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label htmlFor="message" className="label">
                  Message (optional)
                </label>
                <textarea
                  id="message"
                  name="message"
                  className="input"
                  placeholder="Tell us about your needs..."
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  style={{ 
                    width: '100%',
                    resize: 'vertical', 
                    minHeight: '100px',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ 
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box'
                }}
              >
                Send request
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 'var(--space-6)',
            textAlign: 'center'
          }}>
            <div 
              style={{ 
                width: '64px', 
                height: '64px', 
                margin: '0 auto',
                borderRadius: '50%',
                background: 'rgb(var(--brand-light))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg 
                style={{ 
                  width: '32px', 
                  height: '32px',
                  color: 'rgb(var(--brand))' 
                }}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M5 13l4 4L19 7" 
                />
              </svg>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <h2 style={{ fontSize: '24px', color: 'rgb(var(--text))' }}>
                Request received
              </h2>
              <p style={{ color: 'rgb(var(--muted))' }}>
                Thank you for your interest in CamperFlow. We'll be in touch soon.
              </p>
            </div>

            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: 'var(--space-3)',
              paddingTop: 'var(--space-4)'
            }}>
              <Link 
                href="/" 
                className="btn btn-primary"
                style={{ 
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box'
                }}
              >
                Back to home
              </Link>
              <Link 
                href="/app" 
                className="btn btn-secondary"
                style={{ 
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box'
                }}
              >
                Open app
              </Link>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}