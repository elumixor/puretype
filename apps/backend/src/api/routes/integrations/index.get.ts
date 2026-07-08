import { requireAuth } from "services/auth";
import { googleConfigured } from "services/google-calendar";
import { notionConfigured } from "services/notion";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Everything the Settings → Integrations section needs to render: which
// providers are configured server-side, the user's connected accounts, and
// each account's source→project bindings.
export default handler(async ({ user }) => {
  requireAuth(user);

  const [googleAccounts, notionAccounts] = await Promise.all([
    prisma.googleAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        calendarSources: {
          select: { id: true, calendarId: true, calendarName: true, projectId: true, lastSyncedAt: true },
        },
      },
    }),
    prisma.notionAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        workspaceName: true,
        workspaceIcon: true,
        notionSources: {
          select: {
            id: true,
            databaseId: true,
            databaseName: true,
            projectId: true,
            datePropertyId: true,
            statusPropertyId: true,
            statusPropType: true,
            doneValue: true,
            filters: true,
            lastSyncedAt: true,
          },
        },
      },
    }),
  ]);

  return {
    google: { configured: googleConfigured(), accounts: googleAccounts },
    notion: { configured: notionConfigured(), accounts: notionAccounts },
  };
});
