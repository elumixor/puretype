import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    TURSO_DATABASE_URL: z.string().min(1),
    TURSO_AUTH_TOKEN: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    VERCEL_AI_KEY: z.string().min(1),

    // Auth
    SESSION_SECRET: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_IOS_CLIENT_ID: z.string().min(1).optional(),
    APPLE_CLIENT_ID: z.string().min(1),
    APPLE_WEB_CLIENT_ID: z.string().min(1).optional(),

    // External integrations (Google Calendar + Notion). All optional so the
    // backend still boots before secrets are provisioned; the respective
    // routes return 501 until their pair is set.
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(), // pairs with GOOGLE_CLIENT_ID for the Calendar OAuth flow
    NOTION_CLIENT_ID: z.string().min(1).optional(),
    NOTION_CLIENT_SECRET: z.string().min(1).optional(),
    // Public origins used to build OAuth redirect URIs and post-auth redirects.
    PUBLIC_API_URL: z.string().min(1).default("https://api.puretype.app"),
    PUBLIC_APP_URL: z.string().min(1).default("https://puretype.app"),
    // If set, the cron endpoints require `Authorization: Bearer <secret>`.
    CRON_SECRET: z.string().min(1).optional(),

    // Comma-separated email allowlist for /admin/*. Anyone else gets 403.
    ADMIN_EMAILS: z.string().default(""),
  })
  .transform((e) => ({
    ...e,
    production: e.NODE_ENV === "production",
    development: e.NODE_ENV === "development",
  }));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
