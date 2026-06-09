import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { env } from "env";
import { trackEvent } from "services/analytics";
import { requireAuth } from "services/auth";
import { handler } from "utils";
import { z } from "zod";

// Lightweight natural-language parse for a typed task. Returns the project
// name / date / duration the model extracted plus the task text with those
// removed. Project ids are resolved client-side (deterministic) — the model
// only ever sees/returns names. iOS-only + paid-gated on the client. (#47)
const gateway = createGateway({ apiKey: env.VERCEL_AI_KEY });

const parseSchema = z.object({
  cleanText: z
    .string()
    .describe("The task text with the project, date, and duration phrases removed. Keep the rest verbatim."),
  projectName: z
    .string()
    .nullable()
    .describe("The project the task belongs to. Prefer an EXACT match from the provided list; null if none implied."),
  date: z
    .string()
    .nullable()
    .describe("Absolute date the task is for, as YYYY-MM-DD, resolved against today. null if no date is implied."),
  durationMin: z.number().int().positive().nullable().describe("Duration in minutes if stated, else null."),
});

export default handler(
  {
    body: {
      text: z.string().min(1).max(500),
      projects: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
      clientDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    },
  },
  async ({ user, body: { text, projects, clientDate } }) => {
    requireAuth(user);
    const today = clientDate ?? new Date().toISOString().slice(0, 10);
    const names = (projects ?? []).map((p) => p.name).filter(Boolean);

    try {
      const { object } = await generateObject({
        model: gateway("google/gemini-2.5-flash"),
        schema: parseSchema,
        prompt:
          `Today is ${today}. Extract structured fields from this task someone typed.\n` +
          (names.length ? `Existing projects (match exactly when the task clearly belongs to one): ${names.join(", ")}.\n` : "") +
          `Rules: resolve relative dates (today, tomorrow, "next monday", "in 3 days") against today into an absolute YYYY-MM-DD. ` +
          `Only set projectName when the task clearly belongs to a project; prefer an exact name from the list, otherwise a short new name. ` +
          `cleanText must be the original text with the date/project/duration phrases stripped, nothing else changed.\n\n` +
          `Task: ${JSON.stringify(text)}`,
      });
      await trackEvent("task_parsed", user.id, { hadProject: !!object.projectName, hadDate: !!object.date });
      return object;
    } catch {
      // Fail soft — the client falls back to the raw text.
      return { cleanText: text, projectName: null, date: null, durationMin: null };
    }
  },
);
