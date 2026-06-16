-- ─────────────────────────────────────────────────────────────────────────────
-- Channel configuration (single-row table) for the Tech Rovers landing page.
-- Stores the featured-video override and the trailer-video for the hero
-- background. Run once in the Supabase SQL editor (Project → SQL → New query).
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table: single-row enforced by id = 1 PK + CHECK constraint.
CREATE TABLE IF NOT EXISTS channel_config (
  id                INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  featured_video_id TEXT,
  trailer_video_id  TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Seed the one row.
INSERT INTO channel_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 3. RLS: public can read (Edge Function uses anon key); only authenticated
--    Supabase Auth sessions can update (the admin panel).
ALTER TABLE channel_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_config_public_read  ON channel_config;
DROP POLICY IF EXISTS channel_config_admin_update ON channel_config;

CREATE POLICY channel_config_public_read
  ON channel_config FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY channel_config_admin_update
  ON channel_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT         ON channel_config TO anon;
GRANT SELECT, UPDATE ON channel_config TO authenticated;
