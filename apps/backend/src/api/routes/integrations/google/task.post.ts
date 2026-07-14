import { requireAuth } from "services/auth";
import { setGoogleTaskDone } from "services/integrations/sync";
import { handler } from "utils";
import { z } from "zod";

// Toggle the done-state of a Google-sourced task. Unlike the Notion equivalent
// this writes nothing back to Google: the scope is calendar.readonly and a
// calendar event has no done-state, so completion is held locally as set
// membership. Text and date remain read-only — Google owns them.
//
// `scheduledAt` identifies WHICH occurrence is being completed (a recurring
// event's id is the series master), and must be the value the client received
// from the tasks feed.
export default handler(
  {
    body: {
      externalId: z.string(),
      scheduledAt: z.string(),
      completed: z.boolean(),
    },
  },
  async ({ user, body }) => {
    requireAuth(user);
    await setGoogleTaskDone(user.id, body);
    return { ok: true };
  },
);
