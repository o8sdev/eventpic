-- Object convention: <photographer uuid>/<event uuid>/<photo uuid>/<filename>.
-- Profile logos: <photographer uuid>/<filename>. Upload handlers issue scoped tokens in Phase 2.
insert into storage.buckets(id,name,public) values
 ('originals','originals',false),('web','web',false),('thumbnails','thumbnails',false),('branding','branding',false)
on conflict(id) do update set public=false;
create policy photographer_image_read on storage.objects for select to authenticated using (
 bucket_id in ('originals','web','thumbnails')
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.events e where e.id::text=(storage.foldername(name))[2] and e.photographer_id=(select auth.uid()))
);
create policy photographer_branding_read on storage.objects for select to authenticated using (
 bucket_id='branding' and (storage.foldername(name))[1]=(select auth.uid())::text
);
-- No guest policies and no client INSERT/UPDATE/DELETE. Signed uploads are issued by the server.
