// Spinbox's Agents page frames this client with no workspace open: no server stands behind this
// origin, and every environment is one Spinbox pairs. That client is a hosted one - T3 Code's own
// mode for a client without a primary environment. Framed for a workspace, the client's address
// carries that workspace's credential and the workspace is its primary, as before.
import { getPairingTokenFromUrl } from "@t3tools/shared/remote";

const remembered = "spinbox:primary";

/** What the page's storage is asked: a reload of a workspace's client, its credential spent and
 * gone from the address, is still that workspace's. Storage refused is a client without one. */
interface Memory {
  read(): boolean;
  write(): void;
}

/**
 * spinboxWithoutPrimary is whether this client, as loaded, has no primary: framed by Spinbox (the
 * shim set window.spinboxPair before this ran) with no credential in its address and none earlier
 * in this tab.
 */
export function spinboxWithoutPrimary(framed: boolean, url: URL, memory: Memory): boolean {
  if (!framed) return false;
  if (getPairingTokenFromUrl(url) !== null) {
    memory.write();
    return false;
  }
  return !memory.read();
}

const sessionMemory: Memory = {
  read: () => {
    try {
      return window.sessionStorage.getItem(remembered) === "1";
    } catch {
      return false;
    }
  },
  write: () => {
    try {
      window.sessionStorage.setItem(remembered, "1");
    } catch {
      // Without storage a reload is a client without a primary; Spinbox pairs it again.
    }
  },
};

/** Read once, as the client loads: the address loses its credential once paired. */
export const SPINBOX_WITHOUT_PRIMARY =
  typeof window !== "undefined" &&
  spinboxWithoutPrimary(
    typeof (window as { spinboxPair?: unknown }).spinboxPair === "function",
    new URL(window.location.href),
    sessionMemory,
  );
