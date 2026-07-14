#!/usr/bin/env bun
/**
 * Bootstraps a fresh clone: pulls secrets from the Vercel projects and writes
 * the three .env files, then installs deps and generates the Prisma client.
 *
 * Secrets are owned by Terraform (infra/) and pushed to Vercel, so Vercel is
 * the source of truth a new machine can read from. The only things this cannot
 * recover are infra/terraform.tfvars and infra/terraform.tfstate — see AGENTS.
 */
import { $ } from "bun";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const scope = "elumixors-projects";

/** Vercel injects these into its own deployments; they are noise locally. */
const isVercelInternal = (key: string) => key.startsWith("VERCEL_") && key !== "VERCEL_AI_KEY";

/** Points the app at the deployed API; locally the frontend must hit localhost. */
const isProdOnly = (key: string) => key === "VITE_API_URL";

const projects = [
  { name: "puretype-backend", cwd: join(root, "apps/backend") },
  { name: "puretype-frontend", cwd: join(root, "apps/frontend") },
];

const targets = [root, join(root, "apps/backend"), join(root, "apps/frontend")];

function parseEnv(text: string) {
  const vars = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (isVercelInternal(key) || isProdOnly(key)) continue;
    vars.set(key, raw.trim().replace(/^"(.*)"$/, "$1"));
  }
  return vars;
}

try {
  await $`vercel whoami`.quiet();
} catch {
  console.error("Not logged in to Vercel. Run `vercel login` first.");
  process.exit(1);
}

const merged = new Map<string, string>();

for (const { name, cwd } of projects) {
  console.log(`Pulling ${name}…`);
  await $`vercel link --yes --project ${name} --scope ${scope}`.cwd(cwd).quiet();

  const tmp = join(cwd, ".env.vercel-pull");
  await $`vercel env pull ${tmp} --environment=production --yes`.cwd(cwd).quiet();
  for (const [key, value] of parseEnv(await Bun.file(tmp).text())) merged.set(key, value);
  await rm(tmp, { force: true });
}

const template = await Bun.file(join(root, ".env.example")).text();
const missing = [...parseEnv(template).keys()].filter((key) => !merged.has(key));
if (missing.length) console.warn(`\nNot found on Vercel, fill in by hand: ${missing.join(", ")}`);

const contents = `${[...merged].map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
for (const dir of targets) await Bun.write(join(dir, ".env"), contents);
console.log(`\nWrote ${merged.size} vars to ${targets.length} .env files.`);

await $`bun install`.cwd(root);
await $`bun run prisma:generate`.cwd(join(root, "apps/backend"));

console.log("\nDone. `bun run dev` to start.");
console.log("For infra/ you still need terraform.tfvars + terraform.tfstate from the old machine.");
