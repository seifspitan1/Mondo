-- =============================================================================
-- MONDO Creative Studio | Secure Supabase Schema (Dedicated Single Project)
-- Based on the project's supplied schema; preserves existing table contracts.
-- Intended target: existing dedicated Mondo project on main.
-- Preconditions confirmed by owner: project is dedicated to MONDO,
-- public schema contains no application tables, and storage has no buckets.
-- This is the ONE shared data environment; use only test records until launch.
-- Review Supabase dashboard project name immediately before execution.
-- =============================================================================
-- Access design:
--   Browser -> MONDO backend/API -> Supabase via SERVER-SIDE privileged key.
--   No direct access to these 5 tables for anon/authenticated clients.
--   Only public portfolio media is readable via the public storage bucket URL.
-- No DROP, TRUNCATE, DELETE, or data-seeding statements appear in this file.
-- Re-running does NOT migrate the structure of pre-existing tables.
-- =============================================================================

BEGIN;

-- 1. Projects table
CREATE TABLE IF NOT EXISTS public.mondo_projects (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mondo_projects_slug
    ON public.mondo_projects (slug);
CREATE INDEX IF NOT EXISTS idx_mondo_projects_updated_at
    ON public.mondo_projects (updated_at DESC);

-- 2. Studio settings: singleton row with key = 'studio'
CREATE TABLE IF NOT EXISTS public.mondo_settings (
    key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Customer enquiries
CREATE TABLE IF NOT EXISTS public.mondo_enquiries (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    discord TEXT NOT NULL DEFAULT '',
    game_url TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL,
    package_name TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL,
    budget TEXT NOT NULL DEFAULT '',
    deadline TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'New',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mondo_enquiries_created_at
    ON public.mondo_enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mondo_enquiries_status
    ON public.mondo_enquiries (status);

-- 4. Anonymous activity events
CREATE TABLE IF NOT EXISTS public.mondo_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    slug TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mondo_events_type
    ON public.mondo_events (type);
CREATE INDEX IF NOT EXISTS idx_mondo_events_created_at
    ON public.mondo_events (created_at DESC);

-- 5. Rate-limit state
CREATE TABLE IF NOT EXISTS public.mondo_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mondo_rate_limits_expires_at
    ON public.mondo_rate_limits (expires_at);

-- =============================================================================
-- Database security: RLS + table privileges
-- Supabase's service_role bypasses RLS; its credentials MUST remain server-side.
-- RLS alone is not a replacement for revoking unwanted grants.
-- =============================================================================

ALTER TABLE public.mondo_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mondo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mondo_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mondo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mondo_rate_limits ENABLE ROW LEVEL SECURITY;

-- Do not allow clients to access these tables directly, even if a public
-- or future client-side access policy.
-- Access must go through MONDO's trusted backend.

REVOKE ALL PRIVILEGES ON TABLE
    public.mondo_projects,
    public.mondo_settings,
    public.mondo_enquiries,
    public.mondo_events,
    public.mondo_rate_limits
FROM PUBLIC, anon, authenticated;

-- Allow trusted backend operations only.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.mondo_projects,
    public.mondo_settings,
    public.mondo_enquiries,
    public.mondo_events,
    public.mondo_rate_limits
TO service_role;

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('mondo-media', 'mondo-media', true)
ON CONFLICT (id) DO NOTHING;

-- Reject unexpected existing private bucket configuration.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'mondo-media'
          AND public IS DISTINCT FROM TRUE
    ) THEN
        RAISE EXCEPTION
            'mondo-media exists but is not public.';
    END IF;
END
$$;

COMMIT;
