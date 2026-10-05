-- Phase 2: authenticated, owner-scoped operations. No broad event/photo DML grants.
alter table public.events add constraint event_cover_scope check (
 cover_path is null or cover_path ~ ('^'||photographer_id::text||'/'||id::text||'/cover/[a-f0-9-]{36}\.jpg$')
);
update storage.buckets set public=false,file_size_limit=52428800,allowed_mime_types=array['image/jpeg'] where id='originals';
update storage.buckets set allowed_mime_types=array['image/png','image/jpeg'] where id='branding';

create function public.save_photographer_event(p_id uuid,p_title text,p_event_date date,p_venue text,p_languages text[],p_default_locale text,p_originals boolean,p_watermark boolean,p_expiry timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; owner_id uuid=auth.uid(); expiry timestamptz;
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_id is null or p_title is null or length(trim(p_title)) not between 1 and 200 or p_event_date is null or p_event_date not between date '1900-01-01' and date '2100-12-31' or length(coalesce(p_venue,''))>300
 or p_languages is null or cardinality(p_languages) not between 1 and 3 or not(p_languages <@ array['az','ru','en']::text[]) or array_position(p_languages,null) is not null
 or cardinality(p_languages)<>(select count(distinct item) from unnest(p_languages) item) or p_default_locale is null or not(p_default_locale=any(p_languages)) or p_originals is null or p_watermark is null then raise exception 'Invalid event'; end if;
 select * into e from public.events where id=p_id for update;
 if found then
  if e.photographer_id<>owner_id then raise exception 'Event unavailable' using errcode='42501'; end if;
  if e.status not in ('draft','active') then raise exception 'Event is not editable'; end if;
  if e.watermark_enabled<>p_watermark and exists(select 1 from public.photos where event_id=e.id) then raise exception 'Watermark is fixed after uploads begin'; end if;
  -- Date changes never silently extend an existing retention period.
  expiry=coalesce(p_expiry,e.face_expires_at);
 else expiry=coalesce(p_expiry,(p_event_date+30)::timestamp at time zone 'Asia/Baku');
 end if;
 if not isfinite(expiry) or expiry<(p_event_date::timestamp at time zone 'Asia/Baku') then raise exception 'Invalid expiry'; end if;
 insert into public.events(id,photographer_id,title,event_date,venue,languages,default_locale,allow_original_download,watermark_enabled,face_expires_at)
 values(p_id,owner_id,trim(p_title),p_event_date,nullif(trim(p_venue),''),p_languages,p_default_locale,p_originals,p_watermark,expiry)
 on conflict(id) do update set title=excluded.title,event_date=excluded.event_date,venue=excluded.venue,languages=excluded.languages,default_locale=excluded.default_locale,allow_original_download=excluded.allow_original_download,watermark_enabled=excluded.watermark_enabled,face_expires_at=excluded.face_expires_at
 where public.events.photographer_id=owner_id and public.events.status in ('draft','active') and (public.events.watermark_enabled=excluded.watermark_enabled or not exists(select 1 from public.photos where event_id=p_id)) returning * into e;
 if e.id is null then raise exception 'Event unavailable' using errcode='42501'; end if;
 return to_jsonb(e);
end $$;

create function public.set_event_cover(p_event uuid,p_path text) returns text
language plpgsql security definer set search_path='' as $$
declare e public.events; previous text;
begin
 select * into e from public.events where id=p_event and photographer_id=auth.uid() for update;
 if not found or e.status not in ('draft','active') then raise exception 'Event unavailable' using errcode='42501'; end if;
 if p_path is not null and (p_path !~ ('^'||e.photographer_id::text||'/'||e.id::text||'/cover/[a-f0-9-]{36}\.jpg$') or not exists(select 1 from storage.objects where bucket_id='branding' and name=p_path)) then raise exception 'Invalid cover'; end if;
 previous=e.cover_path;
 update public.events set cover_path=p_path where id=e.id;
 return previous;
end $$;

create function public.reserve_photo_upload(p_event uuid,p_key text,p_filename text,p_bytes bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events; p public.photos; photo_id uuid=gen_random_uuid();
begin
 select * into e from public.events where id=p_event and photographer_id=auth.uid() for update;
 if not found or e.status not in ('draft','active') then raise exception 'Event unavailable' using errcode='42501'; end if;
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_filename is null or length(p_filename) not between 1 and 255 or p_bytes is null or p_bytes not between 3 and 52428800 then raise exception 'Invalid upload'; end if;
 insert into public.photos(id,event_id,original_path,original_filename,upload_key,bytes)
 values(photo_id,e.id,e.photographer_id::text||'/'||e.id::text||'/'||photo_id::text||'/original.jpg',p_filename,p_key,p_bytes)
 on conflict(event_id,upload_key) do nothing;
 select * into p from public.photos where event_id=e.id and upload_key=p_key;
 if p.bytes<>p_bytes then raise exception 'Fingerprint size mismatch'; end if;
 -- Refresh the reservation timestamp before signing; cleanup must respect the
 -- two-hour lifetime of outstanding Storage upload tokens (Phase 3).
 if p.status='pending_upload' then update public.photos set updated_at=now() where id=p.id; end if;
 return jsonb_build_object('id',p.id,'path',p.original_path,'status',p.status);
end $$;

-- Completion and queue insertion are atomic, even when a lost HTTP response is retried.
-- Storage computes object size; client-supplied object metadata is not used here.
create function public.complete_photo_upload(p_event uuid,p_photo uuid) returns text
language plpgsql security definer set search_path='' as $$
declare e public.events; p public.photos; object_metadata jsonb;
begin
 select * into e from public.events where id=p_event and photographer_id=auth.uid() for update;
 if not found or e.status not in ('draft','active') then raise exception 'Event unavailable' using errcode='42501'; end if;
 select * into p from public.photos where id=p_photo and event_id=e.id for update;
 if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
 if p.status<>'pending_upload' then return p.status::text; end if;
 select metadata into object_metadata from storage.objects where bucket_id='originals' and name=p.original_path;
 if object_metadata is null or coalesce((object_metadata->>'size')::bigint,0)<>p.bytes or coalesce(object_metadata->>'mimetype','')<>'image/jpeg' then raise exception 'Stored file does not match upload'; end if;
 update public.photos set status='uploaded',error=null where id=p.id;
 insert into public.processing_jobs(type,event_id,photo_id,idempotency_key) values('process_photo',e.id,p.id,'process_photo:'||p.id::text) on conflict(idempotency_key) do nothing;
 return 'uploaded';
end $$;

revoke all on function public.save_photographer_event(uuid,text,date,text,text[],text,boolean,boolean,timestamptz),public.set_event_cover(uuid,text),public.reserve_photo_upload(uuid,text,text,bigint),public.complete_photo_upload(uuid,uuid) from public,anon;
grant execute on function public.save_photographer_event(uuid,text,date,text,text[],text,boolean,boolean,timestamptz),public.set_event_cover(uuid,text),public.reserve_photo_upload(uuid,text,text,bigint),public.complete_photo_upload(uuid,uuid) to authenticated;

-- Signing requires INSERT permission, scoped to a previously reserved, pending photo.
-- No UPDATE policy exists for originals: signed tokens cannot overwrite an object.
create policy photographer_reserved_upload on storage.objects for insert to authenticated with check (
 bucket_id='originals' and exists (
 select 1 from public.photos p join public.events e on e.id=p.event_id
 where p.original_path=name and p.original_path=e.photographer_id::text||'/'||e.id::text||'/'||p.id::text||'/original.jpg' and p.status='pending_upload' and e.photographer_id=(select auth.uid()) and e.status in ('draft','active')
 ));
create policy photographer_cover_insert on storage.objects for insert to authenticated with check (
 bucket_id='branding' and exists(select 1 from public.events e where e.photographer_id=(select auth.uid()) and e.status in ('draft','active') and name ~ ('^'||e.photographer_id::text||'/'||e.id::text||'/cover/[a-f0-9-]{36}\.jpg$'))
);
-- Old covers can be cleaned up only once no event references them.
create policy photographer_unused_cover_delete on storage.objects for delete to authenticated using (
 bucket_id='branding' and name ~ ('^'||(select auth.uid())::text||'/[a-f0-9-]{36}/cover/[a-f0-9-]{36}\.jpg$')
 and not exists(select 1 from public.events e where e.cover_path=name)
);
