import { Capacitor, registerPlugin } from "@capacitor/core";
import { entitlement, isNative } from "$lib/capabilities.svelte";

// Product ids must match the ones provisioned in App Store Connect.
export const PRODUCTS = {
  monthly: "app.puretype.pro.monthly",
  yearly: "app.puretype.pro.yearly",
} as const;

export type StoreProduct = {
  id: string;
  displayName: string;
  displayPrice: string;
  period: string; // "month" | "year"
  hasIntroOffer: boolean;
};

// Bridge to the native StoreKit 2 plugin (ios/App/App/StoreKitPlugin.swift).
// Absent on web and on iOS builds where the plugin hasn't been added to the
// Xcode target yet — every call no-ops and entitlement stays false.
interface StoreKitBridge {
  getProducts(opts: { ids: string[] }): Promise<{ products: StoreProduct[] }>;
  purchase(opts: { id: string }): Promise<{ entitled: boolean }>;
  restore(): Promise<{ entitled: boolean }>;
  currentEntitlements(): Promise<{ entitled: boolean }>;
}

const plugin =
  isNative && Capacitor.isPluginAvailable("StoreKit") ? registerPlugin<StoreKitBridge>("StoreKit") : null;

// Whether real purchases are possible (native + plugin compiled in). The
// paywall / upgrade entry points only show when this is true.
export const storeAvailable = !!plugin;

export async function refreshEntitlement(): Promise<void> {
  if (!plugin) {
    entitlement.setPro(false);
    return;
  }
  try {
    const r = await plugin.currentEntitlements();
    entitlement.setPro(r.entitled);
  } catch {
    entitlement.setPro(false);
  }
}

export async function getProducts(): Promise<StoreProduct[]> {
  if (!plugin) return [];
  try {
    return (await plugin.getProducts({ ids: Object.values(PRODUCTS) })).products;
  } catch {
    return [];
  }
}

export async function purchase(id: string): Promise<boolean> {
  if (!plugin) return false;
  const r = await plugin.purchase({ id });
  if (r.entitled) entitlement.setPro(true);
  return r.entitled;
}

export async function restore(): Promise<boolean> {
  if (!plugin) return false;
  const r = await plugin.restore();
  entitlement.setPro(r.entitled);
  return r.entitled;
}
