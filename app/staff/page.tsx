import Link from "next/link";

export default function StaffPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header style={{ borderBottom: '1px solid rgb(var(--border))' }}>
        <div className="container">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            height: '64px' 
          }}>
            <Link 
              href="/" 
              style={{ 
                fontWeight: 600, 
                fontSize: '18px',
                color: 'rgb(var(--text))',
                textDecoration: 'none'
              }}
            >
              CamperFlow
            </Link>
            <Link href="/" className="btn btn-ghost" style={{ 
              fontSize: '14px', 
              padding: 'var(--space-2) var(--space-4)',
              minHeight: '36px'
            }}>
              Sign out
            </Link>
          </div>
        </div>
      </header>

      <main style={{ 
        flex: 1,
        padding: 'var(--space-8) 0'
      }}>
        <div className="container-narrow">
          <div className="surface" style={{ padding: 'var(--space-8)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
                  Staff Dashboard
                </h1>
                <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
                  Operations hub for rental team members
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ 
                  borderTop: '1px solid rgb(var(--border))',
                  paddingTop: 'var(--space-4)',
                  textAlign: 'center'
                }}>
                  <p style={{ fontSize: '15px', color: 'rgb(var(--muted))' }}>
                    This is a placeholder page. Your actual staff dashboard will show:
                  </p>
                  <ul style={{ 
                    marginTop: 'var(--space-3)', 
                    textAlign: 'left',
                    maxWidth: '400px',
                    margin: 'var(--space-3) auto 0',
                    color: 'rgb(var(--muted))', 
                    fontSize: '15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)'
                  }}>
                    <li>• Active bookings and handovers</li>
                    <li>• Vehicle status overview</li>
                    <li>• Cleaning and maintenance tasks</li>
                    <li>• Return inspections</li>
                  </ul>
                </div>

                <div style={{ 
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 'var(--space-4)',
                  marginTop: 'var(--space-6)'
                }}>
                  <Link 
                    href="/staff/handover" 
                    className="surface" 
                    style={{ 
                      padding: 'var(--space-6)',
                      textAlign: 'center',
                      textDecoration: 'none',
                      transition: 'box-shadow 150ms ease'
                    }}
                  >
                    <h3 style={{ 
                      fontSize: '16px', 
                      marginBottom: 'var(--space-2)',
                      color: 'rgb(var(--text))'
                    }}>
                      New Handover
                    </h3>
                    <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
                      Start vehicle handover checklist
                    </p>
                  </Link>

                  <Link 
                    href="/staff/return" 
                    className="surface" 
                    style={{ 
                      padding: 'var(--space-6)',
                      textAlign: 'center',
                      textDecoration: 'none',
                      transition: 'box-shadow 150ms ease'
                    }}
                  >
                    <h3 style={{ 
                      fontSize: '16px', 
                      marginBottom: 'var(--space-2)',
                      color: 'rgb(var(--text))'
                    }}>
                      Process Return
                    </h3>
                    <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
                      Inspect returning vehicle
                    </p>
                  </Link>

                  <Link 
                    href="/staff/cleaning" 
                    className="surface" 
                    style={{ 
                      padding: 'var(--space-6)',
                      textAlign: 'center',
                      textDecoration: 'none',
                      transition: 'box-shadow 150ms ease'
                    }}
                  >
                    <h3 style={{ 
                      fontSize: '16px', 
                      marginBottom: 'var(--space-2)',
                      color: 'rgb(var(--text))'
                    }}>
                      Cleaning Tasks
                    </h3>
                    <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
                      View and complete cleaning
                    </p>
                  </Link>

                  <Link 
                    href="/staff/fleet" 
                    className="surface" 
                    style={{ 
                      padding: 'var(--space-6)',
                      textAlign: 'center',
                      textDecoration: 'none',
                      transition: 'box-shadow 150ms ease'
                    }}
                  >
                    <h3 style={{ 
                      fontSize: '16px', 
                      marginBottom: 'var(--space-2)',
                      color: 'rgb(var(--text))'
                    }}>
                      Fleet Overview
                    </h3>
                    <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
                      Check all vehicle status
                    </p>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}