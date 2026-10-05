alter table public.profiles add constraint profile_logo_scope check(logo_path is null or logo_path=id::text || '/logo.png');
grant update(logo_path) on public.profiles to authenticated;
update storage.buckets set file_size_limit=2097152,allowed_mime_types=array['image/png'] where id='branding';
create policy photographer_logo_insert on storage.objects for insert to authenticated with check (
 bucket_id='branding' and name=(select auth.uid())::text || '/logo.png'
);
create policy photographer_logo_update on storage.objects for update to authenticated using (
 bucket_id='branding' and name=(select auth.uid())::text || '/logo.png'
) with check (bucket_id='branding' and name=(select auth.uid())::text || '/logo.png');
