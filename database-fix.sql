-- ============================================================
-- DE-GRACELAND PORTAL: PUBLIC ACCESS + UPLOAD REPAIR
-- Run this once in Supabase -> SQL Editor -> New query -> Run.
-- ============================================================

begin;

-- The portal is intentionally link-accessible and has no login.
alter table public.brands disable row level security;
alter table public.post_slots disable row level security;
alter table public.post_versions disable row level security;
alter table public.media_assets disable row level security;
alter table public.comments disable row level security;
alter table public.weekly_approvals disable row level security;
alter table public.feedback_requests disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.brands to anon, authenticated;
grant select, insert, update, delete on public.post_slots to anon, authenticated;
grant select, insert, update, delete on public.post_versions to anon, authenticated;
grant select, insert, update, delete on public.media_assets to anon, authenticated;
grant select, insert, update, delete on public.comments to anon, authenticated;
grant select, insert, update, delete on public.weekly_approvals to anon, authenticated;
grant select, insert, update, delete on public.feedback_requests to anon, authenticated;

-- Create/repair the public media bucket. NULL MIME restriction permits normal
-- phone images and browser-generated image types. The website still validates
-- that the chosen file is an image or video.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 104857600, null)
on conflict (id) do update
set public = true,
    file_size_limit = 104857600,
    allowed_mime_types = null;

-- Remove old policies that can conflict with anonymous uploads.
drop policy if exists "Public can view media" on storage.objects;
drop policy if exists "Anyone can view media" on storage.objects;
drop policy if exists "Anyone can upload media" on storage.objects;
drop policy if exists "Anyone can update media" on storage.objects;
drop policy if exists "Anyone can delete media" on storage.objects;
drop policy if exists "Admins upload media" on storage.objects;
drop policy if exists "Admins update media" on storage.objects;
drop policy if exists "Admins delete media" on storage.objects;

create policy "Anyone can view media"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'media');

create policy "Anyone can upload media"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'media');

create policy "Anyone can update media"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'media')
with check (bucket_id = 'media');

create policy "Anyone can delete media"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'media');

commit;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'media';
