-- ─────────────────────────────────────────────────────────────────────────────
-- Blog view tracking schema
-- Run this once in the Supabase SQL editor (Project → SQL → New Query).
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Denormalised total on posts (fast reads for public pages)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;

-- 2. Per-event log table (each unique IP/day/slug = one row)
CREATE TABLE IF NOT EXISTS post_views (
  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT        NOT NULL,
  ip_hash     TEXT        NOT NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_date DATE        GENERATED ALWAYS AS ((viewed_at AT TIME ZONE 'UTC')::DATE) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS post_views_unique_daily
  ON post_views (slug, ip_hash, viewed_date);

CREATE INDEX IF NOT EXISTS post_views_slug_date
  ON post_views (slug, viewed_date DESC);

-- 3. Atomic RPC: insert log row if new today, increment counter if inserted.
CREATE OR REPLACE FUNCTION record_post_view(p_slug TEXT, p_ip_hash TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT;
BEGIN
  INSERT INTO post_views (slug, ip_hash)
  VALUES (p_slug, p_ip_hash)
  ON CONFLICT (slug, ip_hash, viewed_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    UPDATE posts SET view_count = view_count + 1 WHERE slug = p_slug;
  END IF;
END;
$$;

-- 4. Permissions: anyone can call the RPC, nobody can touch post_views directly.
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION record_post_view(TEXT, TEXT) TO anon, authenticated;
REVOKE ALL ON TABLE post_views FROM anon;
-- Only the SECURITY DEFINER function (running as the table owner) can write/read.

-- 5. View for admin dashboard: daily counts per post, last 30 days.
CREATE OR REPLACE VIEW post_views_daily AS
SELECT slug,
       viewed_date,
       COUNT(*) AS views
FROM post_views
WHERE viewed_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY slug, viewed_date
ORDER BY slug, viewed_date;

GRANT SELECT ON post_views_daily TO authenticated;
