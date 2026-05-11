ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS custom_payment_reminder_days int NOT NULL DEFAULT 1;
