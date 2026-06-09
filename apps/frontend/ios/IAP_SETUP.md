# PureType Pro — IAP setup (#36)

Voice + AI parsing are gated behind **PureType Pro**: Monthly ($4.99) and Yearly
($39.99), each with a **7-day free trial**. Web has no payments/voice/AI.

## Done automatically

- **Products provisioned via the App Store Connect API** (`Provision iOS IAP`
  GitHub Action → `fastlane/iap/provision-iap.mjs`). Created the `PureTypePro`
  subscription group, `app.puretype.pro.monthly` + `app.puretype.pro.yearly`,
  en-US display names, availability in 175 territories, USD base prices, and the
  7-day free-trial intro offers. The job is idempotent — re-run it any time.
- **App code**: StoreKit 2 bridge (`src/lib/storekit.ts`), entitlement store
  (`src/lib/capabilities.svelte.ts`), the paywall (`Paywall.svelte`), the
  Upgrade/Pro entry in Settings, and the native plugin source
  (`App/App/StoreKitPlugin.swift`).

## Manual steps (need Xcode / a device — can't be done via API)

1. **Add `StoreKitPlugin.swift` to the `App` target** in Xcode (it's in the
   folder but must be added to target membership), and add the **In-App
   Purchase** capability to the App target.
2. In App Store Connect → each subscription: **confirm the price/trial** (the
   API sets them, but double-check) and **upload a review screenshot** (Apple
   has no API for this), then **submit the subscription for review** — it can
   ride along with the next app version.
3. **Sandbox test**: create a Sandbox Apple ID (Users and Access → Sandbox
   Testers), run a TestFlight/dev build on a device, open Settings → Upgrade to
   Pro, and complete a purchase + Restore.

## Flip the gate ON (after the device test passes)

Until verified, voice/AI stay **free on iOS** so nothing breaks. To require Pro,
change `features.voice` / `features.ai` in `src/lib/capabilities.svelte.ts` to:

```ts
get voice() { return isNative && entitlement.hasPro; }
get ai()    { return isNative && entitlement.hasPro; }
```

and have the locked voice button / first AI use open `Paywall.svelte`. Call
`refreshEntitlement()` on app launch (already wired in Settings; add to the home
route too) so `entitlement.hasPro` is populated from StoreKit before gating.

> Backend note: voice/parse endpoints are currently gated client-side only. For
> server-side enforcement, verify the StoreKit transaction (JWS) on the backend
> before allowing `/voice/transcribe` and `/parse`.
