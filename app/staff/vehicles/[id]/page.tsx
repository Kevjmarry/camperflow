// app/staff/vehicles/[id]/page.tsx
"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  notes: string | null;
  photo_url: string | null;
  status: 'ready' | 'preparing' | 'on_rent';
}

const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isValidUUID(id)) {
      router.push('/staff');
      return;
    }
    loadVehicle();
  }, [id]);

  const loadVehicle = async () => {
    try {
      setLoading(true);
      setError("");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', id)
        .single();

      if (vehicleError) {
        if (vehicleError.code === 'PGRST116') {
          setNotFound(true);
        } else {
          setError(`Failed to load vehicle: ${vehicleError.message}`);
        }
        setLoading(false);
        return;
      }

      setVehicle(vehicleData);
      setLoading(false);
    } catch (err: any) {
      setError(`Unexpected error: ${err.message || 'Failed to load vehicle'}`);
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready';
      case 'preparing': return 'Preparing';
      case 'on_rent': return 'On Rent';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'rgb(var(--success))';
      case 'preparing':
        return 'rgb(var(--warning))';
      case 'on_rent':
        return 'rgb(var(--brand))';
      default:
        return 'rgb(var(--text))';
    }
  };

  if (notFound) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
              Vehicle not found
            </h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
              The vehicle you're looking for doesn't exist or has been deleted.
            </p>
            <Link 
              href="/staff/vehicles"
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-6)' }}
            >
              Back to vehicles
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', color: 'rgb(var(--muted))' }}>
            Loading vehicle...
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !vehicle) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div>
              <Link 
                href="/staff/vehicles"
                style={{
                  fontSize: '14px',
                  color: 'rgb(var(--brand))',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-2)',
                  display: 'inline-block'
                }}
              >
                ← Back to vehicles
              </Link>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
                Vehicle details
              </h1>
            </div>
            <div style={{ 
              padding: 'var(--space-4)',
              background: 'rgb(var(--error) / 0.1)',
              border: '1px solid rgb(var(--error) / 0.3)',
              borderRadius: 'var(--radius)',
              color: 'rgb(var(--error))',
              fontSize: '14px'
            }}>
              {error || "Failed to load vehicle"}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="900px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <Link 
              href="/staff/vehicles"
              style={{
                fontSize: '14px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginBottom: 'var(--space-2)',
                display: 'inline-block'
              }}
            >
              ← Back to vehicles
            </Link>
          </div>

          <div className="surface" style={{ 
            padding: 'var(--space-6)',
            background: 'rgb(var(--border) / 0.2)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start',
              marginBottom: 'var(--space-4)',
              flexWrap: 'wrap',
              gap: 'var(--space-3)'
            }}>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))', margin: 0 }}>
                {vehicle.name}
              </h1>
              <div style={{
                display: 'inline-block',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius)',
                background: `${getStatusColor(vehicle.status)}15`,
                color: getStatusColor(vehicle.status),
                fontSize: '14px',
                fontWeight: 600
              }}>
                {getStatusLabel(vehicle.status)}
              </div>
            </div>

            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-4)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid rgb(var(--border) / 0.5)'
            }}>
              <div>
                <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                  Registration
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {vehicle.registration_plate}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                  Year
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {vehicle.year}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                  Make
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {vehicle.make}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                  Model
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {vehicle.model}
                </div>
              </div>
            </div>
          </div>

          {vehicle.photo_url && (
            <div className="surface" style={{ 
              padding: 'var(--space-5)',
              background: 'rgb(var(--border) / 0.15)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-3)' }}>
                Photo
              </h3>
              <img
                src={vehicle.photo_url}
                alt="Vehicle"
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  height: 'auto',
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgb(var(--border))'
                }}
              />
            </div>
          )}

          <div style={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--space-4)'
          }}>
            {vehicle.vin && (
              <div className="surface" style={{ 
                padding: 'var(--space-5)',
                background: 'rgb(var(--border) / 0.15)'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--muted))', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  VIN
                </h3>
                <div style={{ fontSize: '15px', color: 'rgb(var(--text))', fontFamily: 'monospace' }}>
                  {vehicle.vin}
                </div>
              </div>
            )}
          </div>

          {vehicle.notes && (
            <div className="surface" style={{ 
              padding: 'var(--space-5)',
              background: 'rgb(var(--border) / 0.15)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-3)' }}>
                Notes
              </h3>
              <div style={{ 
                fontSize: '15px', 
                color: 'rgb(var(--text))', 
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap'
              }}>
                {vehicle.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}