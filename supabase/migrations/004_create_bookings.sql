-- Create bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_number VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'confirmed', 'on_rent', 'completed', 'cancelled')),
  pickup_at TIMESTAMP WITH TIME ZONE NOT NULL,
  return_at TIMESTAMP WITH TIME ZONE NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  customer_email VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_booking_number_per_company UNIQUE (company_id, booking_number),
  CONSTRAINT valid_date_range CHECK (return_at > pickup_at)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bookings_company_id ON public.bookings(company_id);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_id ON public.bookings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_pickup_at ON public.bookings(pickup_at);
CREATE INDEX IF NOT EXISTS idx_bookings_return_at ON public.bookings(return_at);

-- Enable Row Level Security
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Policy: Staff users can view bookings for their company
CREATE POLICY "Staff can view company bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Policy: Staff users can insert bookings for their company
CREATE POLICY "Staff can insert company bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Policy: Staff users can update bookings for their company
CREATE POLICY "Staff can update company bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Policy: Staff users can delete bookings for their company
CREATE POLICY "Staff can delete company bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Create updated_at trigger
CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Function to generate booking number
CREATE OR REPLACE FUNCTION generate_booking_number(p_company_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
  v_year VARCHAR(4);
  v_count INTEGER;
  v_number VARCHAR(50);
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::VARCHAR;
  
  -- Get count of bookings this year for this company
  SELECT COUNT(*) INTO v_count
  FROM public.bookings
  WHERE company_id = p_company_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);
  
  -- Format: BK-2024-0001
  v_number := 'BK-' || v_year || '-' || LPAD((v_count + 1)::VARCHAR, 4, '0');
  
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Insert sample bookings for testing (using default company)
INSERT INTO public.bookings (
  company_id, 
  booking_number, 
  status, 
  pickup_at, 
  return_at, 
  vehicle_id,
  customer_name, 
  customer_phone, 
  customer_email,
  notes
)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  'BK-2024-' || LPAD(ROW_NUMBER() OVER ()::VARCHAR, 4, '0'),
  CASE 
    WHEN ROW_NUMBER() OVER () % 4 = 0 THEN 'draft'
    WHEN ROW_NUMBER() OVER () % 4 = 1 THEN 'confirmed'
    WHEN ROW_NUMBER() OVER () % 4 = 2 THEN 'on_rent'
    ELSE 'completed'
  END,
  CURRENT_DATE + (ROW_NUMBER() OVER () || ' days')::INTERVAL,
  CURRENT_DATE + ((ROW_NUMBER() OVER () + 7) || ' days')::INTERVAL,
  v.id,
  'Customer ' || ROW_NUMBER() OVER (),
  '+1234567' || LPAD(ROW_NUMBER() OVER ()::VARCHAR, 3, '0'),
  'customer' || ROW_NUMBER() OVER () || '@example.com',
  'Sample booking ' || ROW_NUMBER() OVER ()
FROM (
  SELECT id FROM public.vehicles LIMIT 3
) v
LIMIT 3;