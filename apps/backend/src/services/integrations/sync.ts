import { bucketForDate } from "services/buckets";
import * as google from "services/google-calendar";
import * as notion from "services/notion";
import { prisma } from "services/prisma";
import { parseRecurrence } from "services/recurrence";
import type { CalendarSource, GoogleAccount, NotionAccount, NotionSource } from "generated:prisma";

// Pull external items into tasks. Runs server-side; the offline client picks up
// the resulting task rows on its next sync/pull. Idempotent: tasks are keyed by
// (externalSourceId, externalId) so re-runs upsert rather than duplicate.

// Re-sync a source at most this often when triggered on app-open.
const STALE_MS = 1000 * 60 * 5;

function parseDate(value: string): { scheduledAt: Date; startTime: Date | null } {
  // Notion/Calendar all-day values are date-only ("2026-07-08"); timed values
  // carry a time ("2026-07-08T09:00:00Z"). Only timed values get a startTime.
  const timed = value.includes("T");
  const d = new Date(value);
  return { scheduledAt: d, startTime: timed ? d : null };
}

// ---- Google Calendar -------------------------------------------------------

export async function syncCalendarSource(source: CalendarSource & { account: GoogleAccount }): Promise<void> {
  const daysBack = 1;
  const daysAhead = 45;
  const windowStart = new Date(Date.now() - daysBack * 86_400_000);
  const windowEnd = new Date(Date.now() + daysAhead * 86_400_000);
  const events = await google.listEvents(source.account, source.calendarId, { daysBack, daysAhead });

  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.status === "cancelled") continue;
    // Modified single instances of a series carry recurringEventId; the series
    // is represented by its master, so skip these to keep one task per series.
    if (ev.recurringEventId) continue;
    const startRaw = ev.start?.dateTime ?? ev.start?.date;
    if (!startRaw) continue;
    const timed = Boolean(ev.start?.dateTime);

    // A recurring master → one repeating task dated at its next occurrence.
    // A one-off → keep only if it falls inside the normal window (the fetch
    // window is widened to catch old recurring masters, not old one-offs).
    let scheduledAt: Date;
    let startTime: Date | null;
    let repeatCode: string | null = null;
    if (ev.recurrence?.length) {
      const rec = parseRecurrence(ev.recurrence, new Date(startRaw));
      if (!rec) continue;
      repeatCode = rec.code;
      scheduledAt = rec.next;
      startTime = timed ? rec.next : null;
    } else {
      const d = new Date(startRaw);
      if (d < windowStart || d > windowEnd) continue;
      ({ scheduledAt, startTime } = parseDate(startRaw));
    }
    seen.add(ev.id);

    const endRaw = ev.end?.dateTime;
    const startRawMs = new Date(startRaw).getTime();
    const duration = timed && endRaw ? Math.round((new Date(endRaw).getTime() - startRawMs) / 60000) : null;
    const summary = (ev.summary ?? "").trim() || "(untitled event)";

    // Surface the date/time in the task itself as a "@time:" token (a Clock pill
    // on the client). One-off events keep their exact wall-clock from Google;
    // recurring ones use the next occurrence's date + the series' time-of-day.
    const timeTok = repeatCode
      ? timed
        ? `${scheduledAt.toISOString().slice(0, 10)}T${startRaw.slice(11, 16)}`
        : scheduledAt.toISOString().slice(0, 10)
      : timed
        ? startRaw.slice(0, 16) // "YYYY-MM-DDTHH:MM"
        : startRaw; // all-day: "YYYY-MM-DD"
    const text = `${summary} @time:${timeTok}${repeatCode ? ` @repeat:${repeatCode}` : ""}`;
    const externalUpdatedAt = ev.updated ? new Date(ev.updated) : null;

    await prisma.task.upsert({
      where: { externalSourceId_externalId: { externalSourceId: source.id, externalId: ev.id } },
      create: {
        userId: source.userId,
        text,
        projectId: source.projectId,
        source: "google",
        externalId: ev.id,
        externalSourceId: source.id,
        externalUrl: ev.htmlLink ?? null,
        externalUpdatedAt,
        bucket: bucketForDate(scheduledAt),
        scheduledAt,
        startTime,
        duration,
      },
      update: {
        text,
        projectId: source.projectId,
        externalUrl: ev.htmlLink ?? null,
        externalUpdatedAt,
        bucket: bucketForDate(scheduledAt),
        scheduledAt,
        startTime,
        duration,
        deletedAt: null, // resurrect if it reappears
      },
    });
  }

  // Reconcile deletions within the fetched window only (past events beyond the
  // window are left alone, not nuked).
  await softDeleteMissing(source.id, seen, { userId: source.userId, scheduledAfter: windowStart });
  await prisma.calendarSource.update({ where: { id: source.id }, data: { lastSyncedAt: new Date() } });
}

// ---- Notion ----------------------------------------------------------------

export async function syncNotionSource(source: NotionSource & { account: NotionAccount }): Promise<void> {
  const filter = notion.buildNotionFilter(notion.parseFilters(source.filters));
  const pages = await notion.queryDatabase(source.account.accessToken, source.databaseId, filter);

  const seen = new Set<string>();
  for (const page of pages) {
    if (page.archived) continue;
    seen.add(page.id);

    const text = notion.readTitle(page);
    const dateStr = notion.readDate(page, source.datePropertyId);
    const done = notion.readDone(page, source);
    const externalUpdatedAt = new Date(page.last_edited_time);

    const scheduledFields = dateStr
      ? (() => {
          const { scheduledAt, startTime } = parseDate(dateStr);
          return { bucket: bucketForDate(scheduledAt), scheduledAt, startTime };
        })()
      : { bucket: "later" as const, scheduledAt: null, startTime: null };

    const existing = await prisma.task.findUnique({
      where: { externalSourceId_externalId: { externalSourceId: source.id, externalId: page.id } },
    });

    // Skip re-applying remote state when Notion hasn't changed since we last saw
    // it — protects a local edit that hasn't yet been written back.
    if (existing && existing.externalUpdatedAt && existing.externalUpdatedAt >= externalUpdatedAt) continue;

    const completedAt = done ? (existing?.completedAt ?? new Date()) : null;
    await prisma.task.upsert({
      where: { externalSourceId_externalId: { externalSourceId: source.id, externalId: page.id } },
      create: {
        userId: source.userId,
        text,
        projectId: source.projectId,
        source: "notion",
        externalId: page.id,
        externalSourceId: source.id,
        externalUrl: page.url,
        externalUpdatedAt,
        completed: done,
        completedAt,
        ...scheduledFields,
      },
      update: {
        text,
        projectId: source.projectId,
        externalUrl: page.url,
        externalUpdatedAt,
        completed: done,
        completedAt,
        deletedAt: null,
        ...scheduledFields,
      },
    });
  }

  await softDeleteMissing(source.id, seen, { userId: source.userId });
  await prisma.notionSource.update({ where: { id: source.id }, data: { lastSyncedAt: new Date() } });
}

async function softDeleteMissing(
  externalSourceId: string,
  seen: Set<string>,
  filter: { userId: string; scheduledAfter?: Date },
): Promise<void> {
  const rows = await prisma.task.findMany({
    where: {
      externalSourceId,
      deletedAt: null,
      ...(filter.scheduledAfter ? { scheduledAt: { gte: filter.scheduledAfter } } : {}),
    },
    select: { id: true, externalId: true },
  });
  const stale = rows.filter((r) => r.externalId && !seen.has(r.externalId)).map((r) => r.id);
  if (stale.length) await prisma.task.updateMany({ where: { id: { in: stale } }, data: { deletedAt: new Date() } });
}

// ---- orchestration ---------------------------------------------------------

// Sync every source for a user whose lastSyncedAt is stale (or forced). Returns
// silently-collected errors so one bad source doesn't abort the rest.
export async function syncUser(userId: string, { force = false }: { force?: boolean } = {}): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const isStale = (t: Date | null) => force || !t || t < staleBefore;

  const [calSources, notionSources] = await Promise.all([
    prisma.calendarSource.findMany({ where: { userId }, include: { account: true } }),
    prisma.notionSource.findMany({ where: { userId }, include: { account: true } }),
  ]);

  await Promise.allSettled([
    ...calSources.filter((s) => isStale(s.lastSyncedAt)).map((s) => syncCalendarSource(s)),
    ...notionSources.filter((s) => isStale(s.lastSyncedAt)).map((s) => syncNotionSource(s)),
  ]).then((results) => {
    for (const r of results) if (r.status === "rejected") console.error("[integrations] sync failed:", r.reason);
  });
}

// Cron: sync all sources across all users that are stale.
export async function syncAllStale(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const [calSources, notionSources] = await Promise.all([
    prisma.calendarSource.findMany({
      where: { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }] },
      include: { account: true },
    }),
    prisma.notionSource.findMany({
      where: { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }] },
      include: { account: true },
    }),
  ]);

  const results = await Promise.allSettled([
    ...calSources.map((s) => syncCalendarSource(s)),
    ...notionSources.map((s) => syncNotionSource(s)),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("[integrations] cron sync failed:", r.reason);
}

// Best-effort write-back of a local completion change to Notion. Called
// fire-and-forget from the task sync op; never throws to the caller.
export async function writeBackNotionDone(taskId: string, completed: boolean): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task?.externalSourceId || task.source !== "notion" || !task.externalId) return;
  const source = await prisma.notionSource.findUnique({
    where: { id: task.externalSourceId },
    include: { account: true },
  });
  if (!source?.statusPropertyId) return;
  try {
    await notion.updatePageDone(
      source.account.accessToken,
      task.externalId,
      { statusPropertyId: source.statusPropertyId, statusPropType: source.statusPropType, doneValue: source.doneValue },
      completed,
    );
    // Bump our stored marker so the next pull doesn't treat Notion's resulting
    // last_edited_time bump as a remote change to re-apply.
    await prisma.task.update({ where: { id: taskId }, data: { externalUpdatedAt: new Date() } });
  } catch (err) {
    console.error("[integrations] notion write-back failed:", err);
  }
}
