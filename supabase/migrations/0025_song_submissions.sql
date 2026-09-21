-- 1. Add is_admin to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Create song_submissions table
CREATE TABLE IF NOT EXISTS public.song_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  title text not null,
  artist text not null,
  album text,
  year text,
  genre text,
  audio_path text not null,
  thumbnail_path text,
  created_at timestamptz not null default now()
);

-- 3. Enable RLS
ALTER TABLE public.song_submissions ENABLE ROW LEVEL SECURITY;

-- Users can read their own submissions
DROP POLICY IF EXISTS "users_read_own_submissions" ON public.song_submissions;
CREATE POLICY "users_read_own_submissions" ON public.song_submissions 
FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own submissions
DROP POLICY IF EXISTS "users_insert_own_submissions" ON public.song_submissions;
CREATE POLICY "users_insert_own_submissions" ON public.song_submissions 
FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Admins can read all submissions
DROP POLICY IF EXISTS "admins_read_all_submissions" ON public.song_submissions;
CREATE POLICY "admins_read_all_submissions" ON public.song_submissions 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Admins can update all submissions
DROP POLICY IF EXISTS "admins_update_all_submissions" ON public.song_submissions;
CREATE POLICY "admins_update_all_submissions" ON public.song_submissions 
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Protect is_admin from being updated by regular users
CREATE OR REPLACE FUNCTION public.protect_is_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Only allow the service_role (or superuser) to change this flag
    IF current_setting('role') != 'service_role' THEN
      NEW.is_admin = OLD.is_admin;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_is_admin_trigger ON public.profiles;
CREATE TRIGGER protect_is_admin_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_is_admin();
