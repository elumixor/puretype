#!/usr/bin/env bun
/**
 * Bootstraps a fresh clone: validates .env, installs deps, generates the Prisma
 * client, initialises Terraform.
 *
 * It deliberately does NOT fetch or generate secrets. Two dead ends, both learned
 * the hard way:
 *   - `vercel env pull` returns EMPTY strings for these vars (Terraform marks them
 *     sensitive, so Vercel stores them write-only). It looks like it worked.
 *   - infra/terraform.tfvars holds prod values, which are not the dev values —
 *     TELEGRAM_BOT_TOKEN in particular is a separate dev bot. Deriving .env from
 *     tfvars would point local dev at the production Telegram bot.
 *
 * So .env and infra/terraform.tfvars are both irreplaceable; carry them over.
 * apps/{backend,frontend}/.env are symlinks to the root .env.
 */
import { $ } from "bun";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function keysOf(text: string) {
  const keys = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) keys.set(match[1], match[2].trim());
  }
  return keys;
}

const envFile = Bun.file(join(root, ".env"));
if (!(await envFile.exists())) {
  console.error(`Missing .env.

It is gitignored and cannot be recovered from any remote:
  - Vercel returns these vars empty (they are sensitive/write-only)
  - HCP Terraform does not hold them (workspaces run with execution-mode local)

Copy these two files from your other machine, then re-run:
  .env
  infra/terraform.tfvars   (Vercel + GitHub API tokens, for infra/)`);
  process.exit(1);
}

const env = keysOf(await envFile.text());
const required = keysOf(await Bun.file(join(root, ".env.example")).text());

const missing = [...required.keys()].filter((key) => !env.has(key));
const blank = [...required.keys()].filter((key) => env.get(key) === "");
if (missing.length || blank.length) {
  if (missing.length) console.error(`.env is missing: ${missing.join(", ")}`);
  if (blank.length) console.error(`.env has empty values for: ${blank.join(", ")}`);
  process.exit(1);
}
console.log(`.env OK (${env.size} vars).`);

await $`bun install`.cwd(root);
await $`bun run prisma:generate`.cwd(join(root, "apps/backend"));

if (await Bun.file(join(root, "infra/terraform.tfvars")).exists()) {
  await $`terraform init -input=false`.cwd(join(root, "infra")).quiet();
  console.log("Terraform initialised (state: HCP Terraform, workspace `puretype`).");
} else {
  console.log("Skipped terraform init — no infra/terraform.tfvars. Copy it if you need infra/.");
}

console.log("\nDone. `bun run dev` to start.");
