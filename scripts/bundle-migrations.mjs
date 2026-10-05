import { readdir, readFile, writeFile } from "node:fs/promises";
const directory = new URL("../supabase/migrations/", import.meta.url);
const names = (await readdir(directory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const blocks = [];
for (const name of names)
  blocks.push(
    `-- ${name}\n${await readFile(new URL(name, directory), "utf8")}`,
  );
await writeFile(
  new URL("../supabase/setup.local.sql", import.meta.url),
  `-- SnapMatch full setup for a fresh Supabase database.\n-- Existing projects: apply only unapplied migrations instead.\nbegin;\n${blocks.join("\n\n")}\ncommit;\n`,
);
console.log(
  "Prepared supabase/setup.local.sql (ignored by git). Review and run in the intended project's trusted SQL Editor.",
);
