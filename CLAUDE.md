# EOS — Claude Instructions

## Setting up on a new machine

```bash
gh repo clone elumixor/puretype && cd puretype
vercel login
bun run setup     # links both Vercel projects, pulls secrets, writes the 3 .env files, prisma generate
bun run dev
```

`bun run setup` (`scripts/setup.ts`) reconstructs `.env`, `apps/backend/.env` and `apps/frontend/.env` from
the Vercel projects, which Terraform keeps in sync. It skips `VITE_API_URL` (production-only; locally the
frontend must point at localhost) and Vercel's own injected `VERCEL_*` vars.

Two things it CANNOT recover, because they exist nowhere but the old machine's disk:

- **`infra/terraform.tfvars`** — holds `vercel_api_token` and `github_token`, which are not stored in Vercel
  or anywhere else. Copy this file across.
- **`infra/terraform.tfstate`** — Terraform state is **local**, not a remote backend. Without it, a
  `terraform apply` on the new machine sees an empty state and tries to *recreate* the Vercel projects, domains
  and DNS records that already exist. Copy `terraform.tfstate` too, or migrate to a remote backend.

Everything else regenerates: `node_modules`, `apps/backend/generated/` (prisma), `apps/frontend/ios/App/Pods`
and `capacitor.config.json` (`bun --filter frontend sync`). `bun.lock` is gitignored, so installs are not pinned.

iOS: TestFlight builds are signed in CI from GitHub secrets, so a new machine needs no certs for `bun run release`.
Only running on a physical device from Xcode locally needs an Apple ID added in Xcode's account settings.

## iOS Releases

To ship a new TestFlight build, run from repo root:

```bash
bun run release             # auto-bumps patch (default)
bun run release minor       # 1.0.3 → 1.1.0
bun run release major       # 1.0.3 → 2.0.0
bun run release 1.2.0       # explicit version
```

This reads the current `MARKETING_VERSION` from the iOS project, bumps it, commits, creates an `ios-v<version>` git tag, and pushes both. The `.github/workflows/ios-testflight.yml` workflow triggers on `ios-v*` tags and uploads the build to TestFlight via fastlane. The build number (`CFBundleVersion`) is auto-incremented inside the workflow off the latest TestFlight number — never manually bumped.

Do not add a `workflow_dispatch` trigger. Releases must go through the `release` script so the tag/version history is consistent.

## Database — `apps/backend/.env` points at PRODUCTION

`TURSO_DATABASE_URL` in `apps/backend/.env` is the prod Turso DB. There is no separate dev DB. The local backend (`bun dev`) reads/writes prod.

- When you see a 500 like `no such column: main.Task.X`, the cause is almost always an unapplied migration in `apps/backend/prisma/migrations/`. Apply pending migrations in timestamp order. Do NOT edit schema or routes to work around the missing column.
- Never run raw `prisma db push` or `prisma migrate deploy` against this DB without confirmation — they hit prod.

## New / updated features

When asked to add/update/fix something. Just commit and push. Run `bun run release` to ship a new TestFlight build. No need to wait for approval or coordinate with others.
