import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testProcessing(db, owner, other) {
  const event = randomUUID(),
    photo = randomUUID(),
    second = randomUUID();
  await db.exec(`reset role;
    insert into events(id,photographer_id,title,event_date,face_expires_at) values('${event}','${owner}','Worker fixture',current_date,now()+interval '30 days');
    insert into photos(id,event_id,original_path,original_filename,upload_key,status) values
    ('${photo}','${event}','${owner}/${event}/${photo}/original.jpg','fixture.jpg',repeat('f',64),'uploaded'),
    ('${second}','${event}','${owner}/${event}/${second}/original.jpg','second.jpg',repeat('e',64),'uploaded');
    insert into processing_jobs(type,event_id,photo_id,idempotency_key) values('process_photo','${event}','${photo}','test:'||'${photo}');
    set role service_role;`);
  // Earlier test fixtures can have runnable jobs. Claim until this fixture appears.
  let job;
  for (let i = 0; i < 10 && !job; i++)
    job = (
      await db.query("select * from claim_jobs(100,'worker-A')")
    ).rows.find((row) => row.photo_id === photo);
  assert.ok(job);
  assert.ok(job.lease_token);
  const token = job.lease_token;
  const rpc = (name, suffix = "") => `${name}('${job.id}','${token}'${suffix})`;
  const prepared = (
    await db.query(`select ${rpc("prepare_photo_job")} as value`)
  ).rows[0].value;
  assert.equal(prepared.photo.status, "processing");
  assert.equal(prepared.event.rekognition_collection_id, `snapmatch-${event}`);
  assert.equal(prepared.blocked, false);
  await assert.rejects(
    db.query(`select prepare_photo_job('${job.id}','${randomUUID()}')`),
    /lease_lost/,
  );
  assert.equal(
    (
      await db.query(
        `select heartbeat_photo_job('${job.id}','${randomUUID()}') ok`,
      )
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (await db.query(`select ${rpc("heartbeat_photo_job")} ok`)).rows[0].ok,
    true,
  );
  await db.query(`select ${rpc("checkpoint_photo_assets", ",3000,2000,15.5")}`);
  const faceId = randomUUID();
  const faces = JSON.stringify([
    {
      face_id: faceId,
      box_left: 0.1,
      box_top: 0.2,
      box_width: 0.3,
      box_height: 0.4,
      confidence: 99,
    },
  ]);
  // A bad face must roll back the entire completion, including the job status.
  await assert.rejects(
    db.query(
      `select ${rpc("complete_photo_job", ',\'[{"face_id":"invalid","box_left":2}]\',0')}`,
    ),
  );
  assert.equal(
    (await db.query(`select status from processing_jobs where id='${job.id}'`))
      .rows[0].status,
    "running",
  );
  await db.query(`select ${rpc("complete_photo_job", `,'${faces}',2`)}`);
  const result = (
    await db.query(
      `select status,face_count,unindexed_face_count,web_path from photos where id='${photo}'`,
    )
  ).rows[0];
  assert.equal(result.status, "indexed");
  assert.equal(result.face_count, 1);
  assert.equal(result.unindexed_face_count, 2);
  assert.equal(result.web_path, `${owner}/${event}/${photo}/web-v1.jpg`);
  await assert.rejects(
    db.query(`select ${rpc("complete_photo_job", `,'${faces}',0`)}`),
    /lease_lost/,
  );
  // A lost completion response followed by recovery must not index again.
  await db.exec(
    `update processing_jobs set status='queued',attempts=0 where id='${job.id}'`,
  );
  job = (await db.query("select * from claim_jobs(100,'worker-B')")).rows.find(
    (row) => row.photo_id === photo,
  );
  assert.equal(
    (
      await db.query(
        `select prepare_photo_job('${job.id}','${job.lease_token}') value`,
      )
    ).rows[0].value.done,
    true,
  );
  assert.equal(
    (
      await db.query(
        `select count(*)::int n from photo_faces where photo_id='${photo}'`,
      )
    ).rows[0].n,
    1,
  );

  await db.exec(
    `insert into processing_jobs(type,event_id,photo_id,idempotency_key) values('process_photo','${event}','${second}','test:'||'${second}')`,
  );
  job = (await db.query("select * from claim_jobs(100,'worker-A')")).rows.find(
    (row) => row.photo_id === second,
  );
  const staleToken = job.lease_token;
  await db.exec(
    `update processing_jobs set locked_at=now()-interval '6 minutes' where id='${job.id}'`,
  );
  assert.equal(
    (
      await db.query(
        `select heartbeat_photo_job('${job.id}','${staleToken}') ok`,
      )
    ).rows[0].ok,
    false,
  );
  await db.query("select * from claim_jobs(100,'recovery')");
  let recovered = (
    await db.query(`select * from processing_jobs where id='${job.id}'`)
  ).rows[0];
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.lease_token, null);
  assert.ok(new Date(recovered.run_after) > new Date());
  await db.exec(
    `update processing_jobs set run_after=now() where id='${job.id}'`,
  );
  job = (await db.query("select * from claim_jobs(100,'worker-B')")).rows.find(
    (row) => row.photo_id === second,
  );
  assert.notEqual(job.lease_token, staleToken);
  assert.equal(job.attempts, 2);
  assert.equal(
    (
      await db.query(
        `select fail_photo_job('${job.id}','${staleToken}','storage_error',false) ok`,
      )
    ).rows[0].ok,
    false,
  );
  await assert.rejects(
    db.query(
      `select checkpoint_photo_assets('${job.id}','${staleToken}',100,100,2)`,
    ),
    /lease_lost/,
  );
  await db.query(
    `select fail_photo_job('${job.id}','${job.lease_token}','storage_error',false)`,
  );
  recovered = (
    await db.query(`select * from processing_jobs where id='${job.id}'`)
  ).rows[0];
  assert.equal(recovered.status, "failed");
  assert.ok(new Date(recovered.run_after).getTime() - Date.now() > 55000);
  await db.exec(
    `update processing_jobs set attempts=max_attempts,status='running',locked_at=now()-interval '6 minutes' where id='${job.id}'`,
  );
  await db.query("select * from claim_jobs(100,'recovery')");
  assert.equal(
    (await db.query(`select status from processing_jobs where id='${job.id}'`))
      .rows[0].status,
    "dead",
  );
  // Ownership, permissions, retry cooldown, and event expiry checks.
  await db.exec(
    `reset role; set role authenticated; set request.jwt.claim.sub='${other}'`,
  );
  await assert.rejects(
    db.query(`select retry_photo_processing('${event}','${second}')`),
    /Event unavailable/,
  );
  await assert.rejects(
    db.query(
      `select photo_processing_state('${event}',array['${second}'::uuid])`,
    ),
    /Event unavailable/,
  );
  await assert.rejects(db.query("select * from claim_jobs(1,'browser')"));
  await assert.rejects(
    db.query(`select heartbeat_photo_job('${job.id}','${job.lease_token}')`),
  );
  await db.exec(`set request.jwt.claim.sub='${owner}'`);
  await assert.rejects(
    db.query(`select retry_photo_processing('${event}','${second}')`),
    /Retry unavailable/,
  );
  // Temporarily suspend only the test fixture timestamp trigger to age it.
  await db.exec(
    `reset role; alter table processing_jobs disable trigger updated_at; update processing_jobs set updated_at=now()-interval '2 minutes' where id='${job.id}'; alter table processing_jobs enable trigger updated_at; set role authenticated; set request.jwt.claim.sub='${owner}'`,
  );
  await db.query(`select retry_photo_processing('${event}','${second}')`);
  const state = (
    await db.query(
      `select photo_processing_state('${event}',array['${second}'::uuid]) value`,
    )
  ).rows[0].value;
  assert.equal(state.jobs[0].status, "queued");
  assert.equal(state.counts.indexed, 1);
  assert.equal(state.jobs[0].attempts, 0);
  assert.equal(state.jobs[0].lease_token, undefined);
  await db.exec(
    `reset role; update events set face_expires_at=now()-interval '1 minute' where id='${event}'; set role service_role`,
  );
  job = (await db.query("select * from claim_jobs(100,'worker-C')")).rows.find(
    (row) => row.photo_id === second,
  );
  assert.equal(
    (
      await db.query(
        `select prepare_photo_job('${job.id}','${job.lease_token}') value`,
      )
    ).rows[0].value.blocked,
    true,
  );
  await assert.rejects(
    db.query(
      `select complete_photo_job('${job.id}','${job.lease_token}','[]',0)`,
    ),
    /event_unavailable/,
  );
  await db.exec(`reset role; set role anon`);
  await assert.rejects(
    db.query(`select photo_processing_state('${event}',array[]::uuid[])`),
  );
  await db.exec(`reset role; delete from events where id='${event}'`);
  console.log(
    "PASS: worker fencing, heartbeat expiry, crash recovery, retry backoff/limit/cooldown, atomic face persistence, completion replay, expiry and owner isolation.",
  );
}
