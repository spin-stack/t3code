// The agents a Spinbox workspace carries: Claude Code and Codex. T3 Code's other drivers have no
// CLI in the workspace, so the client does not offer them.
const SPIN_PROVIDER_DRIVERS: ReadonlySet<string> = new Set(["claudeAgent", "codex"]);

/** Whether definition is a driver Spinbox offers. */
export function isSpinProvider(definition: { readonly driverKind: string }): boolean {
  return SPIN_PROVIDER_DRIVERS.has(definition.driverKind);
}
