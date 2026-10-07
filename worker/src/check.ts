import { DescribeCollectionCommand } from "@aws-sdk/client-rekognition";
import { services } from "./services.js";

async function check() {
  const { db, aws } = services();
  let ok = true;
  const { error } = await db
    .from("processing_jobs")
    .select("id,lease_token")
    .limit(0);
  console.log(
    `Supabase service access + Phase 3 schema: ${error ? "FAIL" : "PASS"}`,
  );
  ok &&= !error;
  for (const name of ["originals", "web", "thumbnails", "branding"]) {
    const bucket = await db.storage.getBucket(name);
    const privateBucket = !bucket.error && bucket.data?.public === false;
    console.log(`Private bucket ${name}: ${privateBucket ? "PASS" : "FAIL"}`);
    ok &&= privateBucket;
  }
  try {
    await aws.client.send(
      new DescribeCollectionCommand({
        CollectionId: "snapmatch-connection-check",
      }),
    );
    console.log("AWS Rekognition eu-central-1: PASS");
  } catch (error) {
    if ((error as Error).name === "ResourceNotFoundException")
      console.log(
        "AWS Rekognition eu-central-1: PASS (authenticated read; collection intentionally absent)",
      );
    else {
      console.log(`AWS Rekognition: FAIL (${(error as Error).name})`);
      ok = false;
    }
  } finally {
    aws.client.destroy();
  }
  console.log(
    "Read-only check. IndexFaces/CreateCollection permissions require the separate live smoke test.",
  );
  if (!ok) process.exitCode = 1;
}
check().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    error.message.startsWith("Invalid worker configuration:")
      ? error.message
      : "Configuration or connection check failed. No credentials were printed.";
  console.error(message);
  process.exitCode = 1;
});
