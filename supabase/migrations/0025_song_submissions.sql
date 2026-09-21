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
FOR INSERT WITH CHECK (auth.uid() = user_id);

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
