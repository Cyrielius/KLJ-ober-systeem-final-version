ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS workflow_mode text NOT NULL DEFAULT '2-step';
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS sound_type text NOT NULL DEFAULT 'beep';
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS sound_url text;

ALTER TABLE klj_products ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'available';

ALTER TABLE klj_orders ADD COLUMN IF NOT EXISTS made_at timestamptz;