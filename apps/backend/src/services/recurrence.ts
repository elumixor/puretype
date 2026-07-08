import { rrulestr } from "rrule";

// Turns a Google Calendar recurrence (array of RRULE/EXDATE/RDATE lines) into a
// compact, space-free repeat code stored as an "@repeat:<code>" token in task
// text, plus the next occurrence at/after now (so a long-running series shows
// on its upcoming date, not its original start).
//
// Compact code grammar (rendered as an icon on the client, see tokens):
//   <interval><unit>[:<detail>]
//   unit: d=day w=week m=month y=year   detail(w)=BYDAY e.g. MO,TH  detail(m)=day-of-month

export interface Recurrence {
  code: string;
  next: Date;
}

function icsDate(d: Date): string {
  // Basic UTC form: 20260708T090000Z
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

// Regex-parse the RRULE line for display; exotic rules fall back to a bare unit.
function buildCode(rrule: string): string {
  const get = (key: string) => rrule.match(new RegExp(`${key}=([^;]+)`))?.[1];
  const freq = get("FREQ");
  const interval = Number(get("INTERVAL") ?? "1") || 1;
  const unit = freq === "DAILY" ? "d" : freq === "WEEKLY" ? "w" : freq === "MONTHLY" ? "m" : freq === "YEARLY" ? "y" : "";
  if (!unit) return "1w"; // unknown → generic weekly-ish; still shows the icon
  let detail = "";
  if (unit === "w") {
    const byday = get("BYDAY");
    if (byday) detail = `:${byday.replace(/[+-]?\d/g, "")}`; // strip ordinals (e.g. 1MO)
  } else if (unit === "m") {
    const bymd = get("BYMONTHDAY");
    if (bymd) detail = `:${bymd.split(",")[0]}`;
  }
  return `${interval}${unit}${detail}`;
}

export function parseRecurrence(recurrence: string[] | undefined, dtstart: Date): Recurrence | null {
  if (!recurrence?.length) return null;
  const rruleLine = recurrence.find((r) => r.startsWith("RRULE"));
  if (!rruleLine) return null;

  try {
    const set = rrulestr(`DTSTART:${icsDate(dtstart)}\n${recurrence.join("\n")}`, { forceset: true });
    // At/after now; also allow slightly-past today so today's occurrence counts.
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const next = set.after(from, true);
    if (!next) return null;
    return { code: buildCode(rruleLine), next };
  } catch {
    return null;
  }
}
