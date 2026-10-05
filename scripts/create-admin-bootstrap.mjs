import fs from "node:fs/promises";
import env from "@next/env";
import { z } from "zod";
env.loadEnvConfig(process.cwd());
const email = z
  .email()
  .parse(process.env.ADMIN_BOOTSTRAP_EMAIL)
  .replaceAll("'", "''");
const sql = `-- Run in the trusted Supabase SQL Editor AFTER all migrations and account signup.
-- This grants website-admin access. The file is ignored by git.
do $$
declare target_user uuid;
begin
 select id into target_user from auth.users where lower(email)=lower('${email}');
 if target_user is null then raise exception 'Sign in to create the account before provisioning'; end if;
 insert into public.system_admins(user_id,enabled) values(target_user,true)
 on conflict(user_id) do update set enabled=true;
end $$;
`;
await fs.writeFile("supabase/bootstrap-admin.local.sql", sql);
console.log(
  "Prepared supabase/bootstrap-admin.local.sql (ignored by git). Apply it using a trusted database owner connection.",
);
