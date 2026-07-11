import { env } from "env";

// Notion OAuth + REST client (API version 2022-06-28). Access tokens do not
// expire and there is no refresh token. The public API is database-scoped
// (it can't query a specific saved view), so a "source" binds a whole database.

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";
// The Views API (list views, read a view's saved filter) only exists on newer
// API versions. We call *only* those endpoints at this version — the filter
// they return is the same shape the 2022-06-28 database query accepts, so we
// feed it straight into queryDatabase without migrating the rest to data sources.
const VIEWS_VERSION = "2026-03-11";

export function notionConfigured(): boolean {
  return Boolean(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET);
}

export function redirectUri(): string {
  return `${env.PUBLIC_API_URL}/integrations/notion/callback`;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.NOTION_CLIENT_ID ?? "",
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri(),
    state,
  });
  return `${API}/oauth/authorize?${params.toString()}`;
}

export interface NotionOAuthResult {
  access_token: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  bot_id: string;
}

export async function exchangeCode(code: string): Promise<NotionOAuthResult> {
  const basic = Buffer.from(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", "Notion-Version": VERSION },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),
  });
  if (!res.ok) throw new Error(`notion token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as NotionOAuthResult;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" };
}

function viewsHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Notion-Version": VIEWS_VERSION, "Content-Type": "application/json" };
}

// ---- rich-text / property helpers ------------------------------------------

interface RichText {
  plain_text?: string;
}
function plain(rt: RichText[] | undefined): string {
  return (rt ?? [])
    .map((r) => r.plain_text ?? "")
    .join("")
    .trim();
}

export interface NotionProperty {
  id: string;
  name: string;
  type: string;
  options?: string[]; // for status / select properties
}

// ---- databases -------------------------------------------------------------

export interface NotionDatabase {
  id: string;
  title: string;
}

export async function searchDatabases(token: string): Promise<NotionDatabase[]> {
  const out: NotionDatabase[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${API}/search`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        filter: { value: "database", property: "object" },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!res.ok) throw new Error(`notion search failed: ${res.status}`);
    const j = (await res.json()) as {
      results: { id: string; title?: RichText[] }[];
      next_cursor: string | null;
      has_more: boolean;
    };
    for (const d of j.results) out.push({ id: d.id, title: plain(d.title) || "Untitled" });
    cursor = j.has_more ? (j.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

// Property schema of a database, so the user can pick date/status mappings.
// status/select properties carry their option names (which one means "done").
export async function getDatabaseSchema(token: string, databaseId: string): Promise<NotionProperty[]> {
  const res = await fetch(`${API}/databases/${databaseId}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`notion get database failed: ${res.status}`);
  const j = (await res.json()) as {
    properties: Record<
      string,
      { id: string; type: string; status?: { options: { name: string }[] }; select?: { options: { name: string }[] } }
    >;
  };
  return Object.entries(j.properties).map(([name, p]) => {
    const options = (p.status?.options ?? p.select?.options)?.map((o) => o.name);
    return { id: p.id, name, type: p.type, ...(options ? { options } : {}) };
  });
}

// ---- pages (rows) ----------------------------------------------------------

export interface NotionPageValue {
  id: string;
  properties: Record<string, NotionPropertyValue>;
  url: string;
  last_edited_time: string;
  archived?: boolean;
}

export interface NotionPropertyValue {
  id: string;
  type: string;
  title?: RichText[];
  rich_text?: RichText[];
  date?: { start: string; end: string | null } | null;
  checkbox?: boolean;
  status?: { name: string } | null;
  select?: { name: string } | null;
}

// ---- views -----------------------------------------------------------------

// A saved view of a database. We let the user pick one and mirror exactly the
// rows it shows — no custom filter UI. Notion's public API can't return the
// rows of a view directly, but it can hand us the view's saved `filter`, which
// we then apply to a normal database query.
export interface NotionView {
  id: string;
  name: string;
}

// List a database's views by name. Views live on the database's data
// source(s), NOT the database block — listing by database_id returns only a
// partial subset, so we resolve the data source(s) and list per data source.
// The list endpoint returns only id references, so we fetch each view to get
// its name (throttled, since databases can have 20+ views and Notion rate-limits
// ~3 req/s). Dashboard views have no filterable rows, so they're excluded.
export async function listViews(token: string, databaseId: string): Promise<NotionView[]> {
  const dbRes = await fetch(`${API}/databases/${databaseId}`, { headers: viewsHeaders(token) });
  if (!dbRes.ok) throw new Error(`notion get database failed: ${dbRes.status}`);
  const db = (await dbRes.json()) as { data_sources?: { id: string }[] };

  const ids: string[] = [];
  for (const ds of db.data_sources ?? []) {
    let cursor: string | undefined;
    do {
      const qs = new URLSearchParams({ data_source_id: ds.id, page_size: "100" });
      if (cursor) qs.set("start_cursor", cursor);
      const res = await fetch(`${API}/views?${qs.toString()}`, { headers: viewsHeaders(token) });
      if (!res.ok) throw new Error(`notion list views failed: ${res.status}`);
      const j = (await res.json()) as { results: { id: string }[]; next_cursor: string | null; has_more: boolean };
      ids.push(...j.results.map((r) => r.id));
      cursor = j.has_more ? (j.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }

  const views = await mapLimit(ids, 3, (id) => getView(token, id));
  return views
    .filter((v): v is NonNullable<typeof v> => v !== null && v.type !== "dashboard")
    .map((v) => ({ id: v.id, name: v.name }));
}

// Run `fn` over `items` with at most `limit` in flight, preserving order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface ViewObject {
  id: string;
  name: string;
  type: string;
  filter?: unknown | null;
}

async function getView(token: string, viewId: string): Promise<ViewObject | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}/views/${viewId}`, { headers: viewsHeaders(token) });
    if (res.ok) return (await res.json()) as ViewObject;
    // Back off once on rate limit so a burst doesn't silently drop views.
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5) * 1000));
      continue;
    }
    return null;
  }
  return null;
}

// Fetch the pages a view shows. We can't reconstruct a view's filter for the
// query API — the view stores formula/rollup conditions in a different shape
// than the query accepts (e.g. `formula: { equals: true }` vs the required
// `formula: { checkbox: { equals: true } }`), and `is_empty` is subtype-
// ambiguous. So we let Notion run the view's filter/sort via the view-query
// endpoint (which returns page id references) and then fetch each page.
export async function queryView(token: string, viewId: string): Promise<NotionPageValue[]> {
  const ids: string[] = [];
  const first = await fetch(`${API}/views/${viewId}/queries`, {
    method: "POST",
    headers: viewsHeaders(token),
    body: JSON.stringify({ page_size: 100 }),
  });
  if (!first.ok) throw new Error(`notion view query failed: ${first.status}`);
  let j = (await first.json()) as {
    id: string;
    results: { id: string }[];
    next_cursor: string | null;
    has_more: boolean;
  };
  const queryId = j.id;
  ids.push(...j.results.map((r) => r.id));
  while (j.has_more && j.next_cursor) {
    const qs = new URLSearchParams({ page_size: "100", start_cursor: j.next_cursor });
    const res = await fetch(`${API}/views/${viewId}/queries/${queryId}?${qs.toString()}`, {
      headers: viewsHeaders(token),
    });
    if (!res.ok) throw new Error(`notion view query page failed: ${res.status}`);
    j = (await res.json()) as typeof j;
    ids.push(...j.results.map((r) => r.id));
  }

  const pages = await mapLimit(ids, 4, (id) => getPage(token, id));
  return pages.filter((p): p is NotionPageValue => p !== null);
}

async function getPage(token: string, pageId: string): Promise<NotionPageValue | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}/pages/${pageId}`, { headers: viewsHeaders(token) });
    if (res.ok) return (await res.json()) as NotionPageValue;
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5) * 1000));
      continue;
    }
    return null;
  }
  return null;
}

export async function queryDatabase(token: string, databaseId: string, filter?: unknown): Promise<NotionPageValue[]> {
  const out: NotionPageValue[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${API}/databases/${databaseId}/query`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        page_size: 100,
        ...(filter ? { filter } : {}),
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!res.ok) throw new Error(`notion query failed: ${res.status}`);
    const j = (await res.json()) as { results: NotionPageValue[]; next_cursor: string | null; has_more: boolean };
    out.push(...j.results);
    cursor = j.has_more ? (j.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

function findByOrName(props: Record<string, NotionPropertyValue>, id: string | null): NotionPropertyValue | undefined {
  if (!id) return undefined;
  return Object.values(props).find((p) => p.id === id);
}

export function readTitle(page: NotionPageValue): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  return plain(titleProp?.title) || "Untitled";
}

export function readDate(page: NotionPageValue, datePropertyId: string | null): string | null {
  const p = findByOrName(page.properties, datePropertyId);
  return p?.date?.start ?? null;
}

// Whether a page is "done" given the configured status mapping.
export function readDone(
  page: NotionPageValue,
  cfg: { statusPropertyId: string | null; statusPropType: string | null; doneValue: string | null },
): boolean {
  const p = findByOrName(page.properties, cfg.statusPropertyId);
  if (!p) return false;
  if (p.type === "checkbox") return Boolean(p.checkbox);
  if (p.type === "status") return p.status?.name === cfg.doneValue;
  if (p.type === "select") return p.select?.name === cfg.doneValue;
  return false;
}

// Write the done-state back to Notion. Best-effort; caller swallows failures.
export async function updatePageDone(
  token: string,
  pageId: string,
  cfg: { statusPropertyId: string; statusPropType: string | null; doneValue: string | null },
  done: boolean,
): Promise<void> {
  let value: unknown;
  if (cfg.statusPropType === "checkbox") value = { checkbox: done };
  else if (cfg.statusPropType === "status") value = { status: done && cfg.doneValue ? { name: cfg.doneValue } : null };
  else if (cfg.statusPropType === "select") value = { select: done && cfg.doneValue ? { name: cfg.doneValue } : null };
  else return;

  const res = await fetch(`${API}/pages/${pageId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ properties: { [cfg.statusPropertyId]: value } }),
  });
  if (!res.ok) throw new Error(`notion page update failed: ${res.status} ${await res.text()}`);
}
