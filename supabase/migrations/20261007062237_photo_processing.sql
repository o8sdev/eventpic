-- Phase 3: a five-minute renewable lease and a fresh fencing token on every claim.
-- Worker RPCs are SECURITY INVOKER and service-role-only. No browser job access.
alter table public.processing_jobs add column lease_token uuid;
alter table public.photos add column unindexed_face_count integer not null default 0 check(unindexed_face_count between 0 and 100);
create index processing_jobs_lease_idx on public.processing_jobs(locked_at) where status='running';

create or replace function public.claim_jobs(n integer, worker_id text default 'worker') returns setof public.processing_jobs
language plpgsql security invoker set search_path='' as $$
declare stale public.processing_jobs;
begin
 if n is null or n not between 1 and 100 or worker_id is null or length(worker_id) not between 1 and 200 then raise exception 'Invalid claim arguments'; end if;
 -- Only process_photo is implemented in this phase. Other job types stay queued.
 for stale in select * from public.processing_jobs j where j.type='process_photo' and
   ((j.status='running' and (j.locked_at is null or j.locked_at<clock_timestamp()-interval '5 minutes')) or
    (j.status in ('queued','failed') and j.attempts>=j.max_attempts))
   order by j.created_at for update skip locked limit 100 loop
  update public.processing_jobs set status=case when attempts>=max_attempts then 'dead'::public.job_status else 'failed'::public.job_status end,
   last_error='worker_interrupted', locked_at=null,locked_by=null,lease_token=null,
   run_after=clock_timestamp()+interval '30 seconds' where id=stale.id;
  update public.photos set status='failed',error='worker_interrupted' where id=stale.photo_id and status<>'indexed';
 end loop;
 return query with picked as (
  select j.id from public.processing_jobs j where j.type='process_photo' and j.status in ('queued','failed')
   and j.run_after<=clock_timestamp() and j.attempts<j.max_attempts
   order by j.run_after,j.created_at for update skip locked limit n
 ) update public.processing_jobs j set status='running',locked_at=clock_timestamp(),locked_by=worker_id,
   lease_token=gen_random_uuid(),attempts=j.attempts+1
   from picked where j.id=picked.id returning j.*;
end $$;

create function public.heartbeat_photo_job(p_job uuid,p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.processing_jobs set locked_at=clock_timestamp() where id=p_job and type='process_photo' and status='running'
  and lease_token=p_token and locked_at>clock_timestamp()-interval '5 minutes';
 return found;
end $$;

create function public.prepare_photo_job(p_job uuid,p_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.processing_jobs; p public.photos; e public.events;
begin
 select * into j from public.processing_jobs where id=p_job and type='process_photo' and status='running'
  and lease_token=p_token and locked_at>clock_timestamp()-interval '5 minutes' for update;
 if not found then raise exception 'lease_lost'; end if;
 select * into e from public.events where id=j.event_id for update;
 select * into p from public.photos where id=j.photo_id and event_id=e.id for update;
 if p.id is null then raise exception 'photo_unavailable'; end if;
 if p.status='indexed' then
  update public.processing_jobs set status='succeeded',locked_at=null,locked_by=null,lease_token=null,last_error=null where id=j.id;
  return jsonb_build_object('done',true);
 end if;
 if p.status not in ('uploaded','processing','failed') then raise exception 'photo_unavailable'; end if;
 if e.rekognition_collection_id is null and e.status in ('draft','active') and e.face_expires_at>clock_timestamp() then
  update public.events set rekognition_collection_id='snapmatch-'||e.id::text where id=e.id returning * into e;
 end if;
 if e.status in ('draft','active') and e.face_expires_at>clock_timestamp() then
  update public.photos set status='processing',error=null where id=p.id returning * into p;
 end if;
 return jsonb_build_object('done',false,'blocked',e.status not in ('draft','active') or e.face_expires_at<=clock_timestamp(),'photo',to_jsonb(p),'event',jsonb_build_object(
  'id',e.id,'photographer_id',e.photographer_id,'watermark_enabled',e.watermark_enabled,
  'face_expires_at',e.face_expires_at,'rekognition_collection_id',e.rekognition_collection_id));
end $$;

-- Pin the exact immutable Storage artifacts before AWS is called. Retries reuse
-- these JPEG bytes even after a worker upgrade, preserving AWS deduplication.
create function public.checkpoint_photo_assets(p_job uuid,p_token uuid,p_width integer,p_height integer,p_sharpness real) returns void
language plpgsql security invoker set search_path='' as $$
declare j public.processing_jobs; e public.events; prefix text;
begin
 select * into j from public.processing_jobs where id=p_job and status='running' and type='process_photo'
  and lease_token=p_token and locked_at>clock_timestamp()-interval '5 minutes' for update;
 if not found then raise exception 'lease_lost'; end if;
 select * into e from public.events where id=j.event_id;
 if p_width is null or p_width<1 or p_height is null or p_height<1 or p_sharpness is null or p_sharpness<0 or p_sharpness>='Infinity'::real then raise exception 'invalid_assets'; end if;
 prefix=e.photographer_id::text||'/'||e.id::text||'/'||j.photo_id::text||'/';
 update public.photos set web_path=prefix||'web-v1.jpg',thumb_path=prefix||'thumb-v1.jpg',
  width=p_width,height=p_height,sharpness=p_sharpness where id=j.photo_id and event_id=e.id;
end $$;

create function public.complete_photo_job(p_job uuid,p_token uuid,p_faces jsonb,p_unindexed integer) returns void
language plpgsql security invoker set search_path='' as $$
declare j public.processing_jobs; e public.events; p public.photos;
begin
 select * into j from public.processing_jobs where id=p_job and type='process_photo' and status='running'
  and lease_token=p_token and locked_at>clock_timestamp()-interval '5 minutes' for update;
 if not found then raise exception 'lease_lost'; end if;
 select * into e from public.events where id=j.event_id for update;
 if e.status not in ('draft','active') or e.face_expires_at<=clock_timestamp() then raise exception 'event_unavailable'; end if;
 select * into p from public.photos where id=j.photo_id and event_id=e.id for update;
 if p.web_path is null or p.thumb_path is null or p.sharpness is null then raise exception 'invalid_assets'; end if;
 if p_faces is null or jsonb_typeof(p_faces)<>'array' or jsonb_array_length(p_faces)>100 or p_unindexed is null or p_unindexed not between 0 and 100 then raise exception 'invalid_faces'; end if;
 insert into public.photo_faces(photo_id,event_id,rekognition_face_id,box_left,box_top,box_width,box_height,confidence)
 select p.id,e.id,x.face_id,x.box_left,x.box_top,x.box_width,x.box_height,x.confidence
 from jsonb_to_recordset(p_faces) as x(face_id text,box_left real,box_top real,box_width real,box_height real,confidence real)
 on conflict(event_id,rekognition_face_id) do nothing;
 if exists(select 1 from jsonb_to_recordset(p_faces) as x(face_id text) join public.photo_faces f on f.event_id=e.id and f.rekognition_face_id=x.face_id where f.photo_id<>p.id) then raise exception 'face_scope_mismatch'; end if;
 update public.photos set status='indexed',error=null,face_count=(select count(*) from public.photo_faces where photo_id=p.id),unindexed_face_count=p_unindexed where id=p.id;
 update public.processing_jobs set status='succeeded',last_error=null,locked_at=null,locked_by=null,lease_token=null where id=j.id;
end $$;

create function public.fail_photo_job(p_job uuid,p_token uuid,p_error text,p_permanent boolean default false) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j public.processing_jobs;
begin
 select * into j from public.processing_jobs where id=p_job and type='process_photo' and status='running'
  and lease_token=p_token and locked_at>clock_timestamp()-interval '5 minutes' for update;
 if not found then return false; end if;
 if p_error is null or p_error not in ('invalid_image','image_too_large','fingerprint_mismatch','storage_error','aws_access','aws_unavailable','event_unavailable','photo_unavailable','worker_interrupted','processing_error') then p_error='processing_error'; end if;
 update public.processing_jobs set status=case when p_permanent or attempts>=max_attempts then 'dead'::public.job_status else 'failed'::public.job_status end,
  last_error=p_error,run_after=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(j.attempts-1,7)))::integer),
  locked_at=null,locked_by=null,lease_token=null where id=j.id;
 update public.photos set status='failed',error=p_error where id=j.photo_id and status<>'indexed';
 return true;
end $$;

revoke all on function public.claim_jobs(integer,text),public.heartbeat_photo_job(uuid,uuid),public.prepare_photo_job(uuid,uuid),public.checkpoint_photo_assets(uuid,uuid,integer,integer,real),public.complete_photo_job(uuid,uuid,jsonb,integer),public.fail_photo_job(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_jobs(integer,text),public.heartbeat_photo_job(uuid,uuid),public.prepare_photo_job(uuid,uuid),public.checkpoint_photo_assets(uuid,uuid,integer,integer,real),public.complete_photo_job(uuid,uuid,jsonb,integer),public.fail_photo_job(uuid,uuid,text,boolean) to service_role;

-- Narrow authenticated RPCs: neither service credentials nor raw queue payloads
-- are needed by the photographer. Explicit ownership checks guard both endpoints.
create function public.photo_processing_state(p_event uuid,p_photos uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.events where id=p_event and photographer_id=auth.uid()) then raise exception 'Event unavailable' using errcode='42501'; end if;
 if cardinality(p_photos)>48 then raise exception 'Invalid page'; end if;
 return jsonb_build_object(
  'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.photos where event_id=p_event group by status) counts),
  'jobs',(select coalesce(jsonb_agg(jsonb_build_object('photo_id',photo_id,'status',status,'attempts',attempts,'max_attempts',max_attempts,'run_after',run_after)),'[]') from public.processing_jobs where event_id=p_event and type='process_photo' and photo_id=any(p_photos)));
end $$;

create function public.retry_photo_processing(p_event uuid,p_photo uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs; e public.events;
begin
 -- Same lock order as worker completion: job, then event, then photo.
 select * into j from public.processing_jobs where event_id=p_event and photo_id=p_photo and type='process_photo' for update;
 select * into e from public.events where id=p_event and photographer_id=auth.uid() for update;
 if auth.uid() is null or e.id is null then raise exception 'Event unavailable' using errcode='42501'; end if;
 if j.id is null or j.status<>'dead' or j.updated_at>clock_timestamp()-interval '1 minute' or e.status not in ('draft','active') or e.face_expires_at<=clock_timestamp() then raise exception 'Retry unavailable'; end if;
 update public.processing_jobs set status='queued',attempts=0,run_after=clock_timestamp(),last_error=null,locked_at=null,locked_by=null,lease_token=null where id=j.id;
 update public.photos set status='uploaded',error=null where id=p_photo and event_id=e.id and status='failed';
end $$;
revoke all on function public.photo_processing_state(uuid,uuid[]),public.retry_photo_processing(uuid,uuid) from public,anon;
grant execute on function public.photo_processing_state(uuid,uuid[]),public.retry_photo_processing(uuid,uuid) to authenticated;
