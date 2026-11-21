// Spinbox's Agents page frames this client with no workspace open: no server stands behind this
// origin, and every environment is one Spinbox pairs. That client is a hosted one - T3 Code's own
// mode for a client without a primary environment. Framed for a workspace, the client's address
// carries that workspace's credential and the workspace is its primary, as before.

/** What Spinbox names the frame of its Agents page (its dashboard's lib/term/screen.ts frameNames). */
export const AGENTS_FRAME = "spinbox-agents";

/**
 * Whether this client has no primary: framed by Spinbox (the shim set window.spinboxPair) in the
 * frame it names for its Agents page. A name outlives a reload of the frame; the tab's storage is
 * every frame's of this origin, so a workspace's frame before it once made this one a workspace's.
 */
export function spinboxWithoutPrimary(framed: boolean, frameName: string): boolean {
  return framed && frameName === AGENTS_FRAME;
}

/** Read once, as the client loads. */
export const SPINBOX_WITHOUT_PRIMARY =
  typeof window !== "undefined" &&
  spinboxWithoutPrimary(
    typeof (window as { spinboxPair?: unknown }).spinboxPair === "function",
    window.name,
  );
