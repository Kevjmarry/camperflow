import { createClient } from '@/lib/supabase/server'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function GuestBookingPage({ params }: PageProps) {
  const { id: codeRaw } = await params
  const code = decodeURIComponent(codeRaw || '').trim()
  const supabase = await createClient()

  const { data: booking, error: bookingError } = await supabase
    .rpc('get_guest_booking_by_code', { p_code: code })
    .maybeSingle()

  if (bookingError) {
    return (
      <div className="surface" style={{ padding: 'var(--space-8)', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: 'var(--space-4)' }}>
          Booking Not Accessible
        </h1>
        <p style={{ marginBottom: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
          The booking code <span style={{ fontFamily: 'monospace', fontWeight: '600', color: 'rgb(var(--text))' }}>{code}</span> could not be accessed.
        </p>
        <p style={{ color: 'rgb(var(--muted))' }}>
          Please contact us and quote your booking code.
        </p>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="surface" style={{ padding: 'var(--space-8)', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: 'var(--space-4)' }}>
          Booking Not Found
        </h1>
        <p style={{ color: 'rgb(var(--muted))' }}>
          The booking code <span style={{ fontFamily: 'monospace', fontWeight: '600', color: 'rgb(var(--text))' }}>{code}</span> does not exist.
        </p>
      </div>
    )
  }

  const safeStatus = booking.status || 'pending'

  let vehicle = null
  if (booking.vehicle_id) {
    const { data, error: vehicleError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', booking.vehicle_id)
      .maybeSingle()
    if (!vehicleError) {
      vehicle = data
    }
  }

  const { data: checklistsData } = await supabase
    .rpc('get_guest_checklists_by_code', { p_code: code })
  
  const checklists = checklistsData || []

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not specified'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getStatusStyle = (status: string) => {
    const styles: Record<string, { bg: string; text: string; border: string }> = {
      confirmed: { bg: 'rgb(var(--success) / 0.1)', text: 'rgb(var(--success))', border: 'rgb(var(--success) / 0.3)' },
      pending: { bg: 'rgb(var(--warning) / 0.1)', text: 'rgb(var(--warning))', border: 'rgb(var(--warning) / 0.3)' },
      completed: { bg: 'rgb(var(--brand-light))', text: 'rgb(var(--brand))', border: 'rgb(var(--brand) / 0.3)' },
      cancelled: { bg: 'rgb(var(--error) / 0.1)', text: 'rgb(var(--error))', border: 'rgb(var(--error) / 0.3)' },
    }
    return styles[status.toLowerCase()] || { bg: 'rgb(var(--surface))', text: 'rgb(var(--text-secondary))', border: 'rgb(var(--border))' }
  }

  const statusStyle = getStatusStyle(safeStatus)

  return (
    <div>
      <div 
        className="surface"
        style={{
          padding: 'var(--space-6)',
          marginBottom: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <h1>Your Booking</h1>
        <span 
          style={{
            background: 'rgb(var(--brand-light))',
            color: 'rgb(var(--brand))',
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-xl)',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          Guest Access
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <h2 style={{ 
            marginBottom: 'var(--space-6)', 
            paddingBottom: 'var(--space-4)',
            borderBottom: '1px solid rgb(var(--border-light))'
          }}>
            Booking Information
          </h2>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 'var(--space-6)'
          }}>
            <div>
              <p style={{ 
                fontSize: '12px', 
                fontWeight: '500', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                color: 'rgb(var(--text-secondary))',
                marginBottom: 'var(--space-2)'
              }}>
                Booking Number
              </p>
              <p style={{ 
                fontSize: '20px', 
                fontFamily: 'monospace', 
                fontWeight: '600',
                color: 'rgb(var(--text))'
              }}>
                {booking.booking_number}
              </p>
            </div>
            <div>
              <p style={{ 
                fontSize: '12px', 
                fontWeight: '500', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                color: 'rgb(var(--text-secondary))',
                marginBottom: 'var(--space-2)'
              }}>
                Status
              </p>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: statusStyle.bg,
                color: statusStyle.text,
                border: `1px solid ${statusStyle.border}`,
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-2) var(--space-4)',
                fontSize: '14px',
                fontWeight: '600',
              }}>
                {safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1)}
              </span>
            </div>
            <div>
              <p style={{ 
                fontSize: '12px', 
                fontWeight: '500', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                color: 'rgb(var(--text-secondary))',
                marginBottom: 'var(--space-2)'
              }}>
                Pick-up Date
              </p>
              <p style={{ fontWeight: '500', color: 'rgb(var(--text))' }}>
                {formatDate(booking.pickup_at)}
              </p>
            </div>
            <div>
              <p style={{ 
                fontSize: '12px', 
                fontWeight: '500', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                color: 'rgb(var(--text-secondary))',
                marginBottom: 'var(--space-2)'
              }}>
                Return Date
              </p>
              <p style={{ fontWeight: '500', color: 'rgb(var(--text))' }}>
                {formatDate(booking.return_at)}
              </p>
            </div>
          </div>
          {booking.notes && (
            <div style={{
              marginTop: 'var(--space-6)',
              padding: 'var(--space-4)',
              background: 'rgb(var(--app-bg))',
              border: '1px solid rgb(var(--border-light))',
              borderRadius: 'var(--radius)',
            }}>
              <p style={{ 
                fontSize: '12px', 
                fontWeight: '500', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                color: 'rgb(var(--text-secondary))',
                marginBottom: 'var(--space-2)'
              }}>
                Additional Notes
              </p>
              <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'rgb(var(--muted))' }}>
                {booking.notes}
              </p>
            </div>
          )}
        </div>

        {vehicle && (
          <div className="surface" style={{ padding: 'var(--space-8)' }}>
            <h2 style={{ 
              marginBottom: 'var(--space-6)', 
              paddingBottom: 'var(--space-4)',
              borderBottom: '1px solid rgb(var(--border-light))'
            }}>
              Vehicle Information
            </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 'var(--space-6)'
            }}>
              {vehicle.name && (
                <div>
                  <p style={{ 
                    fontSize: '12px', 
                    fontWeight: '500', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    color: 'rgb(var(--text-secondary))',
                    marginBottom: 'var(--space-2)'
                  }}>
                    Vehicle
                  </p>
                  <p style={{ fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {vehicle.name}
                  </p>
                </div>
              )}
              {vehicle.license_plate && (
                <div>
                  <p style={{ 
                    fontSize: '12px', 
                    fontWeight: '500', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    color: 'rgb(var(--text-secondary))',
                    marginBottom: 'var(--space-2)'
                  }}>
                    License Plate
                  </p>
                  <p style={{ fontFamily: 'monospace', fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {vehicle.license_plate}
                  </p>
                </div>
              )}
              {vehicle.vin && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ 
                    fontSize: '12px', 
                    fontWeight: '500', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    color: 'rgb(var(--text-secondary))',
                    marginBottom: 'var(--space-2)'
                  }}>
                    VIN
                  </p>
                  <p style={{ fontFamily: 'monospace', fontSize: '14px', color: 'rgb(var(--muted))' }}>
                    {vehicle.vin}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {(booking.customer_name || booking.customer_email || booking.customer_phone) && (
          <div className="surface" style={{ padding: 'var(--space-8)' }}>
            <h2 style={{ 
              marginBottom: 'var(--space-6)', 
              paddingBottom: 'var(--space-4)',
              borderBottom: '1px solid rgb(var(--border-light))'
            }}>
              Customer Information
            </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 'var(--space-6)'
            }}>
              {booking.customer_name && (
                <div>
                  <p style={{ 
                    fontSize: '12px', 
                    fontWeight: '500', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    color: 'rgb(var(--text-secondary))',
                    marginBottom: 'var(--space-2)'
                  }}>
                    Name
                  </p>
                  <p style={{ fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {booking.customer_name}
                  </p>
                </div>
              )}
              {booking.customer_email && (
                <div>
                  <p style={{ 
                    fontSize: '12px', 
                    fontWeight: '500', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    color: 'rgb(var(--text-secondary))',
                    marginBottom: 'var(--space-2)'
                  }}>
                    Email Address
                  </p>
                  <p style={{ fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {booking.customer_email}
                  </p>
                </div>
              )}
              {booking.customer_phone && (
                <div>
                  <p style={{ 
                    fontSize: '12px', 
                    fontWeight: '500', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    color: 'rgb(var(--text-secondary))',
                    marginBottom: 'var(--space-2)'
                  }}>
                    Phone Number
                  </p>
                  <p style={{ fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {booking.customer_phone}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {checklists.length > 0 && (
          <div className="surface" style={{ padding: 'var(--space-8)' }}>
            <h2 style={{ 
              marginBottom: 'var(--space-6)', 
              paddingBottom: 'var(--space-4)',
              borderBottom: '1px solid rgb(var(--border-light))'
            }}>
              Checklists
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {checklists.map((checklist: any) => (
                <div 
                  key={checklist.id} 
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: 'var(--space-4)',
                    background: 'rgb(var(--app-bg))',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: '500', color: 'rgb(var(--text))' }}>
                      {checklist.type || 'Checklist'}
                    </p>
                    {checklist.created_at && (
                      <p style={{ marginTop: 'var(--space-1)', fontSize: '14px', color: 'rgb(var(--muted))' }}>
                        {new Date(checklist.created_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {checklist.completed_at ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgb(var(--success) / 0.1)',
                      color: 'rgb(var(--success))',
                      borderRadius: 'var(--radius-xl)',
                      padding: 'var(--space-1) var(--space-3)',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}>
                      Completed
                    </span>
                  ) : checklist.can_submit ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgb(var(--brand-light))',
                      color: 'rgb(var(--brand))',
                      borderRadius: 'var(--radius-xl)',
                      padding: 'var(--space-1) var(--space-3)',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}>
                      Available
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgb(var(--muted) / 0.1)',
                      color: 'rgb(var(--muted))',
                      borderRadius: 'var(--radius-xl)',
                      padding: 'var(--space-1) var(--space-3)',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}>
                      Locked
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}