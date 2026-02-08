"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function AppEntryPage() {
  const router = useRouter();
  const [bookingCode, setBookingCode] = useState("");

  const handleGuestSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (bookingCode.trim()) {
      router.push(`/guest?code=${encodeURIComponent(bookingCode.trim())}`);
    }
  };

  const handleStaffLogin = () => {
    router.push('/staff/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal header */}
      <header style={{ borderBottom: '1px solid rgb(var(--border))' }}>
        <div className="container">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            height: '64px' 
          }}>
            <div style={{ 
              fontWeight: 600, 
              fontSize: '18px',
              color: 'rgb(var(--text))'
            }}>
              CamperFlow
            </div>
          </div>
        </div>
      </header>

      {/* Centered card */}
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: 'var(--space-6) 0'
      }}>
        <div style={{ 
          width: '100%', 
          maxWidth: '480px', 
          padding: '0 var(--space-4)' 
        }}>
          <div className="surface" style={{ padding: 'var(--space-8)' }}>
            {/* Single container for consistent width */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 'var(--space-8)',
              width: '100%'
            }}>
              {/* Guest Access - Primary */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 'var(--space-4)',
                width: '100%'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ 
                    fontSize: '24px', 
                    marginBottom: 'var(--space-2)',
                    color: 'rgb(var(--text))'
                  }}>
                    Guest Access
                  </h2>
                  <p style={{ 
                    fontSize: '15px',
                    color: 'rgb(var(--muted))'
                  }}>
                    Enter your booking code to view your camper details
                  </p>
                </div>

                <form onSubmit={handleGuestSubmit} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 'var(--space-4)',
                  width: '100%'
                }}>
                  <div style={{ width: '100%' }}>
                    <label 
                      htmlFor="bookingCode" 
                      className="label" 
                      style={{ textAlign: 'center' }}
                    >
                      Booking code
                    </label>
                    <input
                      id="bookingCode"
                      type="text"
                      className="input"
                      placeholder="e.g. CF-2024-1234"
                      value={bookingCode}
                      onChange={(e) => setBookingCode(e.target.value)}
                      autoComplete="off"
                      autoFocus
                      style={{ width: '100%' }}
                    />
                    <p className="helper-text" style={{ textAlign: 'center' }}>
                      You'll find this in your confirmation email
                    </p>
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
                    Continue
                  </button>
                </form>
              </div>

              {/* Divider */}
              <div className="divider">
                <span>or</span>
              </div>

              {/* Staff Login - Secondary */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 'var(--space-4)',
                width: '100%'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ 
                    fontSize: '18px', 
                    marginBottom: 'var(--space-2)',
                    color: 'rgb(var(--text))'
                  }}>
                    Staff Login
                  </h3>
                  <p style={{ 
                    fontSize: '15px',
                    color: 'rgb(var(--muted))'
                  }}>
                    Access the rental operations dashboard
                  </p>
                </div>

                <button 
                  onClick={handleStaffLogin}
                  className="btn btn-secondary" 
                  style={{ 
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  Staff login
                </button>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p style={{ 
            textAlign: 'center', 
            marginTop: 'var(--space-6)',
            fontSize: '13px',
            color: 'rgb(var(--muted))'
          }}>
            By continuing you agree to the rental rules and privacy policy
          </p>
        </div>
      </main>
    </div>
  );
}