import { Capacitor } from "@capacitor/core";
import { browser } from "$app/environment";

// Voice, AI parsing, and in-app purchases are iOS-only. On the web they are
// disabled entirely. On iOS they additionally require the paid entitlement
// (wired by the StoreKit bridge in #36) — `entitlement.hasPro` starts false on
// web and is set from current StoreKit entitlements on native.
export const isNative = browser && Capacitor.isNativePlatform();

class Entitlement {
  // Set from StoreKit `Transaction.currentEntitlements` on launch and after a
  // purchase/restore. Never true on web.
  hasPro = $state(false);
  // True while we're still checking StoreKit on launch, so the UI can avoid
  // flashing a paywall before entitlements resolve.
  loading = $state(isNative);

  setPro(v: boolean) {
    this.hasPro = v;
    this.loading = false;
  }
}

export const entitlement = new Entitlement();

// Feature gates. Until the StoreKit bridge lands, voice/AI are gated on the
// platform only (free on iOS, off on web). #36 tightens these to also require
// `entitlement.hasPro`.
export const features = {
  // Payments only exist where StoreKit does.
  get payments(): boolean {
    return isNative;
  },
  // Voice capture + the voice agent.
  get voice(): boolean {
    return isNative;
  },
  // AI natural-language parsing of typed tasks.
  get ai(): boolean {
    return isNative;
  },
};
