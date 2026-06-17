-- ─────────────────────────────────────────────────────────────────────────────
-- Add is_featured to posts so the admin can pick which post is highlighted
-- at the top of /blog.html. Falls back to "most recent" if nothing is set.
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- Enforce at most one featured post via a partial unique index.
-- (Multiple FALSE rows are allowed because the WHERE excludes them from the index.)
CREATE UNIQUE INDEX IF NOT EXISTS posts_only_one_featured
  ON posts (is_featured)
  WHERE is_featured = TRUE;
