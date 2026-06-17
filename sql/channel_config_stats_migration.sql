-- ─────────────────────────────────────────────────────────────────────────────
-- Add admin-overridable channel stats to channel_config.
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Why: YouTube changes the structure of channel-page HTML every few months,
-- which breaks the scraper. These columns let the admin set the correct
-- numbers manually; the Edge Function uses them when populated and falls
-- back to scraping otherwise.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE channel_config
  ADD COLUMN IF NOT EXISTS subscribers_override TEXT,
  ADD COLUMN IF NOT EXISTS videos_override      INT,
  ADD COLUMN IF NOT EXISTS views_override       BIGINT;

-- subscribers_override is text (e.g. "100K", "1.2M") to match YouTube's
-- abbreviated display. videos_override and views_override are integers
-- which the frontend formats with toLocaleString / K/M suffixes.
