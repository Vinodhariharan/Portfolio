-- ─────────────────────────────────────────────────────────────────────────────
-- Blog reactions schema (❤️ hearts)
-- Run once in Supabase SQL editor (Project → SQL → New Query).
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Denormalised total on posts (fast public reads)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS reaction_count INT NOT NULL DEFAULT 0;

-- 2. Per-event log (one row per IP per UTC day per slug)
CREATE TABLE IF NOT EXISTS post_reactions (
  id           BIGSERIAL PRIMARY KEY,
  slug         TEXT        NOT NULL,
  ip_hash      TEXT        NOT NULL,
  reacted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reacted_date DATE        GENERATED ALWAYS AS ((reacted_at AT TIME ZONE 'UTC')::DATE) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS post_reactions_unique_daily
  ON post_reactions (slug, ip_hash, reacted_date);

CREATE INDEX IF NOT EXISTS post_reactions_slug_date
  ON post_reactions (slug, reacted_date DESC);

-- 3. RPC: insert if new for this IP today, bump counter; otherwise no-op.
--    Returns the resulting total so the frontend can update the UI.
CREATE OR REPLACE FUNCTION react_to_post(p_slug TEXT, p_ip_hash TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT;
  v_count    INT;
BEGIN
  INSERT INTO post_reactions (slug, ip_hash)
  VALUES (p_slug, p_ip_hash)
  ON CONFLICT (slug, ip_hash, reacted_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    UPDATE posts SET reaction_count = reaction_count + 1
      WHERE slug = p_slug
      RETURNING reaction_count INTO v_count;
  ELSE
    SELECT reaction_count INTO v_count FROM posts WHERE slug = p_slug;
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- 4. Permissions: RPC is anon-callable, raw log is locked down.
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
GRANT EXECUTE ON FUNCTION react_to_post(TEXT, TEXT) TO anon, authenticated;
REVOKE ALL ON TABLE post_reactions FROM anon;
