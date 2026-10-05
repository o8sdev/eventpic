-- FaceFind Phase 1. All timestamps are absolute; event dates are Baku calendar dates.
create type public.event_status as enum ('draft','active','closed','face_search_expired','deleting');
create type public.photo_status as enum ('pending_upload','uploaded','processing','indexed','failed');
create type public.job_type as enum ('process_photo','delete_event','purge_expired');
create type public.job_status as enum ('queued','running','succeeded','failed','dead');
create type public.removal_status as enum ('pending','completed','failed');
create type public.download_kind as enum ('single','zip');
create type public.actor_type as enum ('photographer','guest','system');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '' check (length(full_name)<=120),
 business_name text check (length(business_name)<=160), phone text check (length(phone)<=32), logo_path text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.events (
 id uuid primary key default gen_random_uuid(), photographer_id uuid not null references public.profiles(id) on delete cascade,
 slug text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,12) check (slug ~ '^[a-zA-Z0-9_-]{8,64}$'),
 title text not null check (length(title) between 1 and 200), event_date date not null, venue text check (length(venue)<=300), cover_path text,
 languages text[] not null default array['az','ru','en'] check (cardinality(languages)>0 and languages <@ array['az','ru','en']::text[] and array_position(languages,null) is null),
 default_locale text not null default 'az' check (default_locale = any(languages)),
 allow_original_download boolean not null default false, watermark_enabled boolean not null default true,
 face_expires_at timestamptz not null, match_threshold numeric not null default 92 check (match_threshold between 0 and 100),
 rekognition_collection_id text unique, status public.event_status not null default 'draft',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index events_photographer_idx on public.events(photographer_id);
create index events_status_idx on public.events(status);
create index events_expiry_idx on public.events(face_expires_at);
create table public.photos (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
 original_path text not null, web_path text, thumb_path text, original_filename text not null,
 upload_key text not null, bytes bigint check(bytes>=0), width int check(width>0), height int check(height>0),
 sharpness real check(sharpness>=0 and sharpness<'Infinity'::real), face_count int not null default 0 check(face_count>=0),
 status public.photo_status not null default 'pending_upload', error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(event_id,upload_key), unique(id,event_id)
);
create index photos_event_status_idx on public.photos(event_id,status);
create table public.photo_faces (
 id uuid primary key default gen_random_uuid(), photo_id uuid not null, event_id uuid not null references public.events(id) on delete cascade,
 rekognition_face_id text not null, box_left real not null check(box_left between 0 and 1), box_top real not null check(box_top between 0 and 1),
 box_width real not null check(box_width>0 and box_width<=1), box_height real not null check(box_height>0 and box_height<=1), confidence real not null check(confidence between 0 and 100),
 created_at timestamptz not null default now(),
 foreign key(photo_id,event_id) references public.photos(id,event_id) on delete cascade,
 unique(event_id,rekognition_face_id), unique(id,photo_id,event_id)
);
create index photo_faces_photo_idx on public.photo_faces(photo_id);
create table public.guests (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
 session_token_hash text not null unique check(session_token_hash ~ '^[a-f0-9]{64}$'), locale text not null check(locale in ('az','ru','en')),
 ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz not null, last_seen_at timestamptz not null default now(), removed_at timestamptz,
 created_at timestamptz not null default now(), unique(id,event_id)
);
create index guests_event_idx on public.guests(event_id);
create table public.guest_matches (
 guest_id uuid not null, photo_id uuid not null, photo_face_id uuid not null, event_id uuid not null,
 selfie_index smallint not null check(selfie_index between 0 and 4), similarity real not null check(similarity between 0 and 100),
 created_at timestamptz not null default now(), primary key(guest_id,photo_face_id,selfie_index),
 foreign key(guest_id,event_id) references public.guests(id,event_id) on delete cascade,
 foreign key(photo_id,event_id) references public.photos(id,event_id) on delete cascade,
 foreign key(photo_face_id,photo_id,event_id) references public.photo_faces(id,photo_id,event_id) on delete cascade
);
create index guest_matches_photo_idx on public.guest_matches(photo_id);
create index guest_matches_face_idx on public.guest_matches(photo_face_id);
create index guest_matches_event_idx on public.guest_matches(event_id);
create table public.consents (
 id uuid primary key default gen_random_uuid(), event_id uuid not null, guest_id uuid not null,
 text_version text not null, locale text not null check(locale in ('az','ru','en')), ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$'),
 consented_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index consents_event_idx on public.consents(event_id);
create table public.removal_requests (
 id uuid primary key default gen_random_uuid(), event_id uuid not null, guest_id uuid not null,
 faces_deleted int not null default 0 check(faces_deleted>=0), status public.removal_status not null default 'pending', completed_at timestamptz,
 created_at timestamptz not null default now(),
 check ((status='completed') = (completed_at is not null))
);
create index removal_requests_event_idx on public.removal_requests(event_id);
create index removal_requests_status_idx on public.removal_requests(status);
create table public.processing_jobs (
 id uuid primary key default gen_random_uuid(), type public.job_type not null,
 event_id uuid references public.events(id) on delete cascade, photo_id uuid,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'), idempotency_key text not null unique,
 status public.job_status not null default 'queued', attempts int not null default 0 check(attempts>=0), max_attempts int not null default 5 check(max_attempts between 1 and 20),
 run_after timestamptz not null default now(), locked_at timestamptz, locked_by text, last_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(photo_id,event_id) references public.photos(id,event_id) on delete cascade,
 check ((type='process_photo' and event_id is not null and photo_id is not null) or (type='delete_event' and event_id is not null and photo_id is null) or (type='purge_expired' and photo_id is null))
);
create index processing_jobs_ready_idx on public.processing_jobs(status,run_after);
create index processing_jobs_event_idx on public.processing_jobs(event_id);
create index processing_jobs_photo_idx on public.processing_jobs(photo_id);
create table public.download_events (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
 guest_id uuid references public.guests(id) on delete set null, photo_id uuid references public.photos(id) on delete set null,
 kind public.download_kind not null, photo_count int not null check(photo_count>0), created_at timestamptz not null default now(),
 check(kind<>'single' or photo_count=1)
);
create index download_events_event_idx on public.download_events(event_id);
create index download_events_guest_idx on public.download_events(guest_id);
create index download_events_photo_idx on public.download_events(photo_id);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(), event_id uuid, actor_type public.actor_type not null, actor_id uuid,
 action text not null, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'), ip_hash text check(ip_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
create index audit_log_event_created_idx on public.audit_log(event_id,created_at);

create function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','events','photos','processing_jobs'] loop
 execute format('create trigger updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
end loop; end $$;
create function public.set_face_expiry() returns trigger language plpgsql set search_path='' as $$
begin
 if new.face_expires_at is null then new.face_expires_at=(new.event_date+30)::timestamp at time zone 'Asia/Baku'; end if;
 return new;
end $$;
create trigger face_expiry before insert or update on public.events for each row execute function public.set_face_expiry();
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id) values(new.id) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
create function public.reject_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'This table is append-only'; end $$;
create trigger consents_immutable before update or delete or truncate on public.consents for each statement execute function public.reject_mutation();
create trigger audit_immutable before update or delete or truncate on public.audit_log for each statement execute function public.reject_mutation();

-- Service code must also scope analytics to the same event as the referenced records.
create function public.validate_download_event() returns trigger language plpgsql set search_path='' as $$
begin
 if new.guest_id is not null and not exists(select 1 from public.guests where id=new.guest_id and event_id=new.event_id) then raise exception 'Guest event mismatch'; end if;
 if new.photo_id is not null and not exists(select 1 from public.photos where id=new.photo_id and event_id=new.event_id) then raise exception 'Photo event mismatch'; end if;
 return new;
end $$;
create trigger download_scope before insert or update on public.download_events for each row execute function public.validate_download_event();

-- Default function EXECUTE and table grants are removed explicitly, including Supabase defaults.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
do $$ declare t text; begin foreach t in array array['profiles','events','photos','photo_faces','guests','guest_matches','consents','removal_requests','processing_jobs','download_events','audit_log'] loop
 execute format('alter table public.%I enable row level security',t);
end loop; end $$;
grant select on public.profiles to authenticated;
grant update(full_name,business_name,phone) on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
grant select on public.events,public.photos to authenticated;
-- Event/photo mutations go through authenticated server handlers in Phase 2.
-- No DELETE grant: DB cascades cannot clean up Storage or AWS resources.
create policy event_read on public.events for select to authenticated using(photographer_id=(select auth.uid()));
create policy photo_read on public.photos for select to authenticated using(exists(select 1 from public.events e where e.id=photos.event_id and e.photographer_id=(select auth.uid())));
grant all on all tables in schema public to service_role;
revoke update,delete,truncate on public.consents,public.audit_log from service_role;

-- Narrow SECURITY DEFINER aggregation exposes counts, never guest tokens or face identifiers.
create function public.photographer_event_summary()
returns table(id uuid,title text,event_date date,venue text,status public.event_status,photo_count bigint,guest_count bigint,download_count bigint)
language sql stable security definer set search_path='' as $$
 select e.id,e.title,e.event_date,e.venue,e.status,
 (select count(*) from public.photos p where p.event_id=e.id),
 (select count(*) from public.guests g where g.event_id=e.id and g.removed_at is null),
 (select count(*) from public.download_events d where d.event_id=e.id)
 from public.events e where e.photographer_id=(select auth.uid()) order by e.event_date desc,e.created_at desc
$$;
revoke all on function public.photographer_event_summary() from public,anon;
grant execute on function public.photographer_event_summary() to authenticated;

-- Atomic claims; worker lease recovery and backoff are implemented in Phase 3.
create function public.claim_jobs(n integer, worker_id text default 'worker') returns setof public.processing_jobs
language plpgsql security definer set search_path='' as $$
begin
 if n is null or n<1 or n>100 or worker_id is null or length(worker_id) not between 1 and 200 then raise exception 'Invalid claim arguments'; end if;
 return query with picked as (
   select j.id from public.processing_jobs j where j.status in ('queued','failed') and j.run_after<=now() and j.attempts<j.max_attempts
   order by j.run_after,j.created_at for update skip locked limit n
 ) update public.processing_jobs j set status='running',locked_at=now(),locked_by=worker_id,attempts=j.attempts+1
 from picked where j.id=picked.id returning j.*;
end $$;
revoke all on function public.claim_jobs(integer,text) from public,anon,authenticated;
grant execute on function public.claim_jobs(integer,text) to service_role;
