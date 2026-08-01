ALTER TABLE klj_products ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE klj_products ADD COLUMN IF NOT EXISTS vakjes_override integer;

ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS timer_yellow integer NOT NULL DEFAULT 5;
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS timer_orange integer NOT NULL DEFAULT 8;
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS timer_red integer NOT NULL DEFAULT 10;
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS timer_critical integer NOT NULL DEFAULT 15;