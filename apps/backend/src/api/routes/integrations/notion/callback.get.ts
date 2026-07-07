import { env } from "env";
import { sendRedirect } from "h3";
import { verifyState } from "services/integrations/oauth-state";
import { exchangeCode } from "services/notion";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  { query: { code: z.string().optional(), state: z.string().optional(), error: z.string().optional() } },
  async ({ query, event }) => {
    const back = (status: string) => sendRedirect(event, `${env.PUBLIC_APP_URL}/?notion=${status}`, 302);

    if (query.error || !query.code || !query.state) return back("error");
    const claim = verifyState(query.state);
    if (!claim) return back("error");

    try {
      const r = await exchangeCode(query.code);
      await prisma.notionAccount.upsert({
        where: { userId_workspaceId: { userId: claim.userId, workspaceId: r.workspace_id } },
        create: {
          userId: claim.userId,
          workspaceId: r.workspace_id,
          workspaceName: r.workspace_name,
          workspaceIcon: r.workspace_icon,
          botId: r.bot_id,
          accessToken: r.access_token,
        },
        update: {
          workspaceName: r.workspace_name,
          workspaceIcon: r.workspace_icon,
          botId: r.bot_id,
          accessToken: r.access_token,
        },
      });
      return back("connected");
    } catch (err) {
      console.error("[integrations] notion callback failed:", err);
      return back("error");
    }
  },
);
