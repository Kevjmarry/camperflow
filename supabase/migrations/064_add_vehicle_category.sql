ALTER TABLE vehicles
  ADD COLUMN vehicle_category text NOT NULL DEFAULT 'motorhome'
    CHECK (vehicle_category IN ('motorhome', 'campervan', 'caravan'));
