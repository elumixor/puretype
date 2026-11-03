import { createClient } from "@libsql/client/web";
import { env } from "env";
import { defineEventHandler } from "h3";

export default defineEventHandler(async () => {
  try {
    const client = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });
    const result = await client.execute("SELECT 1 as test");
    return { ok: true, result: result.rows };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: err.message, name: err.name, stack: err.stack?.slice(0, 500) };
  }
});
