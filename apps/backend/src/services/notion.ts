import { env } from "env";

// Notion OAuth + REST client (API version 2022-06-28). Access tokens do not
// expire and there is no refresh token. The public API is database-scoped
// (it can't query a specific saved view), so a "source" binds a whole database.

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

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

// Raw /search over a single object type. Returns items directly shared with the
// integration; it does NOT surface databases/pages nested under a shared parent.
async function search(token: string, object: "database" | "page"): Promise<{ id: string; title: string }[]> {
  const out: { id: string; title: string }[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${API}/search`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        filter: { value: object, property: "object" },
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

interface Block {
  id: string;
  type: string;
  has_children: boolean;
  child_page?: { title: string };
  child_database?: { title: string };
}

async function listChildBlocks(token: string, blockId: string): Promise<Block[]> {
  const out: Block[] = [];
  let cursor: string | undefined;
  do {
    const url = `${API}/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers: authHeaders(token) });
    if (!res.ok) break; // block may not be readable; skip rather than fail discovery
    const j = (await res.json()) as { results: Block[]; next_cursor: string | null; has_more: boolean };
    out.push(...j.results);
    cursor = j.has_more ? (j.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

async function queryRows(token: string, databaseId: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${API}/databases/${databaseId}/query`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) break;
    const j = (await res.json()) as { results: { id: string }[]; next_cursor: string | null; has_more: boolean };
    for (const r of j.results) out.push(r.id);
    cursor = j.has_more ? (j.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

// Every database the integration can reach, including those nested under a
// shared page or inside a shared database's rows (which /search omits). We seed
// from /search, then crawl the block/row tree: pages expose child databases and
// subpages as blocks; databases expose rows (pages) to descend into. Bounded by
// a call budget so a huge workspace can't spin forever.
export async function searchDatabases(token: string): Promise<NotionDatabase[]> {
  const found = new Map<string, string>(); // databaseId -> title

  const seedDatabases = await search(token, "database");
  const seedPages = await search(token, "page");
  for (const d of seedDatabases) found.set(d.id, d.title);

  type Node = { kind: "container" | "database"; id: string };
  const queue: Node[] = [
    ...seedDatabases.map((d): Node => ({ kind: "database", id: d.id })),
    ...seedPages.map((p): Node => ({ kind: "container", id: p.id })),
  ];
  const visited = new Set<string>();
  let budget = 400; // cap on block-list / row-query calls

  while (queue.length && budget > 0) {
    const node = queue.shift();
    if (!node || visited.has(`${node.kind}:${node.id}`)) continue;
    visited.add(`${node.kind}:${node.id}`);
    budget--;

    if (node.kind === "database") {
      for (const rowId of await queryRows(token, node.id)) queue.push({ kind: "container", id: rowId });
      continue;
    }

    for (const b of await listChildBlocks(token, node.id)) {
      if (b.type === "child_database") {
        if (!found.has(b.id)) found.set(b.id, b.child_database?.title?.trim() || "Untitled");
        queue.push({ kind: "database", id: b.id }); // rows may hold further nested databases
      } else if (b.type === "child_page" || b.has_children) {
        queue.push({ kind: "container", id: b.id });
      }
    }
  }

  return [...found].map(([id, title]) => ({ id, title }));
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

export async function queryDatabase(token: string, databaseId: string): Promise<NotionPageValue[]> {
  const out: NotionPageValue[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${API}/databases/${databaseId}/query`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
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
