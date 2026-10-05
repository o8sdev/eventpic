// Real Postgres engine in WASM. Supabase-managed auth/storage are minimal fixtures;
// this verifies our SQL, not the Supabase API or its managed storage policies.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon,service_role;
 grant execute on function auth.uid() to authenticated,anon,service_role;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
 grant usage on schema storage to authenticated,anon;
 grant select on storage.objects to authenticated,anon;
 grant insert,update on storage.objects to authenticated;
`);
for (const name of [
  "202610050001_initial.sql",
  "202610050002_storage.sql",
  "202610050003_profile_logo.sql",
])
  await db.exec(
    await readFile(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  );
const uid = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const e1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const e2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const p1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const p2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const g1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const face = "ffffffff-ffff-4fff-8fff-ffffffffffff";
await db.exec(`insert into auth.users values('${uid}'),('${other}');
insert into events(id,photographer_id,title,event_date) values('${e1}','${uid}','Wedding','2026-10-05'),('${e2}','${other}','Private','2026-10-05');
insert into photos(id,event_id,original_path,original_filename,upload_key) values('${p1}','${e1}','a','a.jpg','a'),('${p2}','${e2}','b','b.jpg','b');
insert into guests(id,event_id,session_token_hash,locale,ip_hash,expires_at) values('${g1}','${e1}',repeat('a',64),'az',repeat('b',64),now()+interval '1 day');
insert into photo_faces(id,photo_id,event_id,rekognition_face_id,box_left,box_top,box_width,box_height,confidence) values('${face}','${p1}','${e1}','face-1',0.1,0.1,0.2,0.2,99);
insert into consents(event_id,guest_id,text_version,locale,ip_hash) values('${e1}','${g1}','v1','az',repeat('b',64));
insert into audit_log(event_id,actor_type,action) values('${e1}','system','consent');
insert into storage.objects(bucket_id,name) values('originals','${uid}/${e1}/${p1}/a.jpg'),('originals','${other}/${e2}/${p2}/b.jpg');`);
assert.equal(
  (await db.query("select count(*)::int n from profiles")).rows[0].n,
  2,
);
assert.equal(
  (await db.query("select face_expires_at::text d from events limit 1")).rows[0]
    .d,
  "2026-11-03 20:00:00+00",
);
assert.equal(
  (await db.query("select count(*)::int n from storage.buckets where public"))
    .rows[0].n,
  0,
);
async function denied(sql) {
  await assert.rejects(db.exec(sql));
}
await db.exec(`set role authenticated; set request.jwt.claim.sub='${uid}'`);
assert.equal(
  (await db.query("select count(*)::int n from events")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select count(*)::int n from photos")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select * from photographer_event_summary()")).rows[0].title,
  "Wedding",
);
assert.equal(
  (await db.query("select count(*)::int n from profiles")).rows[0].n,
  1,
);
await db.exec(`update profiles set full_name='Allowed' where id='${uid}'`);
await db.exec(`update profiles set full_name='Forbidden' where id='${other}'`);
for (const table of [
  "guests",
  "guest_matches",
  "photo_faces",
  "processing_jobs",
  "consents",
  "audit_log",
  "removal_requests",
  "download_events",
])
  await denied(`select * from ${table}`);
await denied(`delete from events where id='${e1}'`);
await denied(`update profiles set logo_path='arbitrary' where id='${uid}'`);
await denied("select * from claim_jobs(1)");
await db.exec("reset role; set role anon");
await denied("select * from events");
await denied("select * from photographer_event_summary()");
assert.equal(
  (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
  0,
);
await db.exec("reset role");
assert.equal(
  (await db.query(`select full_name from profiles where id='${other}'`)).rows[0]
    .full_name,
  "",
);
await denied(
  `insert into guest_matches(guest_id,photo_id,photo_face_id,event_id,selfie_index,similarity) values('${g1}','${p2}','${face}','${e1}',0,99)`,
);
await denied(
  `insert into download_events(event_id,guest_id,photo_id,kind,photo_count) values('${e2}','${g1}','${p2}','single',1)`,
);
await db.exec(
  `insert into guest_matches(guest_id,photo_id,photo_face_id,event_id,selfie_index,similarity) values('${g1}','${p1}','${face}','${e1}',0,99),('${g1}','${p1}','${face}','${e1}',1,99)`,
);
await denied(
  `insert into photos(event_id,original_path,original_filename,upload_key) values('${e1}','a','a.jpg','a')`,
);
for (const table of ["consents", "audit_log"]) {
  await denied(`delete from ${table}`);
  await denied(`update ${table} set created_at=now()`);
  await denied(`truncate ${table}`);
}
await db.exec(
  `insert into processing_jobs(type,event_id,photo_id,idempotency_key) values('process_photo','${e1}','${p1}','photo:1'); set role service_role;`,
);
const job = (await db.query("select * from claim_jobs(1,'test-worker')"))
  .rows[0];
assert.equal(job.status, "running");
assert.equal(job.attempts, 1);
assert.equal((await db.query("select * from claim_jobs(1)")).rows.length, 0);
await db.exec(
  `update processing_jobs set status='failed',run_after=now()+interval '1 hour'`,
);
assert.equal((await db.query("select * from claim_jobs(1)")).rows.length, 0);
await db.exec(
  `update processing_jobs set run_after=now(),attempts=max_attempts`,
);
assert.equal((await db.query("select * from claim_jobs(1)")).rows.length, 0);
await denied(`select * from claim_jobs(0)`);
await denied("delete from consents");
await db.exec(`reset role; delete from events where id='${e1}'`);
assert.equal(
  (await db.query("select count(*)::int n from guest_matches")).rows[0].n,
  0,
);
assert.equal(
  (await db.query("select count(*)::int n from consents")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select count(*)::int n from audit_log")).rows[0].n,
  1,
);
await db.close();
console.log(
  "PASS: migrations, RLS isolation, private storage reads, expiry, cross-event constraints, append-only logs, cascades, job claims and retry eligibility.",
);
