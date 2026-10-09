import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb, unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
grant usage on schema storage to anon,authenticated,service_role;
grant select on storage.objects to anon,authenticated; grant insert,update,delete on storage.objects to authenticated;
grant all on storage.objects to service_role;`);
for (const file of (
  await readdir(new URL("../supabase/migrations/", import.meta.url))
)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  try {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  } catch (e) {
    console.error(
      "Migration failed:",
      file,
      e.message,
      e.position,
      e.internalQuery,
      e.where,
    );
    process.exit(1);
  }
}
const owner = randomUUID(),
  other = randomUUID(),
  admin = randomUUID(),
  event = randomUUID();
const sql = async (s, params = []) => (await db.query(s, params)).rows;
const denied = async (s, re) => assert.rejects(db.query(s), re);
const as = async (id, role = "authenticated") =>
  db.exec(
    `reset role; set role ${role}; set request.jwt.claim.sub='${id || ""}'`,
  );
const zero = {
  photos: 0,
  storage_bytes: 0,
  active_events: 0,
  searches: 0,
  delivery_bytes: 0,
};
await db.exec(
  `insert into auth.users values('${owner}'),('${other}'),('${admin}'); insert into system_admins(user_id) values('${admin}')`,
);
await as(null, "anon");
const original = (await sql("select get_pricing_catalog() c"))[0].c;
assert.deepEqual(
  original.plans.map((p) => p.price_minor),
  [0, 4900, 9900, 19900],
);
await denied("select * from billing_accounts");
await denied("select my_plan_usage()");
await as(owner);
await denied("select billing_private.account_context(auth.uid())");
await denied("select admin_pricing_change('publish',null,1)", /Admin access/);
let usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.plan.code, "trial");
await sql(
  `select save_photographer_event($1,'First event',current_date,'',array['en'],'en',true,false,null)`,
  [event],
);
await denied(
  `select save_photographer_event('${randomUUID()}','Over cap',current_date,'',array['en'],'en',true,false,null)`,
  /plan_events/,
);
const first = (
  await sql(
    `select reserve_photo_upload($1,repeat('a',64),'image.jpg',100) p`,
    [event],
  )
)[0].p;
await sql(`select reserve_photo_upload($1,repeat('a',64),'retry.jpg',100)`, [
  event,
]);
usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.usage.photos, 1);
assert.equal(usage.account.storage_reserved, 6000100);
await denied(
  `insert into storage.objects(bucket_id,name,metadata) values('originals','${first.path}','{"size":101,"mimetype":"image/jpeg"}')`,
  /Stored file/,
);
// Permission probes roll back, then the actual object consumes its reservation.
await db.exec("begin");
await sql(
  `insert into storage.objects(bucket_id,name) values('originals',$1)`,
  [first.path],
);
await db.exec("rollback");
await sql(
  `insert into storage.objects(bucket_id,name,metadata) values('originals',$1,'{"size":100,"mimetype":"image/jpeg"}')`,
  [first.path],
);
usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.account.storage_used, 100);
assert.equal(usage.account.storage_reserved, 6000000);
await sql(`select complete_photo_upload($1,$2)`, [event, first.id]);
await as(null, "service_role");
for (const [bucket, name, size] of [
  ["web", "web-v1.jpg", 200],
  ["thumbnails", "thumb-v1.jpg", 50],
]) {
  await sql(
    `insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)`,
    [
      bucket,
      `${owner}/${event}/${first.id}/${name}`,
      { size, mimetype: "image/jpeg" },
    ],
  );
}
await as(owner);
usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.account.storage_used, 350);
assert.equal(usage.account.storage_reserved, 0);
await denied(`select consume_plan_usage('${event}','searches',1,'bad')`);
await denied(`update billing_accounts set storage_used=0`);
await as(other);
assert.equal((await sql("select * from billing_accounts")).length, 0);
await denied(
  `select reserve_photo_upload('${event}',repeat('b',64),'bad.jpg',100)`,
  /Event unavailable/,
);
await as(admin);
const changed = structuredClone(original);
changed.plans[0].photos = 1;
changed.plans[1].price_minor = 5900;
await sql(`select admin_pricing_change('save',$1,1)`, [changed]);
assert.equal(
  (await sql("select get_pricing_catalog() c"))[0].c.plans[1].price_minor,
  4900,
);
await denied(`select admin_pricing_change('publish',null,1)`, /Reload/);
await sql(`select admin_pricing_change('publish',null,2)`);
const tinyTrial = (
  await sql(`select id from plan_versions where code='trial' and revision=3`)
)[0].id;
const pro = (
  await sql(`select id from plan_versions where code='pro' and revision=1`)
)[0].id;
await sql(
  `select admin_assign_plan($1,0,$2,'trial',now()+interval '14 days',null,$3,null,'Test quota')`,
  [owner, tinyTrial, zero],
);
await as(owner);
await denied(
  `select reserve_photo_upload('${event}',repeat('b',64),'over.jpg',100)`,
  /plan_photos/,
);
await sql(`select reserve_photo_upload($1,repeat('a',64),'retry.jpg',100)`, [
  event,
]);
await as(admin);
await sql(
  `select admin_assign_plan($1,1,$2,'active',now()+interval '2 months',null,$3,null,'Upgrade without reset')`,
  [owner, pro, zero],
);
await as(owner);
usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.usage.photos, 1);
assert.equal(usage.plan.price_minor, 9900);
await sql(`select reserve_photo_upload($1,repeat('b',64),'second.jpg',100)`, [
  event,
]);
await as(null, "service_role");
const receipt = (
  await sql(`select consume_plan_usage($1,'searches',1500,'search-full') c`, [
    event,
  ])
)[0].c;
assert.equal(receipt.replayed, false);
assert.equal(
  (
    await sql(`select consume_plan_usage($1,'searches',1500,'search-full') c`, [
      event,
    ])
  )[0].c.replayed,
  true,
);
await denied(
  `select consume_plan_usage('${event}','searches',1,'search-full')`,
  /Idempotency conflict/,
);
await denied(
  `select consume_plan_usage('${event}','searches',1,'search-over')`,
  /plan_searches/,
);
await sql(
  `select consume_plan_usage($1,'delivery_bytes',100000000000,'download-full')`,
  [event],
);
await denied(
  `select consume_plan_usage('${event}','delivery_bytes',1,'download-over')`,
  /plan_delivery/,
);
await denied(`update billing_usage_ledger set amount=1`);
await as(admin);
await sql(
  `select admin_assign_plan($1,2,$2,'active',now()+interval '2 months',null,$3,now()+interval '1 day','Temporary search allowance')`,
  [owner, pro, { ...zero, searches: 1 }],
);
await as(null, "service_role");
await sql(`select consume_plan_usage($1,'searches',1,'search-bonus')`, [event]);
await db.exec(
  `reset role; update billing_accounts set bonus_until=now()-interval '1 second' where photographer_id='${owner}'`,
);
await as(null, "service_role");
await denied(
  `select consume_plan_usage('${event}','searches',1,'search-expired-bonus')`,
  /plan_searches/,
);
// Deleting a photo must retain storage charges until the files themselves are removed.
await db.exec(`reset role; delete from photos where id='${first.id}'`);
assert.equal(
  (
    await sql(
      `select storage_used from billing_accounts where photographer_id=$1`,
      [owner],
    )
  )[0].storage_used,
  350,
);
await db.exec(
  `delete from storage.objects where name like '${owner}/${event}/${first.id}/%'`,
);
assert.equal(
  (
    await sql(
      `select storage_used from billing_accounts where photographer_id=$1`,
      [owner],
    )
  )[0].storage_used,
  0,
);
await db.exec(
  `update billing_accounts set valid_until=now()-interval '1 second',anchor_at=now()-interval '2 months' where photographer_id='${owner}'`,
);
await as(owner);
await denied(
  `select reserve_photo_upload('${event}',repeat('c',64),'expired.jpg',100)`,
  /plan_expired/,
);
usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.expired, true);
assert.ok(new Date(usage.period_start) < new Date(usage.period_end));
// A future assignment is inert until its date and does not reset consumption.
await as(admin);
await sql(
  `select admin_assign_plan($1,3,$2,'active',now()+interval '3 months',now()+interval '1 day',$3,null,'Scheduled renewal')`,
  [owner, pro, zero],
);
await as(owner);
assert.equal((await sql("select my_plan_usage() c"))[0].c.expired, true);
await db.exec(
  `reset role; update billing_accounts set next_at=now()-interval '1 second' where photographer_id='${owner}'`,
);
await as(owner);
usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.expired, false);
assert.equal(usage.account.next_at, null);
assert.equal(usage.account.version, 5);
// Old pending uploads can release their storage holds, never their usage receipts.
await db.exec(
  `reset role; update photos set updated_at=now()-interval '4 hours' where event_id='${event}' and status='pending_upload'`,
);
await as(owner);
// The normal touch trigger refreshes timestamps, so simulate an old fixture with it disabled.
await db.exec(
  `reset role; alter table photos disable trigger user; update photos set updated_at=now()-interval '4 hours' where event_id='${event}' and status='pending_upload'; alter table photos enable trigger user;`,
);
await as(owner);
assert.equal((await sql("select release_unused_uploads() n"))[0].n, 1);
assert.equal(
  (await sql("select my_plan_usage() c"))[0].c.account.storage_reserved,
  0,
);
// A storage-only limit also applies to branding paths and concurrent queued accepts.
await as(admin);
const tiny = structuredClone(changed);
tiny.plans[1].storage_bytes = 6_000_100;
tiny.plans[1].photos = 100;
await sql(`select admin_pricing_change('save',$1,3)`, [tiny]);
await sql(`select admin_pricing_change('publish',null,4)`);
const smallPlan = (
  await sql(
    `select id from plan_versions where revision=5 and code='essential'`,
  )
)[0].id;
await sql(
  `select admin_assign_plan($1,5,$2,'active',now()+interval '1 month',null,$3,null,'Storage boundary test')`,
  [owner, smallPlan, zero],
);
await as(owner);
await sql(`select reserve_photo_upload($1,repeat('c',64),'fits.jpg',100)`, [
  event,
]);
await denied(
  `select reserve_photo_upload('${event}',repeat('d',64),'over-storage.jpg',100)`,
  /plan_storage/,
);
await denied(
  `insert into storage.objects(bucket_id,name,metadata) values('branding','${owner}/logo.png','{"size":1}')`,
  /plan_storage/,
);
await as(admin);
await denied(
  `select admin_assign_plan('${owner}',5,'${smallPlan}','active',now()+interval '1 month',null,'${JSON.stringify(zero)}',null,'Stale update')`,
  /Reload/,
);
await denied(
  `select admin_assign_plan('${owner}',6,'${smallPlan}','active',now()+interval '1 month',null,'${JSON.stringify({ ...zero, photos: -1 })}',null,'Negative allowance')`,
  /Invalid allowance/,
);
await sql(
  `select admin_assign_plan($1,6,$2,'suspended',now()+interval '1 month',null,$3,null,'Suspended account')`,
  [owner, smallPlan, zero],
);
await as(owner);
await denied(
  `select reserve_photo_upload('${event}',repeat('e',64),'suspended.jpg',100)`,
  /plan_suspended/,
);
// A long trial keeps one allowance even while suspended. On upgrade, receipts
// accepted this calendar cycle still count; older-cycle receipts do not.
const longTrialOwner = randomUUID(),
  longTrialEvent = randomUUID();
await db.exec(`reset role; insert into auth.users values('${longTrialOwner}')`);
await as(longTrialOwner);
await sql(
  `select save_photographer_event($1,'Long trial',current_date,'',array['en'],'en',true,false,null)`,
  [longTrialEvent],
);
await db.exec(
  `reset role; update billing_accounts set anchor_at=now()-interval '45 days',valid_until=now()+interval '10 days' where photographer_id='${longTrialOwner}'`,
);
await as(null, "service_role");
await sql(`select consume_plan_usage($1,'searches',7,'trial-current-month')`, [
  longTrialEvent,
]);
await db.exec(`reset role; insert into billing_usage_ledger(photographer_id,period_start,metric,amount,request_key,created_at)
 select photographer_id,anchor_at,'searches',11,'trial-older-month',now()-interval '40 days' from billing_accounts where photographer_id='${longTrialOwner}';
 update billing_periods set searches=18 where photographer_id='${longTrialOwner}' and starts_at=(select anchor_at from billing_accounts where photographer_id='${longTrialOwner}')`);
const trialVersion = (
  await sql(
    `select plan_version_id id from billing_accounts where photographer_id=$1`,
    [longTrialOwner],
  )
)[0].id;
await as(admin);
await sql(
  `select admin_assign_plan($1,0,$2,'suspended',now()+interval '10 days',null,$3,null,'Pause extended trial')`,
  [longTrialOwner, trialVersion, zero],
);
await as(longTrialOwner);
usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.usage.searches, 18);
assert.equal(usage.period_start, usage.account.anchor_at);
await as(admin);
await sql(
  `select admin_assign_plan($1,1,$2,'active',now()+interval '2 months',null,$3,null,'Upgrade extended trial')`,
  [longTrialOwner, pro, zero],
);
await as(longTrialOwner);
usage = (await sql("select my_plan_usage() c"))[0].c;
assert.equal(usage.usage.searches, 7);
await as(null, "service_role");
await sql(`select consume_plan_usage($1,'searches',2,'paid-current-month')`, [
  longTrialEvent,
]);
await as(admin);
await sql(
  `select admin_assign_plan($1,2,$2,'trial',now()+interval '10 days',null,$3,null,'Return to trial for test')`,
  [longTrialOwner, trialVersion, zero],
);
await as(longTrialOwner);
assert.equal((await sql("select my_plan_usage() c"))[0].c.usage.searches, 20);
await as(admin);
await sql(
  `select admin_assign_plan($1,3,$2,'active',now()+interval '2 months',null,$3,null,'Restore active access')`,
  [longTrialOwner, pro, zero],
);
await as(longTrialOwner);
assert.equal((await sql("select my_plan_usage() c"))[0].c.usage.searches, 9);
console.log(
  "PASS: pricing versions, draft privacy, admin/owner isolation, trial/event/photo limits, idempotency, storage reservations, trusted size checks, worker assets, deletion accounting, upgrade usage retention, search/delivery limits, temporary allowances and expired access.",
);
await db.close();
