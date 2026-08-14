-- ─────────────────────────────────────────────────────────────────────────────
-- Enforce Row Level Security on posts so unpublished drafts are only ever
-- readable by an authenticated admin session — not by anyone calling the
-- Supabase REST API directly with the public anon key (which ships
-- client-side in supabase-config.js).
--
-- The app already adds `is_published=eq.true` to every public query, but a
-- request filter is not a security boundary — without RLS, anyone with the
-- anon key could drop that filter and read draft titles/content directly.
-- This migration makes the database itself enforce the boundary.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posts_public_read_published ON posts;
DROP POLICY IF EXISTS posts_admin_full_access      ON posts;

-- Public (anon) callers — blog list, single-post page, sitemap — can only
-- ever see published posts, regardless of what filters the client sends.
CREATE POLICY posts_public_read_published
  ON posts FOR SELECT
  TO anon
  USING (is_published = true);

-- Authenticated Supabase Auth sessions (the admin panel) have full access,
-- including reading and editing drafts.
CREATE POLICY posts_admin_full_access
  ON posts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON posts TO authenticated;
