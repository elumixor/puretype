#!/usr/bin/env node
// Provision PureType Pro auto-renewable subscriptions via the App Store Connect
// API. Idempotent: safe to re-run — it looks up existing resources before
// creating. Creates a subscription group, monthly + yearly subscriptions with
// localized display names, a USD base price, and a 7-day free-trial intro offer.
//
// Auth: reads the ASC API key from env (same secrets as the TestFlight job):
//   APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_API_KEY_ISSUER_ID,
//   APP_STORE_CONNECT_API_KEY_CONTENT (the .p8 contents).
//
// Pricing/review-screenshot finalization + submitting the subscription for
// review still happen in App Store Connect — Apple has no API for the review
// screenshot. This gets the products created and priced so the app can fetch them.
import crypto from "node:crypto";

const BUNDLE_ID = "app.puretype";
const GROUP_REF = "PureTypePro";
const TARGET = {
  monthly: { productId: "app.puretype.pro.monthly", name: "PureType Pro (Monthly)", period: "ONE_MONTH", usd: "4.99" },
  yearly: { productId: "app.puretype.pro.yearly", name: "PureType Pro (Yearly)", period: "ONE_YEAR", usd: "39.99" },
};
const TRIAL = { offerMode: "FREE_TRIAL", duration: "ONE_WEEK", numberOfPeriods: 1 };

const KEY_ID = req("APP_STORE_CONNECT_API_KEY_ID");
const ISSUER_ID = req("APP_STORE_CONNECT_API_KEY_ISSUER_ID");
const KEY_CONTENT = req("APP_STORE_CONNECT_API_KEY_CONTENT");
const BASE = "https://api.appstoreconnect.apple.com";

function req(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env ${name}`);
    process.exit(1);
  }
  return v;
}

// ── ES256 JWT (no deps) ───────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function makeToken() {
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const der = crypto.sign("SHA256", Buffer.from(signingInput), {
    key: KEY_CONTENT,
    dsaEncoding: "ieee-p1363", // raw r||s, which JOSE expects
  });
  return `${signingInput}.${b64url(der)}`;
}

let token = makeToken();
async function api(method, path, body) {
  const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json.errors?.map((e) => `${e.title}: ${e.detail}`).join("; ") || text;
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
  }
  return json;
}

// ── Provisioning steps ────────────────────────────────────────────────
async function getApp() {
  const r = await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
  if (!r.data?.length) throw new Error(`No app found for bundleId ${BUNDLE_ID}`);
  console.log(`App: ${r.data[0].attributes.name} (${r.data[0].id})`);
  return r.data[0].id;
}

async function getOrCreateGroup(appId) {
  const existing = await api("GET", `/v1/apps/${appId}/subscriptionGroups?limit=50`);
  const found = existing.data?.find((g) => g.attributes.referenceName === GROUP_REF);
  if (found) {
    console.log(`Subscription group exists: ${found.id}`);
    return found.id;
  }
  const created = await api("POST", "/v1/subscriptionGroups", {
    data: {
      type: "subscriptionGroups",
      attributes: { referenceName: GROUP_REF },
      relationships: { app: { data: { type: "apps", id: appId } } },
    },
  });
  console.log(`Created subscription group: ${created.data.id}`);
  return created.data.id;
}

async function getOrCreateSubscription(groupId, t) {
  const list = await api("GET", `/v1/subscriptionGroups/${groupId}/subscriptions?limit=200`);
  const found = list.data?.find((s) => s.attributes.productId === t.productId);
  if (found) {
    console.log(`Subscription exists: ${t.productId} (${found.id})`);
    return found.id;
  }
  const created = await api("POST", "/v1/subscriptions", {
    data: {
      type: "subscriptions",
      attributes: { name: t.name, productId: t.productId, subscriptionPeriod: t.period, familySharable: false },
      relationships: { group: { data: { type: "subscriptionGroups", id: groupId } } },
    },
  });
  console.log(`Created subscription: ${t.productId} (${created.data.id})`);
  return created.data.id;
}

async function ensureLocalization(subId, t) {
  const locs = await api("GET", `/v1/subscriptions/${subId}/subscriptionLocalizations?limit=50`);
  if (locs.data?.some((l) => l.attributes.locale === "en-US")) {
    console.log(`  localization en-US exists`);
    return;
  }
  await api("POST", "/v1/subscriptionLocalizations", {
    data: {
      type: "subscriptionLocalizations",
      attributes: { name: t.name, locale: "en-US", description: "Unlocks voice capture and AI task parsing." },
      relationships: { subscription: { data: { type: "subscriptions", id: subId } } },
    },
  });
  console.log(`  created localization en-US`);
}

async function ensurePrice(subId, t) {
  const prices = await api("GET", `/v1/subscriptions/${subId}/prices?limit=50`);
  if (prices.data?.length) {
    console.log(`  price already set`);
    return;
  }
  // Find the USA price point closest to the target USD price.
  let points = [];
  let url = `/v1/subscriptions/${subId}/pricePoints?filter[territory]=USA&limit=200`;
  while (url) {
    const page = await api("GET", url);
    points = points.concat(page.data ?? []);
    url = page.links?.next ?? null;
  }
  if (!points.length) throw new Error(`No USA price points for ${t.productId}`);
  const target = parseFloat(t.usd);
  points.sort(
    (a, b) =>
      Math.abs(parseFloat(a.attributes.customerPrice) - target) -
      Math.abs(parseFloat(b.attributes.customerPrice) - target),
  );
  const pp = points[0];
  console.log(`  nearest USA price point: $${pp.attributes.customerPrice} (${pp.id})`);
  // Apple rejects a null startDate / explicit preserveCurrentPrice on the first
  // price for some apps — omit attributes entirely (price effective immediately).
  await api("POST", "/v1/subscriptionPrices", {
    data: {
      type: "subscriptionPrices",
      relationships: {
        subscription: { data: { type: "subscriptions", id: subId } },
        subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: pp.id } },
      },
    },
  });
  console.log(`  set base price`);
}

async function ensureTrial(subId, t) {
  const offers = await api("GET", `/v1/subscriptions/${subId}/introductoryOffers?limit=50`);
  if (offers.data?.length) {
    console.log(`  intro offer exists`);
    return;
  }
  // A FREE_TRIAL intro offer needs a territory relationship (it applies across
  // all territories, USA as the anchor) and no price point (it's free).
  await api("POST", "/v1/subscriptionIntroductoryOffers", {
    data: {
      type: "subscriptionIntroductoryOffers",
      attributes: {
        duration: TRIAL.duration,
        offerMode: TRIAL.offerMode,
        numberOfPeriods: TRIAL.numberOfPeriods,
      },
      relationships: {
        subscription: { data: { type: "subscriptions", id: subId } },
        territory: { data: { type: "territories", id: "USA" } },
      },
    },
  });
  console.log(`  created 7-day free trial`);
}

async function main() {
  const appId = await getApp();
  const groupId = await getOrCreateGroup(appId);
  for (const key of ["monthly", "yearly"]) {
    const t = TARGET[key];
    console.log(`\n• ${key}: ${t.productId}`);
    const subId = await getOrCreateSubscription(groupId, t);
    await ensureLocalization(subId, t);
    // Pricing + trial are non-fatal: Apple's pricing endpoint is flaky and can
    // be finished in the ASC UI in seconds. Don't let it block creating both
    // products + localizations in one run.
    await ensurePrice(subId, t).catch((e) => console.warn(`  ⚠ price not set (do it in ASC): ${e.message}`));
    await ensureTrial(subId, t).catch((e) => console.warn(`  ⚠ trial not set (do it in ASC): ${e.message}`));
  }
  console.log("\n✓ Products + localizations created. Confirm price/trial + add a review screenshot, then submit in App Store Connect.");
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
