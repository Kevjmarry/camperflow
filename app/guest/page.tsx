import Link from "next/link";

export default function GuestPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const bookingCode = searchParams.code || "Not provided";

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
              <div>
                <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
                  Guest Dashboard
                </h1>
                <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
                  Welcome! Here's your booking information.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <p className="label">Booking Code</p>
                  <p style={{ 
                    fontSize: '18px', 
                    fontWeight: 600, 
                    color: 'rgb(var(--text))' 
                  }}>
                    {bookingCode}
                  </p>
                </div>

                <div style={{ 
                  borderTop: '1px solid rgb(var(--border))',
                  paddingTop: 'var(--space-4)'
                }}>
                  <p style={{ fontSize: '15px', color: 'rgb(var(--muted))' }}>
                    This is a placeholder page. Your actual guest dashboard will show:
                  </p>
                  <ul style={{ 
                    marginTop: 'var(--space-3)', 
                    marginLeft: 'var(--space-6)', 
                    color: 'rgb(var(--muted))', 
                    fontSize: '15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)'
                  }}>
                    <li>Camper details and photos</li>
                    <li>Pickup/return dates and location</li>
                    <li>Equipment checklist</li>
                    <li>Contact information</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}