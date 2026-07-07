import { env } from "env";
import { prisma } from "services/prisma";
import type { GoogleAccount } from "generated:prisma";

// Google Calendar OAuth (authorization-code flow) + a thin REST client. This is
// separate from Google *sign-in* (which only verifies an ID token): here we
// hold access/refresh tokens with the calendar.readonly scope.

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";
const CAL_API = "https://www.googleapis.com/calendar/v3";

// openid/email/profile identify the connected account; calendar.readonly pulls
// events. We never write to the calendar.
const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar.readonly"];

export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(): string {
  return `${env.PUBLIC_API_URL}/integrations/google/callback`;
}

/** Consent URL. `state` round-trips our signed linking token. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force refresh-token issuance on re-consent
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_AUTH}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function getUserInfo(accessToken: string): Promise<{ sub: string; email: string }> {
  const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`google userinfo failed: ${res.status}`);
  const j = (await res.json()) as { sub: string; email: string };
  return { sub: j.sub, email: j.email };
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`google token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

// Return a valid access token for an account, refreshing (and persisting) it
// when it's within 60s of expiry.
export async function getValidAccessToken(account: GoogleAccount): Promise<string> {
  if (account.expiresAt.getTime() - Date.now() > 60_000) return account.accessToken;
  if (!account.refreshToken) throw new Error("google account has no refresh token — reconnect required");
  const t = await refreshAccessToken(account.refreshToken);
  const expiresAt = new Date(Date.now() + t.expires_in * 1000);
  await prisma.googleAccount.update({
    where: { id: account.id },
    data: { accessToken: t.access_token, expiresAt, ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}) },
  });
  return t.access_token;
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
}

export async function listCalendars(account: GoogleAccount): Promise<CalendarListEntry[]> {
  const token = await getValidAccessToken(account);
  const res = await fetch(`${CAL_API}/users/me/calendarList?minAccessRole=reader`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`google calendarList failed: ${res.status}`);
  const j = (await res.json()) as { items?: CalendarListEntry[] };
  return j.items ?? [];
}

export interface CalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

// Windowed pull: events from `daysBack` ago to `daysAhead` out, expanded to
// single instances. Simpler and more robust than incremental syncToken; the
// caller reconciles deletions against the returned set.
export async function listEvents(
  account: GoogleAccount,
  calendarId: string,
  { daysBack = 1, daysAhead = 45 }: { daysBack?: number; daysAhead?: number } = {},
): Promise<CalendarEvent[]> {
  const token = await getValidAccessToken(account);
  const now = Date.now();
  const timeMin = new Date(now - daysBack * 86_400_000).toISOString();
  const timeMax = new Date(now + daysAhead * 86_400_000).toISOString();

  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`google events failed: ${res.status}`);
    const j = (await res.json()) as { items?: CalendarEvent[]; nextPageToken?: string };
    out.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}
