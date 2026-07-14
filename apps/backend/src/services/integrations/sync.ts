import { createError } from "h3";
import { bucketForDate } from "services/buckets";
import * as google from "services/google-calendar";
import * as notion from "services/notion";
import { prisma } from "services/prisma";
import { parseRecurrence } from "services/recurrence";
import type { CalendarSource, GoogleAccount, NotionAccount, NotionSource } from "generated:prisma";

// External items (Google Calendar events, Notion pages) are NOT persisted as
// local Task rows. The external system is the source of truth: we fetch its
// items live, map them to task-shaped objects the client merges into its view,
// and write edits straight back (see editNotionTask). There is no local copy,
// so external tasks are online-only.

// Task-shaped projection of an external item. A superset of the persisted Task
// (adds source/externalId… so the client can route edits back), with dates as
// ISO strings since it never touches Prisma.
export interface ExternalTask {
  id: string; // synthetic: "notion:<pageId>" | "google:<eventId>"
  userId: string;
  text: string;
  completed: boolean;
  completedAt: string | null;
  order: number;
  bucket: "today" | "week" | "later";
  scheduledAt: string | null;
  projectId: string | null;
  startTime: string | null;
  duration: number | null;
  source: "google" | "notion";
  externalId: string;
  externalSourceId: string;
  externalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
}

function parseDate(value: string): { scheduledAt: Date; startTime: Date | null } {
  // Notion/Calendar all-day values are date-only ("2026-07-08"); timed values
  // carry a time ("2026-07-08T09:00:00Z"). Only timed values get a startTime.
  const timed = value.includes("T");
  const d = new Date(value);
  return { scheduledAt: d, startTime: timed ? d : null };
}

// ---- Google Calendar -------------------------------------------------------

// Yesterday's events still show, so a missed task can be ticked off. Only the
// forward horizon is configurable (CalendarSource.horizonDays).
const DAYS_BACK = 1;

// Which occurrence of an event a completion refers to. Must be derived
// identically on the write path (the client echoes back the task's scheduledAt
// date), or a tick-off won't match the task it came from.
export function completionKey(externalId: string, scheduledAt: Date | string): string {
  const iso = typeof scheduledAt === "string" ? scheduledAt : scheduledAt.toISOString();
  return `${externalId}:${iso.slice(0, 10)}`;
}

function mapCalendarEvents(source: CalendarSource, events: google.CalendarEvent[], done: Set<string>): ExternalTask[] {
  // One visibility rule for everything on this calendar. A recurring series is
  // judged on its next occurrence, a one-off on its own start — otherwise a
  // yearly birthday squats in the list all year (recurring) or a meeting six
  // weeks out clutters it (one-off).
  const windowStart = new Date(Date.now() - DAYS_BACK * 86_400_000);
  const windowEnd = source.horizonDays == null ? null : new Date(Date.now() + source.horizonDays * 86_400_000);
  // No horizon set → keep only what lands in today/this week. Anything that
  // buckets to "later" is hidden.
  const visible = (at: Date) =>
    at >= windowStart && (windowEnd ? at <= windowEnd : bucketForDate(at) !== "later");
  const out: ExternalTask[] = [];

  events.forEach((ev, index) => {
    if (ev.status === "cancelled") return;
    // Modified single instances of a series carry recurringEventId; the series
    // is represented by its master, so skip these to keep one task per series.
    if (ev.recurringEventId) return;
    const startRaw = ev.start?.dateTime ?? ev.start?.date;
    if (!startRaw) return;
    const timed = Boolean(ev.start?.dateTime);

    let scheduledAt: Date;
    let startTime: Date | null;
    let repeatCode: string | null = null;
    if (ev.recurrence?.length) {
      const rec = parseRecurrence(ev.recurrence, new Date(startRaw));
      if (!rec) return;
      repeatCode = rec.code;
      scheduledAt = rec.next;
      startTime = timed ? rec.next : null;
    } else {
      ({ scheduledAt, startTime } = parseDate(startRaw));
    }
    if (!visible(scheduledAt)) return;
    const bucket = bucketForDate(scheduledAt);

    const summary = (ev.summary ?? "").trim() || "(untitled event)";
    const timeTok = repeatCode
      ? timed
        ? `${scheduledAt.toISOString().slice(0, 10)}T${startRaw.slice(11, 16)}`
        : scheduledAt.toISOString().slice(0, 10)
      : timed
        ? startRaw.slice(0, 16) // "YYYY-MM-DDTHH:MM"
        : startRaw; // all-day: "YYYY-MM-DD"
    const text =
      `${summary} @time:${timeTok}${repeatCode ? ` @repeat:${repeatCode}` : ""}` + ` @project:${source.projectId}`;
    const now = ev.updated ?? new Date().toISOString();

    const completed = done.has(completionKey(ev.id, scheduledAt));

    out.push({
      id: `google:${ev.id}`,
      userId: source.userId,
      text,
      completed,
      // Calendar has no "completed at" — we store only set membership, so the
      // occurrence date is the best stamp available.
      completedAt: completed ? scheduledAt.toISOString() : null,
      order: index,
      bucket,
      scheduledAt: scheduledAt.toISOString(),
      projectId: source.projectId,
      startTime: startTime ? startTime.toISOString() : null,
      duration: null,
      source: "google",
      externalId: ev.id,
      externalSourceId: source.id,
      externalUrl: ev.htmlLink ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  });
  return out;
}

async function fetchCalendarTasks(
  source: CalendarSource & { account: GoogleAccount },
  done: Set<string>,
): Promise<ExternalTask[]> {
  // With no horizon the cutoff is the end of the current week — at most 7 days
  // out, so 8 always covers it. mapCalendarEvents does the exact filtering.
  const events = await google.listEvents(source.account, source.calendarId, {
    daysBack: DAYS_BACK,
    daysAhead: source.horizonDays ?? 8,
  });
  return mapCalendarEvents(source, events, done);
}

// ---- Notion ----------------------------------------------------------------

function mapNotionPages(source: NotionSource, pages: notion.NotionPageValue[]): ExternalTask[] {
  const out: ExternalTask[] = [];
  pages.forEach((page, index) => {
    if (page.archived) return;

    const title = notion.readTitle(page);
    const dateStr = notion.readDate(page, source.datePropertyId);
    const done = notion.readDone(page, source);

    let scheduledAt: string | null = null;
    let startTime: string | null = null;
    let bucket: "today" | "week" | "later" = "later";
    let timeTok: string | null = null;
    if (dateStr) {
      const parsed = parseDate(dateStr);
      scheduledAt = parsed.scheduledAt.toISOString();
      startTime = parsed.startTime ? parsed.startTime.toISOString() : null;
      bucket = bucketForDate(parsed.scheduledAt);
      // Surface the (end) date as a @time pill, mirroring the calendar mapping.
      timeTok = dateStr.includes("T") ? dateStr.slice(0, 16) : dateStr.slice(0, 10);
    }
    const text = `${title}${timeTok ? ` @time:${timeTok}` : ""} @project:${source.projectId}`;

    out.push({
      id: `notion:${page.id}`,
      userId: source.userId,
      text,
      completed: done,
      completedAt: done ? page.last_edited_time : null,
      order: index,
      bucket,
      scheduledAt,
      projectId: source.projectId,
      startTime,
      duration: null,
      source: "notion",
      externalId: page.id,
      externalSourceId: source.id,
      externalUrl: page.url,
      createdAt: page.last_edited_time,
      updatedAt: page.last_edited_time,
      deletedAt: null,
    });
  });
  return out;
}

async function fetchNotionTasks(source: NotionSource & { account: NotionAccount }): Promise<ExternalTask[]> {
  // Mirror the rows of the selected Notion view (Notion runs its filter/sort).
  // No view configured → every row of the database.
  const pages = source.viewId
    ? await notion.queryView(source.account.accessToken, source.viewId)
    : await notion.queryDatabase(source.account.accessToken, source.databaseId);
  return mapNotionPages(source, pages);
}

// ---- public API ------------------------------------------------------------

// Fetch every external source for a user and return their items as task-shaped
// objects. One bad source doesn't sink the rest.
export async function listExternalTasks(userId: string): Promise<ExternalTask[]> {
  const [calSources, notionSources, completions] = await Promise.all([
    prisma.calendarSource.findMany({ where: { userId }, include: { account: true } }),
    prisma.notionSource.findMany({ where: { userId }, include: { account: true } }),
    prisma.googleCompletion.findMany({ where: { userId }, select: { key: true } }),
  ]);
  const done = new Set(completions.map((c) => c.key));

  const results = await Promise.allSettled([
    ...calSources.map((s) => fetchCalendarTasks(s, done)),
    ...notionSources.map((s) => fetchNotionTasks(s)),
  ]);

  const out: ExternalTask[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.error("[integrations] fetch failed:", r.reason);
  }
  return out;
}

// Mark a Google-sourced task done/undone. Google can't hold this bit (the scope
// is read-only and Calendar has no done-state), so it lives in our set — the
// single exception to "the external system is the source of truth". Everything
// else about the event still comes from Google on every fetch.
export async function setGoogleTaskDone(
  userId: string,
  input: { externalId: string; scheduledAt: string; completed: boolean },
): Promise<void> {
  const key = completionKey(input.externalId, input.scheduledAt);
  if (input.completed) {
    await prisma.googleCompletion.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key },
      update: {},
    });
  } else {
    await prisma.googleCompletion.deleteMany({ where: { userId, key } });
  }
}

// Write an edit made in the app straight back to a Notion page. Supports the
// three editable fields — title (stripped of tokens), scheduled date, and
// done-state. No local Task row is involved.
export async function editNotionTask(
  userId: string,
  input: { externalSourceId: string; externalId: string; title?: string; date?: string | null; completed?: boolean },
): Promise<void> {
  const source = await prisma.notionSource.findFirst({
    where: { id: input.externalSourceId, userId },
    include: { account: true },
  });
  if (!source) throw createError({ statusCode: 404, statusMessage: "Notion source not found" });
  const token = source.account.accessToken;

  if (input.title !== undefined) {
    await notion.updatePageTitle(token, input.externalId, input.title);
  }
  if (input.completed !== undefined && source.statusPropertyId) {
    await notion.updatePageDone(
      token,
      input.externalId,
      { statusPropertyId: source.statusPropertyId, statusPropType: source.statusPropType, doneValue: source.doneValue },
      input.completed,
    );
  }
  if (input.date !== undefined && source.datePropertyId) {
    const value = input.date ? { date: input.date, timed: input.date.includes("T") } : null;
    await notion.updatePageDate(token, input.externalId, source.datePropertyId, value);
  }
}
