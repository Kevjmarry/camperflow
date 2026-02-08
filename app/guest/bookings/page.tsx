import { createClient } from '@/lib/supabase/server'
import PageContainer from '@/components/PageContainer'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function GuestBookingPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_number, status, pickup_at, return_at, vehicle_id, customer_name, customer_phone, customer_email, notes, created_at')
    .eq('id', id)
    .single()

  if (bookingError || !booking) {
    return (
      <PageContainer title="Booking not found" showSignOut={false}>
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <p style={{ color: 'rgb(var(--muted))' }}>
            Booking ID: <span style={{ fontFamily: 'monospace' }}>{id}</span>
          </p>
          {bookingError && (
            <p style={{ marginTop: 'var(--space-4)', color: 'rgb(239 68 68)' }}>
              Error: {bookingError.message}
            </p>
          )}
        </div>
      </PageContainer>
    )
  }

  let vehicle = null
  if (booking.vehicle_id) {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', booking.vehicle_id)
      .single()
    vehicle = data
  }

  let checklists = []
  try {
    const { data } = await supabase
      .from('checklists')
      .select('*')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: false })
    checklists = data || []
  } catch (error) {
    checklists = []
  }

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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-red-100 text-red-800',
    }
    return colors[status.toLowerCase()] || 'bg-gray-100 text-gray-800'
  }

  return (
    <PageContainer title="Booking details" showSignOut={false}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: 'rgb(var(--text))' }}>
          Booking details
        </h1>
        <span 
          className="surface" 
          style={{ 
            padding: 'var(--space-2) var(--space-4)', 
            fontSize: '0.875rem',
            fontWeight: '500',
            color: 'rgb(var(--muted))'
          }}
        >
          Guest view
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'rgb(var(--text))', marginBottom: 'var(--space-6)' }}>
            Booking information
          </h2>
          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                Booking number
              </p>
              <p style={{ fontSize: '1.125rem', fontWeight: '600', fontFamily: 'monospace', color: 'rgb(var(--text))' }}>
                {booking.booking_number}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                Status
              </p>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${getStatusColor(booking.status)}`}>
                {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
              </span>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                Pick-up date
              </p>
              <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'rgb(var(--text))' }}>
                {formatDate(booking.pickup_at)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                Return date
              </p>
              <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'rgb(var(--text))' }}>
                {formatDate(booking.return_at)}
              </p>
            </div>
            {booking.notes && (
              <div style={{ padding: 'var(--space-4)', border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', backgroundColor: 'rgb(var(--surface) / 0.5)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                  Additional notes
                </p>
                <p style={{ fontSize: '0.875rem', lineHeight: '1.5', color: 'rgb(var(--text))' }}>
                  {booking.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {vehicle && (
          <div className="surface" style={{ padding: 'var(--space-8)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'rgb(var(--text))', marginBottom: 'var(--space-6)' }}>
              Vehicle information
            </h2>
            <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
              {vehicle.name && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                    Vehicle
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {vehicle.name}
                  </p>
                </div>
              )}
              {vehicle.license_plate && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                    License plate
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: '500', fontFamily: 'monospace', color: 'rgb(var(--text))' }}>
                    {vehicle.license_plate}
                  </p>
                </div>
              )}
              {vehicle.vin && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                    VIN
                  </p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'rgb(var(--muted))' }}>
                    {vehicle.vin}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {(booking.customer_name || booking.customer_email || booking.customer_phone) && (
          <div className="surface" style={{ padding: 'var(--space-8)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'rgb(var(--text))', marginBottom: 'var(--space-6)' }}>
              Customer information
            </h2>
            <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
              {booking.customer_name && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                    Name
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {booking.customer_name}
                  </p>
                </div>
              )}
              {booking.customer_email && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                    Email address
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {booking.customer_email}
                  </p>
                </div>
              )}
              {booking.customer_phone && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)' }}>
                    Phone number
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'rgb(var(--text))' }}>
                    {booking.customer_phone}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {checklists.length > 0 && (
          <div className="surface" style={{ padding: 'var(--space-8)', gridColumn: '1 / -1' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'rgb(var(--text))', marginBottom: 'var(--space-6)' }}>
              Checklists
            </h2>
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {checklists.map((checklist: any) => (
                <div 
                  key={checklist.id} 
                  className="surface"
                  style={{ 
                    padding: 'var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid rgb(var(--border))'
                  }}
                >
                  <div>
                    <p style={{ fontWeight: '500', color: 'rgb(var(--text))' }}>
                      {checklist.type || 'Checklist'}
                    </p>
                    {checklist.created_at && (
                      <p style={{ marginTop: 'var(--space-1)', fontSize: '0.875rem', color: 'rgb(var(--muted))' }}>
                        {new Date(checklist.created_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {checklist.completed_at && (
                    <span className="bg-green-100 text-green-800" style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius)', fontSize: '0.75rem', fontWeight: '600' }}>
                      Completed
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}