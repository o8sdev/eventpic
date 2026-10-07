import { createClient } from "@supabase/supabase-js";
import { RekognitionClient } from "@aws-sdk/client-rekognition";
import { config } from "./config.js";
import { FaceIndex } from "./aws.js";

export function services() {
  const settings = config();
  const db = createClient(
    settings.NEXT_PUBLIC_SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(60000)])
              : AbortSignal.timeout(60000),
          }),
      },
    },
  );
  const aws = new FaceIndex(
    new RekognitionClient({
      region: settings.AWS_REGION,
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 10000, requestTimeout: 60000 },
    }),
  );
  return { settings, db, aws };
}
