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
  return (rt ?? []).map((r) => r.plain_text ?? "").join("").trim();
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

// List a database's views by name. The list endpoint returns only id
// references, so we fetch each view to get its name (databases have a handful
// of views, so the fan-out is cheap). Dashboard views have no data source /
// filterable rows, so they're excluded.
export async function listViews(token: string, databaseId: string): Promise<NotionView[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ database_id: databaseId, page_size: "100" });
    if (cursor) qs.set("start_cursor", cursor);
    const res = await fetch(`${API}/views?${qs.toString()}`, { headers: viewsHeaders(token) });
    if (!res.ok) throw new Error(`notion list views failed: ${res.status}`);
    const j = (await res.json()) as { results: { id: string }[]; next_cursor: string | null; has_more: boolean };
    ids.push(...j.results.map((r) => r.id));
    cursor = j.has_more ? (j.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const views = await Promise.all(ids.map((id) => getView(token, id)));
  return views.filter((v): v is NonNullable<typeof v> => v !== null && v.type !== "dashboard").map((v) => ({ id: v.id, name: v.name }));
}

interface ViewObject {
  id: string;
  name: string;
  type: string;
  filter?: unknown | null;
}

async function getView(token: string, viewId: string): Promise<ViewObject | null> {
  const res = await fetch(`${API}/views/${viewId}`, { headers: viewsHeaders(token) });
  if (!res.ok) return null;
  return (await res.json()) as ViewObject;
}

// The saved filter of a view, in the shape queryDatabase accepts, or undefined
// (view has no filter, or we couldn't read it — sync all rows in that case).
export async function getViewFilter(token: string, viewId: string): Promise<unknown | undefined> {
  const view = await getView(token, viewId);
  return view?.filter ?? undefined;
}

export async function queryDatabase(
  token: string,
  databaseId: string,
  filter?: unknown,
): Promise<NotionPageValue[]> {
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
