"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b" style={{ borderColor: 'rgb(var(--border))' }}>
        <div className="container">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="font-semibold text-lg hover:no-underline">
              CamperFlow
            </Link>
            <Link href="/" className="btn btn-ghost text-sm px-4 py-2 min-h-0">
              Back
            </Link>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 flex items-center justify-center" style={{ padding: 'var(--space-8) 0' }}>
        <div style={{ width: '100%', maxWidth: '540px', padding: '0 var(--space-4)' }}>
          {!submitted ? (
            <div className="surface p-8 space-y-6">
              <div>
                <h1 style={{ fontSize: '28px' }}>Request a demo</h1>
                <p style={{ marginTop: 'var(--space-2)' }}>
                  Leave your details and we'll get back to you.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                    style={{ resize: 'vertical', minHeight: '100px' }}
                  />
                </div>

                <button type="submit" className="btn btn-primary w-full">
                  Send request
                </button>
              </form>
            </div>
          ) : (
            <div className="surface p-8 space-y-6 text-center">
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
                  className="w-8 h-8" 
                  style={{ color: 'rgb(var(--brand))' }}
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

              <div className="space-y-3">
                <h2 style={{ fontSize: '24px' }}>Request received</h2>
                <p>
                  Thank you for your interest in CamperFlow. We'll be in touch soon.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                <Link href="/" className="btn btn-primary">
                  Back to home
                </Link>
                <Link href="/app" className="btn btn-secondary">
                  Open app
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}