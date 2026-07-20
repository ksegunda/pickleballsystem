-- =============================================================
-- Migration 027: Defer host provisioning until email confirmed
-- The trigger from migration 006 fired AFTER INSERT ON auth.users —
-- i.e. the instant signUp() ran, regardless of confirmation status.
-- With email OTP verification now required before a host can reach
-- the dashboard, that meant an abandoned/never-confirmed signup left
-- a permanent orphaned `hosts` row behind (the exact failure mode
-- already seen once with an orphaned host/auth pair in this project).
--
-- Retimed to fire only when Supabase itself flips email_confirmed_at
-- from NULL to a real timestamp — which happens as part of the same
-- verifyOtp() call that also establishes the user's session, so
-- there's no window where a session exists but the hosts row doesn't.
-- fn_handle_new_host() itself is unchanged — raw_user_meta_data set
-- at signup time is still intact on the row when this later fires.
-- =============================================================
DROP TRIGGER IF EXISTS trg_handle_new_host ON auth.users;

CREATE TRIGGER trg_handle_new_host
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION fn_handle_new_host();
