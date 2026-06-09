import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { api } from "$lib/api/client";
import { ls } from "$lib/storage";

const AVATAR_KEY = "avatarUrl";

export async function initSocialLogin(): Promise<void> {
  const googleWeb = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
  const googleIOS = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;
  const appleServicesId = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;
  if (!googleWeb && !appleServicesId) return;
  try {
    await SocialLogin.initialize({
      ...(googleWeb
        ? {
            google: {
              webClientId: googleWeb,
              ...(googleIOS ? { iOSClientId: googleIOS } : {}),
              iOSServerClientId: googleWeb,
              mode: "online",
            },
          }
        : {}),
      ...(appleServicesId
        ? {
            apple: {
              clientId: appleServicesId,
              ...(Capacitor.isNativePlatform()
                ? {}
                : { redirectUrl: import.meta.env.VITE_APPLE_REDIRECT_URL as string }),
            },
          }
        : {}),
    });
  } catch (e) {
    console.error("SocialLogin.initialize failed", e);
  }
}

export async function signInWithGoogle() {
  await SocialLogin.logout({ provider: "google" }).catch(() => {});
  const result = await SocialLogin.login({ provider: "google", options: { scopes: ["profile", "email"] } });
  const response = result.result;
  if (response.responseType !== "online") throw new Error("Expected online login response");
  if (!response.idToken) throw new Error("No ID token returned from Google");
  // Stash the Google profile photo locally for the account avatar (#40).
  const imageUrl = (response.profile as { imageUrl?: string } | undefined)?.imageUrl;
  if (imageUrl) await ls.set(AVATAR_KEY, imageUrl);
  else await ls.remove(AVATAR_KEY);
  return api.auth.google.$post({ idToken: response.idToken });
}

export async function signInWithApple() {
  await SocialLogin.logout({ provider: "apple" }).catch(() => {});
  const result = await SocialLogin.login({ provider: "apple", options: { scopes: ["email", "name"] } });
  const response = result.result as { idToken?: string; givenName?: string; familyName?: string };
  if (!response.idToken) throw new Error("No ID token returned from Apple");
  const name = [response.givenName, response.familyName].filter(Boolean).join(" ") || undefined;
  return api.auth.apple.$post({ idToken: response.idToken, name });
}

export async function clearSocialSessions() {
  await ls.remove(AVATAR_KEY);
  await SocialLogin.logout({ provider: "google" }).catch(() => {});
  await SocialLogin.logout({ provider: "apple" }).catch(() => {});
}

export function isUserCancellation(e: unknown): boolean {
  const message = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return (
    message.includes("cancel") || message.includes("closed") || message.includes("1001") || message.includes("12501")
  );
}
