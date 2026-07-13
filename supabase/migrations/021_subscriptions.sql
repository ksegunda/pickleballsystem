-- =============================================================
-- Migration 021: Subscription plans
-- Manually-managed flag, no payment processor integration — a host's
-- plan_type/status only ever change by hand (Supabase SQL Editor,
-- same as every other admin task in this project) until real billing
-- becomes its own separate project.
--
-- Three tiers: free (default, capped), monthly, lifetime. Free hosts
-- are capped at 3 sessions per calendar month; monthly/lifetime are
-- unlimited as long as status = 'active' — an expired/cancelled paid
-- plan falls back to the free cap rather than silently staying
-- unlimited forever.
-- =============================================================

CREATE TYPE subscription_plan   AS ENUM ('free', 'monthly', 'lifetime');
CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'cancelled');

CREATE TABLE subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     UUID NOT NULL UNIQUE REFERENCES hosts(id) ON DELETE CASCADE,
  plan_type   subscription_plan   NOT NULL DEFAULT 'free',
  status      subscription_status NOT NULL DEFAULT 'active',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ, -- null for free/lifetime
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_host_id ON subscriptions(host_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only for the host themselves. No INSERT/UPDATE/DELETE policy at
-- all on purpose — this is a manually-managed flag, not self-service;
-- only the service role (or a future admin tool) changes it.
CREATE POLICY "hosts_read_own_subscription"
  ON subscriptions FOR SELECT
  USING (host_id = auth.uid());

-- =============================================================
-- Auto-provisions a 'free' subscription row whenever a new host is
-- created — mirrors fn_handle_new_host (migration 006)'s trigger
-- shape, one step later in the same signup chain (auth.users insert
-- -> hosts insert via that trigger -> subscriptions insert via this
-- one). SECURITY DEFINER for the same reason: needs to work before
-- the new host has an established RLS-visible session.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_handle_new_host_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (host_id)
  VALUES (NEW.id)
  ON CONFLICT (host_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_handle_new_host_subscription
  AFTER INSERT ON hosts
  FOR EACH ROW
  EXECUTE FUNCTION fn_handle_new_host_subscription();

-- One-time backfill for hosts that already existed before this
-- migration ran.
INSERT INTO subscriptions (host_id)
SELECT id FROM hosts
ON CONFLICT (host_id) DO NOTHING;

-- =============================================================
-- FUNCTION: count_sessions_this_month
-- How many sessions this host has created in the current calendar
-- month (server clock / DB timezone) — what the free-tier cap checks
-- against. date_trunc keeps this correct regardless of which day of
-- the month it's called on, no manual first-of-month math needed.
-- =============================================================
CREATE OR REPLACE FUNCTION count_sessions_this_month(p_host_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM sessions
  WHERE host_id = p_host_id
    AND created_at >= date_trunc('month', now());
$$ LANGUAGE sql STABLE;

-- =============================================================
-- Platform-owner (super admin) access.
--
-- Deliberately a separate table, not a flag on `hosts` — `hosts` is
-- the same table every regular host's row lives in and that
-- host-facing RLS/queries touch constantly; a privilege flag there
-- is one RLS gap or stray query away from being readable by exactly
-- the accounts it's meant to gatekeep. A separate table means a bug
-- in host-facing code has nothing to touch here at all.
--
-- Still authenticates through the same Supabase Auth as every host
-- (no second login system) — being a platform admin just means your
-- auth.uid() has a row here. The one RLS policy is a *self*-check
-- only: a host querying "am I in this table?" only ever sees their
-- own row or nothing, never the full admin list. No INSERT/UPDATE/
-- DELETE policy at all — adding an admin is a manual SQL paste, same
-- deliberately-manual spirit as the subscription flag itself.
-- =============================================================
-- IF NOT EXISTS / DROP-then-CREATE throughout this last section on
-- purpose — a first attempt at running this tail partially failed
-- live (platform_admins never got created, is_suspended never got
-- added) while everything above it had already succeeded, so this
-- needs to be safely re-runnable no matter which of these already
-- exist.
CREATE TABLE IF NOT EXISTS platform_admins (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self_check_platform_admin" ON platform_admins;
CREATE POLICY "self_check_platform_admin"
  ON platform_admins FOR SELECT
  USING (id = auth.uid());

-- Seed the first platform admin.
INSERT INTO platform_admins (id)
SELECT id FROM auth.users WHERE email = 'karayomsegunda@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- Host suspension — independent of subscription status (a host could
-- be suspended for abuse even with a fully paid-up plan). Checked in
-- middleware using the host's own existing read access to their row
-- (hosts_read_own), no service-role client needed for the check
-- itself — only flipping it requires the admin path.
-- =============================================================
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
