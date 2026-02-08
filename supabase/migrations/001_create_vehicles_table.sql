-- Create vehicles table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  registration VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance', 'cleaning')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public.vehicles(status);

-- Enable Row Level Security
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Policy: Staff users can read all vehicles
CREATE POLICY "Staff can view vehicles"
  ON public.vehicles
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Policy: Staff users can insert vehicles
CREATE POLICY "Staff can insert vehicles"
  ON public.vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Policy: Staff users can update vehicles
CREATE POLICY "Staff can update vehicles"
  ON public.vehicles
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Policy: Staff users can delete vehicles
CREATE POLICY "Staff can delete vehicles"
  ON public.vehicles
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert sample data for testing
INSERT INTO public.vehicles (name, registration, status) VALUES
  ('VW California Ocean', 'ABC-123', 'available'),
  ('Mercedes Marco Polo', 'DEF-456', 'rented'),
  ('Ford Transit Custom', 'GHI-789', 'maintenance'),
  ('Peugeot Boxer', 'JKL-012', 'available');