-- Create company_settings table for white-label branding
CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  primary_color VARCHAR(7) NOT NULL DEFAULT '#368F8B',
  secondary_color VARCHAR(7) NOT NULL DEFAULT '#BC8235',
  accent_color VARCHAR(7) NOT NULL DEFAULT '#0A0A0A',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone (including guests) can read company settings for branding
CREATE POLICY "Anyone can view company settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Policy: Only staff can update company settings
CREATE POLICY "Staff can update company settings"
  ON public.company_settings
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Policy: Only staff can insert company settings
CREATE POLICY "Staff can insert company settings"
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Create updated_at trigger
CREATE TRIGGER set_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert default Epic Vans branding (using fixed ID for easy reference)
INSERT INTO public.company_settings (id, name, logo_url, primary_color, secondary_color, accent_color)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Epic Vans',
  NULL,
  '#368F8B',
  '#BC8235',
  '#0A0A0A'
)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for logos (public read access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Anyone can read logos
CREATE POLICY "Anyone can view company logos"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'company-logos');

-- Storage policy: Only staff can upload logos
CREATE POLICY "Staff can upload company logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos' AND
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Storage policy: Only staff can update logos
CREATE POLICY "Staff can update company logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-logos' AND
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Storage policy: Only staff can delete logos
CREATE POLICY "Staff can delete company logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-logos' AND
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );