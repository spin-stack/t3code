// What Spinbox hides of T3 Code's web client: the pages and entry points of features a Spinbox
// workspace gives some other way, or does not offer. One list, so each upstream file this branch
// touches only imports it.

/** Settings pages Spinbox hides. */
export const HIDDEN_SETTINGS_PATHS: ReadonlySet<string> = new Set([
  "/settings/appearance",
  "/settings/snap-shot",
  "/settings/browser",
  "/settings/devices",
  "/settings/scheduled-tasks",
  "/settings/source-control",
  "/settings/connections",
  "/settings/access",
  "/settings/maintenance",
  "/settings/labs",
]);

/** groups without the hidden pages, and without a group left empty by them. */
export function visibleNavGroups<
  G extends { readonly heading: string | null; readonly paths: ReadonlyArray<string> },
>(groups: ReadonlyArray<G>): ReadonlyArray<G> {
  return groups
    .map((group) => ({ ...group, paths: group.paths.filter((p) => !HIDDEN_SETTINGS_PATHS.has(p)) }))
    .filter((group) => group.paths.length > 0);
}

/** Pages Spinbox hides besides settings: a link to one lands on the app's start instead. */
const HIDDEN_PATHS: ReadonlySet<string> = new Set([
  "/pull-requests",
  "/usage",
  "/connect",
  "/connect-agent",
  "/guest",
]);

/** Whether pathname is a page Spinbox hides, or a page under one. */
export function isHiddenPath(pathname: string): boolean {
  return [...HIDDEN_PATHS, ...HIDDEN_SETTINGS_PATHS].some(
    (hidden) => pathname === hidden || pathname.startsWith(`${hidden}/`),
  );
}

/** items without the ones that lead to a hidden page. */
export function visibleSearchItems<I extends { readonly to: string }>(
  items: ReadonlyArray<I>,
): ReadonlyArray<I> {
  return items.filter((item) => !isHiddenPath(item.to));
}

/** Command palette actions Spinbox hides: they lead to hidden pages or features. */
const HIDDEN_PALETTE_ACTIONS: ReadonlySet<string> = new Set([
  "action:pull-requests",
  "action:open-thread-pull-requests",
  "action:link-pull-request",
  "action:usage",
  "action:share-thread-with-guest",
  "action:add-project:connect-environment",
  "action:add-project:wsl-folder",
  "action:change-theme",
  "action:change-appearance",
  "action:theme-editor",
  "action:triage",
]);

/** items without the hidden actions. */
export function visiblePaletteActions<I extends { readonly value: string }>(
  items: ReadonlyArray<I>,
): Array<I> {
  return items.filter((item) => !HIDDEN_PALETTE_ACTIONS.has(item.value));
}

/** T3 Code's own update notices and controls: Spinbox pins the server and the agents' CLIs. */
export const SHOW_UPDATE_NOTICES = false;
