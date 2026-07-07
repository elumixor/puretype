import { env } from "env";
import { sendRedirect } from "h3";
import { exchangeCode, getUserInfo } from "services/google-calendar";
import { verifyState } from "services/integrations/oauth-state";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// OAuth redirect target (a top-level browser navigation, no auth header). The
// signed `state` carries the user id. On success we store the account and
// bounce back into the app's settings.
export default handler(
  { query: { code: z.string().optional(), state: z.string().optional(), error: z.string().optional() } },
  async ({ query, event }) => {
    const back = (status: string) => sendRedirect(event, `${env.PUBLIC_APP_URL}/?google=${status}`, 302);

    if (query.error || !query.code || !query.state) return back("error");
    const claim = verifyState(query.state);
    if (!claim) return back("error");

    try {
      const tokens = await exchangeCode(query.code);
      const info = await getUserInfo(tokens.access_token);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      await prisma.googleAccount.upsert({
        where: { userId_googleUserId: { userId: claim.userId, googleUserId: info.sub } },
        create: {
          userId: claim.userId,
          googleUserId: info.sub,
          email: info.email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt,
          scope: tokens.scope,
        },
        update: {
          email: info.email,
          accessToken: tokens.access_token,
          // Google only re-issues a refresh token on fresh consent; keep the
          // existing one when this exchange didn't include a new one.
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          expiresAt,
          scope: tokens.scope,
        },
      });
      return back("connected");
    } catch (err) {
      console.error("[integrations] google callback failed:", err);
      return back("error");
    }
  },
);
