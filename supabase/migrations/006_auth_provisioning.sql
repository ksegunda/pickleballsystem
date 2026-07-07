-- =============================================================
-- Migration 006: Auth Provisioning
-- Auto-creates a `hosts` row whenever a Supabase Auth user signs up.
-- Runs as SECURITY DEFINER so it works before the user has a session
-- (e.g. while email confirmation is pending) and independent of RLS.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_handle_new_host()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.hosts (id, email, name, club_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'club_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_handle_new_host
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION fn_handle_new_host();
