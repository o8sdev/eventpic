-- SnapMatch public-site CMS. No new access to private event/guest rows is granted.
create table public.system_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.site_content (
 locale text primary key check(locale in ('az','ru','en')),
 draft jsonb not null default '{}'::jsonb check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=100000),
 published jsonb check(published is null or (jsonb_typeof(published)='object' and octet_length(published::text)<=100000)),
 version integer not null default 0 check(version>=0),
 published_version integer,
 updated_at timestamptz not null default now(), published_at timestamptz,
 updated_by uuid references auth.users(id) on delete set null,
 check(published_version is null or published_version<=version)
);
create table public.site_content_revisions (
 id uuid primary key default gen_random_uuid(), locale text not null check(locale in ('az','ru','en')),
 version integer not null, action text not null check(action in ('save','publish','restore')),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), actor_id uuid not null,
 created_at timestamptz not null default now(), unique(locale,version)
);
create table public.admin_audit_log (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null,
 action text not null, locale text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index site_revisions_locale_created_idx on public.site_content_revisions(locale,created_at desc);
create index admin_audit_created_idx on public.admin_audit_log(created_at desc);
create trigger site_revisions_immutable before update or delete or truncate on public.site_content_revisions for each statement execute function public.reject_mutation();
create trigger admin_audit_immutable before update or delete or truncate on public.admin_audit_log for each statement execute function public.reject_mutation();
alter table public.system_admins enable row level security;
alter table public.site_content enable row level security;
alter table public.site_content_revisions enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on public.system_admins,public.site_content,public.site_content_revisions,public.admin_audit_log from anon,authenticated;
grant select on public.system_admins,public.site_content,public.site_content_revisions,public.admin_audit_log to authenticated;
grant all on public.system_admins,public.site_content to service_role;
grant select,insert on public.site_content_revisions,public.admin_audit_log to service_role;
insert into public.site_content(locale) values('az'),('ru'),('en');

create function public.is_system_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.system_admins a where a.user_id=(select auth.uid()) and a.enabled)
$$;
revoke all on function public.is_system_admin() from public,anon;
grant execute on function public.is_system_admin() to authenticated;
create policy admin_own_membership on public.system_admins for select to authenticated using(user_id=(select auth.uid()));
create policy admin_content_read on public.site_content for select to authenticated using((select public.is_system_admin()));
create policy admin_revisions_read on public.site_content_revisions for select to authenticated using((select public.is_system_admin()));
create policy admin_audit_read on public.admin_audit_log for select to authenticated using((select public.is_system_admin()));

-- Public data is exposed by this narrow function; drafts and history have no public grants.
create function public.get_site_content(p_locale text) returns jsonb
language sql stable security definer set search_path='' as $$
 select published from public.site_content where locale=p_locale
$$;
revoke all on function public.get_site_content(text) from public;
grant execute on function public.get_site_content(text) to anon,authenticated;

-- Only these RPCs can write CMS state. Every operation locks a row, checks its version,
-- snapshots the new draft, and appends an audit entry in the same transaction.
create function public.admin_content_change(p_locale text,p_action text,p_content jsonb,p_expected_version integer,p_restore_version integer default null)
returns integer language plpgsql security definer set search_path='' as $$
declare current_row public.site_content; next_content jsonb; next_version integer;
begin
 if not public.is_system_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_locale is null or p_locale not in ('az','ru','en') or p_action is null or p_action not in ('save','publish','restore') then raise exception 'Invalid content operation'; end if;
 select * into current_row from public.site_content where locale=p_locale for update;
 if p_expected_version is null or current_row.version<>p_expected_version then raise exception 'Content changed; reload before saving' using errcode='40001'; end if;
 if p_action='save' then next_content=p_content;
 elsif p_action='publish' then next_content=current_row.draft;
 else
  select snapshot into next_content from public.site_content_revisions where locale=p_locale and version=p_restore_version;
 end if;
 if next_content is null or jsonb_typeof(next_content)<>'object' or octet_length(next_content::text)>100000 or not(next_content ? 'hero' and next_content ? 'company' and next_content ? 'legal') then raise exception 'Invalid content document'; end if;
 next_version=current_row.version+1;
 update public.site_content set draft=next_content,version=next_version,updated_at=now(),updated_by=auth.uid(),
  published=case when p_action='publish' then next_content else published end,
  published_at=case when p_action='publish' then now() else published_at end,
  published_version=case when p_action='publish' then next_version else published_version end
 where locale=p_locale;
 insert into public.site_content_revisions(locale,version,action,snapshot,actor_id) values(p_locale,next_version,p_action,next_content,auth.uid());
 insert into public.admin_audit_log(actor_id,action,locale,metadata) values(auth.uid(),'content_'||p_action,p_locale,jsonb_build_object('version',next_version,'restored_from',p_restore_version));
 return next_version;
end $$;
revoke all on function public.admin_content_change(text,text,jsonb,integer,integer) from public,anon;
grant execute on function public.admin_content_change(text,text,jsonb,integer,integer) to authenticated;

create function public.admin_platform_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_system_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 return jsonb_build_object(
  'photographers',(select count(*) from public.profiles),
  'events',(select count(*) from public.events),
  'photos',(select count(*) from public.photos),
  'jobs_queued',(select count(*) from public.processing_jobs where status='queued'),
  'jobs_failed',(select count(*) from public.processing_jobs where status in ('failed','dead'))
 );
end $$;
revoke all on function public.admin_platform_summary() from public,anon;
grant execute on function public.admin_platform_summary() to authenticated;
