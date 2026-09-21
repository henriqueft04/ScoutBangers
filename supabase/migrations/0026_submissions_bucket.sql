-- Insert submissions bucket
insert into storage.buckets (id, name, public) 
values ('submissions', 'submissions', false)
on conflict do nothing;

create policy "Users can upload submissions" on storage.objects
  for insert with check (bucket_id = 'submissions' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Admins can read submissions" on storage.objects
  for select using (bucket_id = 'submissions' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create policy "Admins can delete submissions" on storage.objects
  for delete using (bucket_id = 'submissions' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
