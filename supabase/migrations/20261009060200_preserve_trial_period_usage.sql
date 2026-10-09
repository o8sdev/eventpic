-- A trial may span several months. The active month's usage must survive an
-- upgrade, and suspending a trial must not change its single allowance period.
create index billing_usage_created_idx on public.billing_usage_ledger(photographer_id,created_at);

create function billing_private.ensure_period(p_owner uuid,p_start timestamptz,p_end timestamptz,p_reconcile boolean default false)
returns void language plpgsql set search_path='' as $$
begin
 -- Callers already hold the account lock. Normal uploads only take the cheap
 -- existence path; receipts are summed once per new cycle or plan transition.
 if not p_reconcile and exists(select 1 from public.billing_periods where photographer_id=p_owner and starts_at=p_start) then return; end if;
 insert into public.billing_periods(photographer_id,starts_at,photos,searches,delivery_bytes)
 select p_owner,p_start,
  coalesce(sum(amount) filter(where metric='photos'),0),
  coalesce(sum(amount) filter(where metric='searches'),0),
  coalesce(sum(amount) filter(where metric='delivery_bytes'),0)
 from public.billing_usage_ledger where photographer_id=p_owner and created_at>=p_start and created_at<p_end
 on conflict(photographer_id,starts_at) do update set
  photos=greatest(public.billing_periods.photos,excluded.photos),
  searches=greatest(public.billing_periods.searches,excluded.searches),
  delivery_bytes=greatest(public.billing_periods.delivery_bytes,excluded.delivery_bytes);
end $$;

revoke all on function billing_private.ensure_period(uuid,timestamptz,timestamptz,boolean) from public,anon,authenticated,service_role;
create or replace function billing_private.account_context(p_owner uuid,p_active boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if plan->>'code'='trial' then period_start=a.anchor_at; period_end=a.valid_until;
 else period_start=(a.anchor_at at time zone 'UTC'+make_interval(months=>months)) at time zone 'UTC'; period_end=(a.anchor_at at time zone 'UTC'+make_interval(months=>months+1)) at time zone 'UTC'; end if;
 perform billing_private.ensure_period(p_owner,period_start,least(period_end,a.valid_until));
 return jsonb_build_object('account',to_jsonb(a),'plan',plan,'period_start',period_start,'period_end',least(period_end,a.valid_until),'expired',a.valid_until<=now());
end $$;

create function billing_private.reconcile_plan_period() returns trigger
language plpgsql security definer set search_path='' as $$
declare c jsonb; begin
 c=billing_private.account_context(new.photographer_id,false);
 perform billing_private.ensure_period(new.photographer_id,(c->>'period_start')::timestamptz,(c->>'period_end')::timestamptz,true);
 return new;
end $$;
revoke all on function billing_private.reconcile_plan_period() from public,anon,authenticated,service_role;
create trigger reconcile_plan_period after update of plan_version_id,state on public.billing_accounts
 for each row when (old.plan_version_id is distinct from new.plan_version_id or old.state is distinct from new.state)
 execute function billing_private.reconcile_plan_period();
