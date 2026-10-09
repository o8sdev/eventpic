-- Prices are integer qəpik; capacities are integer bytes (decimal GB in the UI).
-- Browser roles only read their own usage. All writes go through scoped RPCs.
create schema if not exists billing_private;
revoke all on schema billing_private from public,anon,authenticated;

create table public.pricing_catalog (
 id boolean primary key default true check(id), draft jsonb not null,
 revision integer not null default 1, published_revision integer,
 updated_at timestamptz not null default now()
);
create table public.plan_versions (
 id uuid primary key default gen_random_uuid(), revision integer not null,
 code text not null, document jsonb not null, created_at timestamptz not null default now(),
 unique(revision,code)
);
create table public.pricing_revisions (
 revision integer primary key, document jsonb not null, published boolean not null,
 actor_id uuid, created_at timestamptz not null default now()
);
create table public.billing_accounts (
 photographer_id uuid primary key references public.profiles(id) on delete cascade,
 plan_version_id uuid not null references public.plan_versions(id),
 state text not null check(state in ('trial','active','suspended')),
 anchor_at timestamptz not null default now(), valid_until timestamptz not null,
 next_plan_version_id uuid references public.plan_versions(id), next_at timestamptz, next_valid_until timestamptz,
 bonuses jsonb not null default '{"photos":0,"storage_bytes":0,"active_events":0,"searches":0,"delivery_bytes":0}',
 bonus_until timestamptz, version integer not null default 0,
 storage_used bigint not null default 0 check(storage_used>=0),
 storage_reserved bigint not null default 0 check(storage_reserved>=0),
 created_at timestamptz not null default now(),
 check(valid_until>anchor_at and isfinite(valid_until)),
 check((next_plan_version_id is null and next_at is null and next_valid_until is null) or
       (next_plan_version_id is not null and next_at is not null and next_valid_until>next_at and isfinite(next_valid_until)))
);
create index billing_accounts_plan_idx on public.billing_accounts(plan_version_id);
create index billing_accounts_next_idx on public.billing_accounts(next_plan_version_id) where next_plan_version_id is not null;
create table public.billing_periods (
 photographer_id uuid not null references public.billing_accounts(photographer_id) on delete cascade,
 starts_at timestamptz not null, photos bigint not null default 0 check(photos>=0),
 searches bigint not null default 0 check(searches>=0), delivery_bytes bigint not null default 0 check(delivery_bytes>=0),
 created_at timestamptz not null default now(), primary key(photographer_id,starts_at)
);
-- Deliberately no FKs: deleting an event/account must not erase metering receipts.
create table public.billing_usage_ledger (
 id uuid primary key default gen_random_uuid(), photographer_id uuid not null,
 period_start timestamptz not null, metric text not null check(metric in ('photos','searches','delivery_bytes')),
 amount bigint not null check(amount>0), request_key text not null check(length(request_key) between 1 and 200),
 event_id uuid, created_at timestamptz not null default now(), unique(photographer_id,metric,request_key)
);
create index billing_usage_period_idx on public.billing_usage_ledger(photographer_id,period_start);
create table public.photo_capacity (
 photo_id uuid primary key references public.photos(id) on delete cascade,
 photographer_id uuid not null references public.billing_accounts(photographer_id) on delete cascade,
 original_remaining bigint not null check(original_remaining>=0),
 web_remaining bigint not null default 5000000 check(web_remaining>=0),
 thumb_remaining bigint not null default 1000000 check(thumb_remaining>=0),
 created_at timestamptz not null default now()
);
create index photo_capacity_owner_idx on public.photo_capacity(photographer_id);
create table public.billing_storage_objects (
 bucket_id text not null, name text not null, photographer_id uuid not null references public.billing_accounts(photographer_id) on delete cascade,
 bytes bigint not null check(bytes>=0), created_at timestamptz not null default now(), primary key(bucket_id,name)
);
create index billing_storage_owner_idx on public.billing_storage_objects(photographer_id);

do $$ declare t text; begin
 foreach t in array array['pricing_catalog','plan_versions','pricing_revisions','billing_accounts','billing_periods','billing_usage_ledger','photo_capacity','billing_storage_objects'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy billing_admin_read on public.%I for select to authenticated using ((select public.is_system_admin()))',t);
 end loop;
end $$;
create policy billing_own_account on public.billing_accounts for select to authenticated using(photographer_id=(select auth.uid()));
create policy billing_own_period on public.billing_periods for select to authenticated using(photographer_id=(select auth.uid()));
create policy billing_own_plan on public.plan_versions for select to authenticated using(id in (select plan_version_id from public.billing_accounts where photographer_id=(select auth.uid())));
create trigger plan_versions_immutable before update or delete or truncate on public.plan_versions for each statement execute function public.reject_mutation();
create trigger pricing_revisions_immutable before update or delete or truncate on public.pricing_revisions for each statement execute function public.reject_mutation();
create trigger billing_ledger_immutable before update or delete or truncate on public.billing_usage_ledger for each statement execute function public.reject_mutation();
revoke update,delete,truncate on public.plan_versions,public.pricing_revisions,public.billing_usage_ledger from service_role;

create function billing_private.validate_catalog(c jsonb) returns void language plpgsql set search_path='' as $$
declare p jsonb; k text; maximum bigint; begin
 if c is null or jsonb_typeof(c)<>'object' or octet_length(c::text)>30000 or c->>'currency' is distinct from 'AZN'
 or jsonb_typeof(c->'visible') is distinct from 'boolean' or jsonb_typeof(c->'plans') is distinct from 'array'
 or jsonb_array_length(c->'plans') not between 2 and 10
 or c - array['currency','visible','heading','description','cta','note','plans'] <> '{}'::jsonb then raise exception 'Invalid catalog'; end if;
 foreach k in array array['heading','description','cta','note'] loop
  if jsonb_typeof(c->k) is distinct from 'string' or length(trim(c->>k)) not between 1 and (case when k='note' then 1200 else 240 end) then raise exception 'Invalid catalog text'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(c->'plans') x where x->>'code'='trial')<>1 or
 (select count(distinct x->>'code') from jsonb_array_elements(c->'plans') x)<>jsonb_array_length(c->'plans') then raise exception 'Invalid plan codes'; end if;
 for p in select * from jsonb_array_elements(c->'plans') loop
  if jsonb_typeof(p)<>'object' or p - array['code','name','description','price_minor','photos','storage_bytes','active_events','searches','delivery_bytes','trial_days','visible','featured','features'] <> '{}'::jsonb
   or coalesce(p->>'code','') !~ '^[a-z][a-z0-9_]{1,29}$' then raise exception 'Invalid plan'; end if;
  foreach k in array array['name','description'] loop
   if jsonb_typeof(p->k) is distinct from 'string' or length(trim(p->>k)) not between 1 and 240 then raise exception 'Invalid plan text'; end if;
  end loop;
  foreach k in array array['price_minor','photos','storage_bytes','active_events','searches','delivery_bytes','trial_days'] loop
   maximum=case k when 'price_minor' then 100000000 when 'photos' then 1000000 when 'active_events' then 10000 when 'searches' then 10000000 when 'trial_days' then 90 else 100000000000000 end;
   if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric<>trunc((p->>k)::numeric) or (p->>k)::numeric not between (case when k in ('price_minor','trial_days') then 0 when k in ('storage_bytes','delivery_bytes') then 1000000 else 1 end) and maximum then raise exception 'Invalid plan limit'; end if;
  end loop;
  if jsonb_typeof(p->'visible') is distinct from 'boolean' or jsonb_typeof(p->'featured') is distinct from 'boolean' or jsonb_typeof(p->'features') is distinct from 'array' or jsonb_array_length(p->'features')>12
   or exists(select 1 from jsonb_array_elements(p->'features') f where jsonb_typeof(f)<>'string' or length(trim(f#>>'{}')) not between 1 and 240) then raise exception 'Invalid plan features'; end if;
  if (p->>'code'='trial' and ((p->>'trial_days')::int<1 or (p->>'price_minor')::int<>0 or (p->>'visible')::boolean)) or (p->>'code'<>'trial' and (p->>'trial_days')::int<>0) then raise exception 'Invalid trial'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(c->'plans') item where (item->>'visible')::boolean and (item->>'featured')::boolean)>1 then raise exception 'Only one featured plan'; end if;
end $$;

create function public.get_pricing_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select r.document from public.pricing_catalog c join public.pricing_revisions r on r.revision=c.published_revision where c.id and r.published
$$;
create function public.admin_pricing_change(p_action text,p_document jsonb,p_expected integer) returns integer language plpgsql security definer set search_path='' as $$
declare c public.pricing_catalog; doc jsonb; revision_no int; begin
 if not public.is_system_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('save','publish') then raise exception 'Invalid operation'; end if;
 select * into c from public.pricing_catalog where id for update;
 if p_expected is null or c.revision<>p_expected then raise exception 'Reload before saving' using errcode='40001'; end if;
 doc=case when p_action='publish' then c.draft else p_document end;
 perform billing_private.validate_catalog(doc); revision_no=c.revision+1;
 insert into public.pricing_revisions(revision,document,published,actor_id) values(revision_no,doc,p_action='publish',auth.uid());
 if p_action='publish' then
  insert into public.plan_versions(revision,code,document) select revision_no,p->>'code',p from jsonb_array_elements(doc->'plans') p;
 end if;
 update public.pricing_catalog set draft=doc,revision=revision_no,published_revision=case when p_action='publish' then revision_no else published_revision end,updated_at=now() where id;
 insert into public.admin_audit_log(actor_id,action,metadata) values(auth.uid(),'pricing_'||p_action,jsonb_build_object('revision',revision_no));
 return revision_no;
end $$;

-- Private helper: callers must establish ownership/admin/service authority first.
-- A single account row serializes reservations across ALL of a photographer's events.
create function billing_private.account_context(p_owner uuid,p_active boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.billing_accounts; plan jsonb; pv uuid; period_start timestamptz; period_end timestamptz; months int; k text; billing_now timestamptz; begin
 select v.id,v.document into pv,plan from public.plan_versions v join public.pricing_catalog c on v.revision=c.published_revision where v.code='trial';
 insert into public.billing_accounts(photographer_id,plan_version_id,state,valid_until) values(p_owner,pv,'trial',now()+make_interval(days=>(plan->>'trial_days')::int)) on conflict do nothing;
 select * into a from public.billing_accounts where photographer_id=p_owner for update;
 if a.next_at<=now() then
  update public.billing_accounts set plan_version_id=next_plan_version_id,state='active',valid_until=next_valid_until,
   next_plan_version_id=null,next_at=null,next_valid_until=null,version=version+1 where photographer_id=p_owner returning * into a;
 end if;
 if p_active and a.state='suspended' then raise exception 'plan_suspended' using errcode='P0001'; end if;
 if p_active and a.valid_until<=now() then raise exception 'plan_expired' using errcode='P0001'; end if;
 select document into plan from public.plan_versions where id=a.plan_version_id;
 if a.bonus_until>now() then
  foreach k in array array['photos','storage_bytes','active_events','searches','delivery_bytes'] loop
   plan=jsonb_set(plan,array[k],to_jsonb((plan->>k)::bigint+(a.bonuses->>k)::bigint));
  end loop;
 end if;
 billing_now=least(now(),a.valid_until-interval '1 microsecond');
 months=greatest(0,(extract(year from age(billing_now at time zone 'UTC',a.anchor_at at time zone 'UTC'))::int*12+extract(month from age(billing_now at time zone 'UTC',a.anchor_at at time zone 'UTC'))::int));
 period_start=(a.anchor_at at time zone 'UTC'+make_interval(months=>months)) at time zone 'UTC';
 if period_start>billing_now then months=greatest(0,months-1); end if;
 -- Anchor arithmetic preserves the original day through short months.
 if ((a.anchor_at at time zone 'UTC'+make_interval(months=>months+1)) at time zone 'UTC')<=billing_now then months=months+1; end if;
 if a.state='trial' then period_start=a.anchor_at; period_end=a.valid_until;
 else period_start=(a.anchor_at at time zone 'UTC'+make_interval(months=>months)) at time zone 'UTC'; period_end=(a.anchor_at at time zone 'UTC'+make_interval(months=>months+1)) at time zone 'UTC'; end if;
 insert into public.billing_periods(photographer_id,starts_at) values(p_owner,period_start) on conflict do nothing;
 return jsonb_build_object('account',to_jsonb(a),'plan',plan,'period_start',period_start,'period_end',least(period_end,a.valid_until),'expired',a.valid_until<=now());
end $$;

create function public.my_plan_usage() returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; usage_row public.billing_periods; begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 c=billing_private.account_context(auth.uid(),false);
 select * into usage_row from public.billing_periods where photographer_id=auth.uid() and starts_at=(c->>'period_start')::timestamptz;
 return c||jsonb_build_object('usage',to_jsonb(usage_row),'active_events',(select count(*) from public.events where photographer_id=auth.uid() and status in ('draft','active')));
end $$;

create function public.admin_assign_plan(p_owner uuid,p_expected integer,p_plan uuid,p_state text,p_valid_until timestamptz,p_effective_at timestamptz,p_bonuses jsonb,p_bonus_until timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.billing_accounts; plan jsonb; c jsonb; k text; maximum bigint; begin
 if not public.is_system_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 c=billing_private.account_context(p_owner,false);
 select * into a from public.billing_accounts where photographer_id=p_owner;
 if p_expected is null or a.version<>p_expected then raise exception 'Reload before saving' using errcode='40001'; end if;
 select document into plan from public.plan_versions where id=p_plan;
 if plan is null or p_state is null or p_state not in ('trial','active','suspended') or p_valid_until is null or not isfinite(p_valid_until) or p_valid_until<=now() or p_valid_until>now()+interval '5 years'
 or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Invalid assignment'; end if;
 if (p_state='trial' and plan->>'code'<>'trial') or (p_state='active' and plan->>'code'='trial') then raise exception 'Invalid plan state'; end if;
 if p_bonuses is null or jsonb_typeof(p_bonuses)<>'object' or p_bonuses-array['photos','storage_bytes','active_events','searches','delivery_bytes']<>'{}'::jsonb then raise exception 'Invalid allowance'; end if;
 foreach k in array array['photos','storage_bytes','active_events','searches','delivery_bytes'] loop
  maximum=case k when 'photos' then 1000000 when 'active_events' then 10000 when 'searches' then 10000000 else 100000000000000 end;
  if jsonb_typeof(p_bonuses->k) is distinct from 'number' or (p_bonuses->>k)::numeric<>trunc((p_bonuses->>k)::numeric) or (p_bonuses->>k)::numeric not between 0 and maximum then raise exception 'Invalid allowance'; end if;
 end loop;
 if exists(select 1 from jsonb_each_text(p_bonuses) x where x.value::bigint>0) and (p_bonus_until is null or p_bonus_until<=now() or not isfinite(p_bonus_until) or p_bonus_until>p_valid_until) then raise exception 'Allowance needs an expiry'; end if;
 if p_effective_at is not null then
  if p_effective_at<=now() or not isfinite(p_effective_at) or p_effective_at>=p_valid_until or p_state<>'active' then raise exception 'Invalid schedule'; end if;
  update public.billing_accounts set next_plan_version_id=p_plan,next_at=p_effective_at,next_valid_until=p_valid_until,version=version+1 where photographer_id=p_owner;
 else
  -- Upgrades, extensions and suspensions do not reset this month's consumption.
  update public.billing_accounts set plan_version_id=p_plan,state=p_state,valid_until=p_valid_until,
   next_plan_version_id=null,next_at=null,next_valid_until=null,bonuses=p_bonuses,bonus_until=p_bonus_until,version=version+1 where photographer_id=p_owner;
 end if;
 insert into public.admin_audit_log(actor_id,action,metadata) values(auth.uid(),'plan_assignment',jsonb_build_object('photographer_id',p_owner,'previous_plan',a.plan_version_id,'plan',p_plan,'state',p_state,'valid_until',p_valid_until,'effective_at',p_effective_at,'bonuses',p_bonuses,'bonus_until',p_bonus_until,'reason',p_reason));
end $$;

-- Future guest handlers call this with a SERVER-created operation ID before AWS
-- or delivery. Browser roles cannot spend/reset quotas, select an owner or replay receipts.
create function public.consume_plan_usage(p_event uuid,p_metric text,p_amount bigint,p_request_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid; c jsonb; used bigint; cap bigint; receipt public.billing_usage_ledger; begin
 if p_metric is null or p_metric not in ('searches','delivery_bytes') or p_amount is null or p_amount<1 or p_amount>100000000000000 or p_request_key is null or length(p_request_key) not between 1 and 200 then raise exception 'Invalid usage'; end if;
 select photographer_id into owner_id from public.events where id=p_event;
 if owner_id is null then raise exception 'Event unavailable'; end if;
 c=billing_private.account_context(owner_id);
 select * into receipt from public.billing_usage_ledger where photographer_id=owner_id and metric=p_metric and request_key=p_request_key;
 if found then
  if receipt.event_id<>p_event or receipt.amount<>p_amount then raise exception 'Idempotency conflict'; end if;
  return jsonb_build_object('id',receipt.id,'replayed',true);
 end if;
 select case when p_metric='searches' then searches else delivery_bytes end into used from public.billing_periods where photographer_id=owner_id and starts_at=(c->>'period_start')::timestamptz;
 cap=(c->'plan'->>p_metric)::bigint;
 if used+p_amount>cap then raise exception '%',case when p_metric='searches' then 'plan_searches' else 'plan_delivery' end; end if;
 insert into public.billing_usage_ledger(photographer_id,period_start,metric,amount,request_key,event_id) values(owner_id,(c->>'period_start')::timestamptz,p_metric,p_amount,p_request_key,p_event) returning * into receipt;
 update public.billing_periods set searches=searches+case when p_metric='searches' then p_amount else 0 end,delivery_bytes=delivery_bytes+case when p_metric='delivery_bytes' then p_amount else 0 end where photographer_id=owner_id and starts_at=receipt.period_start;
 return jsonb_build_object('id',receipt.id,'replayed',false);
end $$;

revoke all on all functions in schema billing_private from public,anon,authenticated,service_role;
revoke all on function public.get_pricing_catalog(),public.admin_pricing_change(text,jsonb,integer),public.my_plan_usage(),public.admin_assign_plan(uuid,integer,uuid,text,timestamptz,timestamptz,jsonb,timestamptz,text),public.consume_plan_usage(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.get_pricing_catalog() to anon,authenticated;
grant execute on function public.my_plan_usage(),public.admin_pricing_change(text,jsonb,integer),public.admin_assign_plan(uuid,integer,uuid,text,timestamptz,timestamptz,jsonb,timestamptz,text) to authenticated;
grant execute on function public.consume_plan_usage(uuid,text,bigint,text) to service_role;

-- Keep the already-tested event validation and upload idempotency behind private wrappers.
alter function public.save_photographer_event(uuid,text,date,text,text[],text,boolean,boolean,timestamptz) set schema billing_private;
alter function public.reserve_photo_upload(uuid,text,text,bigint) set schema billing_private;
alter function public.retry_photo_processing(uuid,uuid) set schema billing_private;

create function public.save_photographer_event(p_id uuid,p_title text,p_event_date date,p_venue text,p_languages text[],p_default_locale text,p_originals boolean,p_watermark boolean,p_expiry timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 c=billing_private.account_context(auth.uid());
 if not exists(select 1 from public.events where id=p_id) and (select count(*) from public.events where photographer_id=auth.uid() and status in ('draft','active')) >= (c->'plan'->>'active_events')::int then raise exception 'plan_events'; end if;
 return billing_private.save_photographer_event(p_id,p_title,p_event_date,p_venue,p_languages,p_default_locale,p_originals,p_watermark,p_expiry);
end $$;

create function public.reserve_photo_upload(p_event uuid,p_key text,p_filename text,p_bytes bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; result jsonb; usage_count bigint; existing uuid; begin
 if auth.uid() is null or not exists(select 1 from public.events where id=p_event and photographer_id=auth.uid()) then raise exception 'Event unavailable' using errcode='42501'; end if;
 c=billing_private.account_context(auth.uid());
 select id into existing from public.photos where event_id=p_event and upload_key=p_key;
 if existing is null then
  select photos into usage_count from public.billing_periods where photographer_id=auth.uid() and starts_at=(c->>'period_start')::timestamptz;
  if usage_count >= (c->'plan'->>'photos')::bigint then raise exception 'plan_photos'; end if;
  if (c->'account'->>'storage_used')::bigint+(c->'account'->>'storage_reserved')::bigint+p_bytes+6000000 > (c->'plan'->>'storage_bytes')::bigint then raise exception 'plan_storage'; end if;
 end if;
 result=billing_private.reserve_photo_upload(p_event,p_key,p_filename,p_bytes);
 if existing is null then
  insert into public.photo_capacity(photo_id,photographer_id,original_remaining) values((result->>'id')::uuid,auth.uid(),p_bytes);
  update public.billing_accounts set storage_reserved=storage_reserved+p_bytes+6000000 where photographer_id=auth.uid();
  update public.billing_periods set photos=photos+1 where photographer_id=auth.uid() and starts_at=(c->>'period_start')::timestamptz;
  insert into public.billing_usage_ledger(photographer_id,period_start,metric,amount,request_key,event_id) values(auth.uid(),(c->>'period_start')::timestamptz,'photos',1,'photo:'||(result->>'id'),p_event);
 end if;
 return result;
end $$;

create function public.retry_photo_processing(p_event uuid,p_photo uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform billing_private.account_context(auth.uid());
 perform billing_private.retry_photo_processing(p_event,p_photo);
end $$;

create function public.set_photographer_event_status(p_event uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare c jsonb; e public.events; begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 c=billing_private.account_context(auth.uid(),false);
 select * into e from public.events where id=p_event and photographer_id=auth.uid() for update;
 if e.id is null or e.status not in ('draft','active','closed') or p_status is null or p_status not in ('active','closed') then raise exception 'Event unavailable' using errcode='42501'; end if;
 if p_status='active' then
  c=billing_private.account_context(auth.uid());
  if e.face_expires_at<=now() then raise exception 'Event expired'; end if;
  if e.status='closed' and (select count(*) from public.events where photographer_id=auth.uid() and status in ('draft','active')) >= (c->'plan'->>'active_events')::int then raise exception 'plan_events'; end if;
 end if;
 update public.events set status=p_status::public.event_status where id=p_event;
end $$;

-- Enforce quota on trusted Storage metadata, including direct API uploads and
-- worker derivatives. Never delete storage.objects directly: use the Storage API.
-- Metadata-free INSERTs are Storage's rolled-back signing/permission probes.
create function billing_private.account_storage_object() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; object_name text; bucket text; bytes_now bigint; bytes_before bigint=0;
 c jsonb; released bigint=0; cap public.photo_capacity; p public.photos; prefix text; begin
 object_name=case when tg_op='DELETE' then old.name else new.name end;
 bucket=case when tg_op='DELETE' then old.bucket_id else new.bucket_id end;
 if bucket not in ('originals','web','thumbnails','branding') then return coalesce(new,old); end if;
 if tg_op='UPDATE' and (old.name<>new.name or old.bucket_id<>new.bucket_id) then raise exception 'Image paths are immutable'; end if;
 if split_part(object_name,'/',1) !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'Invalid image owner'; end if;
 owner_id=split_part(object_name,'/',1)::uuid;
 if tg_op='DELETE' then
  perform 1 from public.billing_accounts where photographer_id=owner_id for update;
  delete from public.billing_storage_objects where bucket_id=bucket and name=object_name returning bytes into bytes_before;
  update public.billing_accounts set storage_used=storage_used-coalesce(bytes_before,0) where photographer_id=owner_id;
  return old;
 end if;
 if new.metadata->>'size' is null then return new; end if;
 if new.metadata->>'size' !~ '^[0-9]+$' then raise exception 'Invalid stored size'; end if;
 bytes_now=(new.metadata->>'size')::bigint;
 c=billing_private.account_context(owner_id,false);
 select bytes into bytes_before from public.billing_storage_objects where bucket_id=bucket and name=object_name;
 bytes_before=coalesce(bytes_before,0);
 if bucket in ('originals','web','thumbnails') then
  select * into p from public.photos where id=split_part(object_name,'/',3)::uuid and event_id=split_part(object_name,'/',2)::uuid;
  prefix=owner_id::text||'/'||p.event_id::text||'/'||p.id::text||'/';
  if p.id is null or not exists(select 1 from public.events where id=p.event_id and photographer_id=owner_id) or
   object_name<>prefix||(case bucket when 'originals' then 'original.jpg' when 'web' then 'web-v1.jpg' else 'thumb-v1.jpg' end) then raise exception 'Invalid image path'; end if;
  select * into cap from public.photo_capacity where photo_id=p.id;
  if bucket='originals' and bytes_now<>p.bytes then raise exception 'Stored file does not match upload'; end if;
  if (bucket='web' and bytes_now>5000000) or (bucket='thumbnails' and bytes_now>1000000) then raise exception 'Derivative exceeds reserved capacity'; end if;
  released=coalesce(case bucket when 'originals' then cap.original_remaining when 'web' then cap.web_remaining else cap.thumb_remaining end,0);
  update public.photo_capacity set original_remaining=case when bucket='originals' then 0 else original_remaining end,
   web_remaining=case when bucket='web' then 0 else web_remaining end,thumb_remaining=case when bucket='thumbnails' then 0 else thumb_remaining end where photo_id=p.id;
 end if;
 -- A reserved upload may finish after expiry/downgrade; it cannot grow its commitment.
 if bytes_now-bytes_before>released then
  perform billing_private.account_context(owner_id);
  if (c->'account'->>'storage_used')::bigint+(c->'account'->>'storage_reserved')::bigint+bytes_now-bytes_before-released>(c->'plan'->>'storage_bytes')::bigint then raise exception 'plan_storage'; end if;
 end if;
 insert into public.billing_storage_objects(bucket_id,name,photographer_id,bytes) values(bucket,object_name,owner_id,bytes_now)
 on conflict(bucket_id,name) do update set bytes=excluded.bytes;
 update public.billing_accounts set storage_used=storage_used+bytes_now-bytes_before,storage_reserved=storage_reserved-released where photographer_id=owner_id;
 return new;
end $$;
create trigger snapmatch_storage_capacity after insert or update or delete on storage.objects for each row execute function billing_private.account_storage_object();

create function billing_private.release_photo_capacity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.billing_accounts set storage_reserved=storage_reserved-old.original_remaining-old.web_remaining-old.thumb_remaining where photographer_id=old.photographer_id;
 return old;
end $$;
create trigger release_photo_capacity after delete on public.photo_capacity for each row execute function billing_private.release_photo_capacity();

revoke all on all functions in schema billing_private from public,anon,authenticated,service_role;
revoke all on function public.save_photographer_event(uuid,text,date,text,text[],text,boolean,boolean,timestamptz),public.reserve_photo_upload(uuid,text,text,bigint),public.retry_photo_processing(uuid,uuid),public.set_photographer_event_status(uuid,text) from public,anon,authenticated;
grant execute on function public.save_photographer_event(uuid,text,date,text,text[],text,boolean,boolean,timestamptz),public.reserve_photo_upload(uuid,text,text,bigint),public.retry_photo_processing(uuid,uuid),public.set_photographer_event_status(uuid,text) to authenticated;

-- Launch catalog. Future edits belong in the admin UI, never in frontend constants.
do $$ declare c jsonb; begin
 c='{"currency":"AZN","visible":true,"heading":"Your next booking. Already accounted for.","description":"Choose the space and capacity your photography business needs.","cta":"Discuss this plan","note":"Monthly allowances renew each account cycle. Storage includes originals and generated images; pending uploads reserve processing space. Plans are available by arrangement. No automatic charges.","plans":[
 {"code":"trial","name":"Trial","description":"Try your workflow with one event.","price_minor":0,"photos":200,"storage_bytes":3000000000,"active_events":1,"searches":100,"delivery_bytes":5000000000,"trial_days":14,"visible":false,"featured":false,"features":["14 days to explore"]},
 {"code":"essential","name":"Essential","description":"A considered start for occasional bookings.","price_minor":4900,"photos":2000,"storage_bytes":25000000000,"active_events":3,"searches":500,"delivery_bytes":50000000000,"trial_days":0,"visible":true,"featured":false,"features":["Private event galleries","QR sharing and download controls","Your logo and watermark settings"]},
 {"code":"pro","name":"Pro","description":"Room for a calendar that keeps filling up.","price_minor":9900,"photos":5000,"storage_bytes":100000000000,"active_events":10,"searches":1500,"delivery_bytes":100000000000,"trial_days":0,"visible":true,"featured":true,"features":["Everything in Essential","More galleries available together","Capacity for a steady flow of bookings"]},
 {"code":"studio","name":"Studio","description":"More capacity for your busiest seasons.","price_minor":19900,"photos":12000,"storage_bytes":250000000000,"active_events":30,"searches":4000,"delivery_bytes":200000000000,"trial_days":0,"visible":true,"featured":false,"features":["Everything in Pro","Space for a larger body of work","Higher processing and delivery allowances"]}]}';
 perform billing_private.validate_catalog(c);
 insert into public.pricing_catalog(draft,published_revision) values(c,1);
 insert into public.pricing_revisions(revision,document,published) values(1,c,true);
 insert into public.plan_versions(revision,code,document) select 1,p->>'code',p from jsonb_array_elements(c->'plans') p;
end $$;

-- Existing installations retain all data; any over-capacity account can be adjusted
-- by an admin. No migration deletes media or silently starts a paid subscription.
do $$ declare owner_id uuid; begin
 for owner_id in select id from public.profiles loop perform billing_private.account_context(owner_id,false); end loop;
end $$;
insert into public.billing_storage_objects(bucket_id,name,photographer_id,bytes)
 select o.bucket_id,o.name,a.photographer_id,coalesce((o.metadata->>'size')::bigint,0) from storage.objects o join public.billing_accounts a on split_part(o.name,'/',1)=a.photographer_id::text where o.bucket_id in ('originals','web','thumbnails','branding');
insert into public.photo_capacity(photo_id,photographer_id,original_remaining,web_remaining,thumb_remaining)
 select p.id,e.photographer_id,
 case when exists(select 1 from public.billing_storage_objects s where s.bucket_id='originals' and s.name=p.original_path) then 0 else coalesce(p.bytes,0) end,
 case when p.web_path is not null then 0 else 5000000 end,
 case when p.thumb_path is not null then 0 else 1000000 end
 from public.photos p join public.events e on e.id=p.event_id;
update public.billing_accounts a set storage_used=coalesce((select sum(bytes) from public.billing_storage_objects where photographer_id=a.photographer_id),0),
 storage_reserved=coalesce((select sum(original_remaining+web_remaining+thumb_remaining) from public.photo_capacity where photographer_id=a.photographer_id),0);
insert into public.billing_usage_ledger(photographer_id,period_start,metric,amount,request_key,event_id)
 select e.photographer_id,a.anchor_at,'photos',1,'photo:'||p.id::text,e.id from public.photos p join public.events e on e.id=p.event_id join public.billing_accounts a on a.photographer_id=e.photographer_id;
update public.billing_periods b set photos=(select count(*) from public.billing_usage_ledger l where l.photographer_id=b.photographer_id and l.period_start=b.starts_at and l.metric='photos');

create function public.admin_plan_usage(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; u public.billing_periods; begin
 if not public.is_system_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 c=billing_private.account_context(p_owner,false);
 select * into u from public.billing_periods where photographer_id=p_owner and starts_at=(c->>'period_start')::timestamptz;
 return c||jsonb_build_object('usage',to_jsonb(u),'active_events',(select count(*) from public.events where photographer_id=p_owner and status in ('draft','active')));
end $$;
create function public.admin_billing_accounts(p_page integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_system_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page'; end if;
 return coalesce((select jsonb_agg(to_jsonb(row)) from (
  select p.id,p.full_name,p.business_name,a.state,a.valid_until,v.document->>'name' plan_name
  from public.profiles p left join public.billing_accounts a on a.photographer_id=p.id left join public.plan_versions v on v.id=a.plan_version_id
  order by p.created_at desc,p.id limit 25 offset p_page*25
 ) row),'[]'::jsonb);
end $$;
revoke all on function public.admin_plan_usage(uuid),public.admin_billing_accounts(integer) from public,anon,authenticated;
grant execute on function public.admin_plan_usage(uuid),public.admin_billing_accounts(integer) to authenticated;

-- Only unreceived uploads can be released. Three hours exceeds the two-hour
-- signed-upload-token lifetime; refreshing a reservation also refreshes updated_at.
-- This never removes files or resets already accepted processing usage.
create function public.release_unused_uploads() returns integer language plpgsql security definer set search_path='' as $$
declare released_count integer; begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform billing_private.account_context(auth.uid(),false);
 with removed as (
  delete from public.photos p using public.events e where p.event_id=e.id and e.photographer_id=auth.uid()
   and p.status='pending_upload' and p.updated_at<now()-interval '3 hours'
   and not exists(select 1 from storage.objects s where s.bucket_id='originals' and s.name=p.original_path)
  returning p.id
 ) select count(*) into released_count from removed;
 return released_count;
end $$;
revoke all on function public.release_unused_uploads() from public,anon,authenticated;
grant execute on function public.release_unused_uploads() to authenticated;
