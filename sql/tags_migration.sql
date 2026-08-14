-- ─────────────────────────────────────────────────────────────────────────────
-- Add tags to posts for basic taxonomy — filtering on /blog.html and
-- shared-tag "related posts" ranking on /post/:slug.
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS posts_tags_gin
  ON posts USING GIN (tags);
