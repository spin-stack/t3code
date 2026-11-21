// Spinbox frames this client on its Agents page, one client for all of the person's workspaces: no
// server stands behind this origin, and every environment is a workspace Spinbox pairs. That client
// is a hosted one, T3 Code's own mode for a client without a primary environment.

/** Whether Spinbox frames this client (its shim set window.spinboxPair): read once, as it loads. */
export const SPINBOX_WITHOUT_PRIMARY =
  typeof window !== "undefined" &&
  typeof (window as { spinboxPair?: unknown }).spinboxPair === "function";
