# EOS — Claude Instructions

## Setting up on a new machine

Copy two files from the old machine (both gitignored, both irreplaceable):

- **`.env`** — root only; `apps/backend/.env` and `apps/frontend/.env` are symlinks to it.
- **`infra/terraform.tfvars`** — `vercel_api_token` / `github_token` plus the prod values.

Then:

```bash
gh repo clone elumixor/puretype && cd puretype
cp /path/to/.env .env
cp /path/to/terraform.tfvars infra/terraform.tfvars
terraform login          # state only; see below
bun run setup            # validates .env, bun install, prisma generate, terraform init
bun run dev
```

**Do not try to regenerate `.env` from a remote — there isn't one.** Two dead ends, both tried:

- `vercel env pull` returns these vars as **empty strings**. Terraform declares them `sensitive`, so Vercel
  stores them write-only. The pull *appears* to succeed and silently produces a `.env` full of blanks.
- `infra/terraform.tfvars` holds **prod** values, which are not the dev values. `TELEGRAM_BOT_TOKEN` is a
  separate dev bot; deriving `.env` from tfvars would point local dev at the production Telegram bot.

`bun run setup` therefore validates `.env` and refuses to run on missing/blank keys, but never writes secrets.

Terraform state lives in HCP Terraform (org `atmagaming`, workspace `puretype`), so state itself needs no
copying — `terraform login` is enough. But `execution-mode` is `local`, so vars still come from the local
`terraform.tfvars`.

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

### Apply migrations yourself — don't ask

Write the migration under `prisma/migrations/<timestamp>_<name>/migration.sql` and apply it:

```bash
cd apps/backend && bun scripts/apply-migration.ts prisma/migrations/<dir>/migration.sql
```

Do this without asking, even though it hits prod. The SQL is a file you authored and it shows up in the
diff, so it is reviewable after the fact. `prisma.config.ts` points at a throwaway local `dev.db` — that
is for *generating* migrations only, never the real target.

**Apply the migration BEFORE pushing.** A push redeploys the backend; if the code selects a column that
does not exist yet, every request touching it 500s until the migration lands.

Still off-limits (blocked by a hook in `.claude/settings.json`): `prisma db push`, `prisma migrate deploy`,
`prisma migrate reset`. These infer the change themselves and can drop columns or wipe the DB with no
reviewed SQL. If you think you need one, stop and ask.

## New / updated features

When asked to add/update/fix something. Just commit and push. Run `bun run release` to ship a new TestFlight build. No need to wait for approval or coordinate with others.
