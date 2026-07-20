/*
# Change default waarde per vakje to €0,50

1. Changes
- `klj_sessions.vakje_value` column default changed from 1.00 to 0.50.
- This only affects new sessions created without an explicit vakje_value.
- Existing sessions are NOT modified (their vakje_value stays as-is), so no
  user data is touched.
2. Security
- No RLS or policy changes.
*/

ALTER TABLE klj_sessions ALTER COLUMN vakje_value SET DEFAULT 0.50;
