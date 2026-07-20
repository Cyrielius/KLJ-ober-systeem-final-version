/*
# Add auto_print toggle to sessions

1. Modified Tables
- `klj_sessions`: adds `auto_print` (boolean, default true).
  Lets the host enable/disable automatic receipt printing when new
  orders arrive. When false, the host dashboard will not auto-print
  (but manual printing via the print button remains available).

2. Security
- No RLS changes. Existing anon/authenticated policies on
  klj_sessions already cover the new column (it is part of the row).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'klj_sessions' AND column_name = 'auto_print'
  ) THEN
    ALTER TABLE klj_sessions ADD COLUMN auto_print boolean NOT NULL DEFAULT true;
  END IF;
END $$;
