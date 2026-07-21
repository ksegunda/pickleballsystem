-- =============================================================
-- Migration 028: Host provisioning when email is auto-confirmed
-- Migration 027 retimed provisioning to fire on the UPDATE that
-- flips email_confirmed_at from NULL to a real timestamp — correct
-- when "Confirm email" is ON (via the OTP flow). But if "Confirm
-- email" is OFF, Supabase marks the row confirmed at INSERT time
-- (there's nothing to confirm), so that UPDATE never happens and no
-- `hosts` row would ever get created.
--
-- Adds a second trigger covering exactly that case — fires only if
-- the row arrives already confirmed. Between this and 027's, exactly
-- one of the two fires for any given signup, and fn_handle_new_host's
-- own ON CONFLICT (id) DO NOTHING makes a double-fire harmless
-- regardless.
-- =============================================================
CREATE TRIGGER trg_handle_new_host_immediate
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION fn_handle_new_host();
