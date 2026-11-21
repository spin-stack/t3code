// Spinbox puts Claude Code's and Codex's credentials in the agent's home itself, from its own
// dashboard: the client offers no sign-in or account setup of its own for a provider, and where it
// asks for one it sends the person to Spinbox's sign-in (window.spinboxSignIn).
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";

declare global {
  interface Window {
    spinboxSignIn?: (httpBaseUrl: string) => void;
  }
}

export const SHOW_PROVIDER_LOGIN = false;

/** Whether the page framing this client signs its providers in: read once, as the client loads. */
export const SPINBOX_SIGN_IN =
  typeof window !== "undefined" && typeof window.spinboxSignIn === "function";

/**
 * openSpinboxSignIn asks the page for its sign-in to environmentId, named by the address this client
 * paired it at, and is whether it asked. Outside Spinbox, and for an environment not paired through
 * it, T3's own provider settings are the way.
 */
export function openSpinboxSignIn(
  catalog: EnvironmentCatalogState,
  environmentId: EnvironmentId,
): boolean {
  const signIn = typeof window === "undefined" ? undefined : window.spinboxSignIn;
  const entry = catalog.entries.get(environmentId);
  const profile = entry === undefined ? undefined : Option.getOrUndefined(entry.profile);
  if (signIn === undefined || profile?._tag !== "BearerConnectionProfile") return false;
  signIn(profile.httpBaseUrl);
  return true;
}
