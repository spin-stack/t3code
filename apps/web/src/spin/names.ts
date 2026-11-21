// Inside Spinbox an environment is a workspace and its project is Spinbox's, so the client names them
// from what the page tells (window.spinboxEnvironments) rather than after the server's host and the
// checkout's directory, and holds an environment only while the page tells its workspace. The names
// and the list are put in where the catalog and the projects enter the client.
import {
  BearerConnectionTarget,
  type ConnectionCatalogEntry,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import type {
  EnvironmentId,
  OrchestrationProjectShell,
  OrchestrationV2ShellSnapshot,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

declare global {
  interface Window {
    spinboxEnvironments?: unknown;
    spinboxPair?: (workspaceId: string) => Promise<string>;
  }
}

/** A workspace's names, as Spinbox tells them. */
export interface SpinboxNames {
  readonly httpBaseUrl: string;
  /** The environment's label: the workspace's name. */
  readonly label: string;
  /** The title of the project at dir: its Spinbox project's name, else the workspace's. */
  readonly title: string;
  /** Where the agent works: the workspace root of the T3 project made for it. */
  readonly dir: string;
}

const text = (v: unknown): v is string => typeof v === "string" && v !== "";

/** readSpinboxNames is each whole entry of what the page told: another origin's word. */
export function readSpinboxNames(told: unknown): SpinboxNames[] {
  if (!Array.isArray(told)) return [];
  return told.flatMap((e): SpinboxNames[] => {
    if (typeof e !== "object" || e === null) return [];
    const r = e as Record<string, unknown>;
    if (!text(r.httpBaseUrl) || !text(r.label) || !text(r.dir)) return [];
    const title = text(r.project) ? r.project : r.label;
    return [
      {
        httpBaseUrl: r.httpBaseUrl,
        label: r.label,
        title,
        dir: r.dir,
      },
    ];
  });
}

const sameNames = (a: ReadonlyArray<SpinboxNames>, b: ReadonlyArray<SpinboxNames>) =>
  a.length === b.length &&
  a.every((n, i) => {
    const m = b[i];
    return (
      m !== undefined &&
      n.httpBaseUrl === m.httpBaseUrl &&
      n.label === m.label &&
      n.title === m.title &&
      n.dir === m.dir
    );
  });

/** What Spinbox has told, kept as it tells it again; undefined until it tells a list. */
const spinboxNamesAtom = Atom.make((get): ReadonlyArray<SpinboxNames> | undefined => {
  if (typeof window === "undefined") return undefined;
  const read = () =>
    Array.isArray(window.spinboxEnvironments)
      ? readSpinboxNames(window.spinboxEnvironments)
      : undefined;
  const told = () => {
    const next = read();
    const kept = Option.getOrUndefined(get.self<ReadonlyArray<SpinboxNames> | undefined>());
    if (kept === undefined || next === undefined || !sameNames(kept, next)) get.setSelf(next);
  };
  window.addEventListener("spinbox:environments", told);
  get.addFinalizer(() => window.removeEventListener("spinbox:environments", told));
  return read();
}).pipe(Atom.withLabel("spinbox-names"));

/** Whether this client is framed by Spinbox's page, whose shim gives it window.spinboxPair. */
export function spinboxFramed(): boolean {
  return typeof window !== "undefined" && typeof window.spinboxPair === "function";
}

// T3 saves the address it paired at in its own form: a trailing slash the page's has not.
function sameBase(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}

/**
 * The workspace an environment is: the one at the address it was paired at. Not by T3's id, which is
 * kept in the agent's home, and another workspace may mount the home of one deleted.
 */
function namesOf(
  told: ReadonlyArray<SpinboxNames>,
  entry: ConnectionCatalogEntry | undefined,
): SpinboxNames | undefined {
  const profile = entry === undefined ? undefined : Option.getOrUndefined(entry.profile);
  if (profile?._tag !== "BearerConnectionProfile") return undefined;
  return told.find((n) => sameBase(n.httpBaseUrl, profile.httpBaseUrl));
}

const sameEntries = <K, V>(a: ReadonlyMap<K, V>, b: ReadonlyMap<K, V>) =>
  a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
const sameElements = <T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

const UNTOLD: EnvironmentCatalogState = Object.freeze({ isReady: false, entries: new Map() });

/**
 * catalogAtom as Spinbox tells it: each workspace's environment labelled with the workspace's name,
 * none of a workspace it does not tell, and not ready until it has told a list - so one deleted is
 * never drawn nor opened in. spin/environments forgets those left out. Outside Spinbox, catalogAtom.
 */
export function withSpinboxWorkspaces(
  catalogAtom: Atom.Atom<EnvironmentCatalogState>,
  namesAtom: Atom.Atom<ReadonlyArray<SpinboxNames> | undefined> = spinboxNamesAtom,
  framed: boolean = spinboxFramed(),
) {
  const labelled = new WeakMap<ConnectionCatalogEntry, ConnectionCatalogEntry>();
  const label = (entry: ConnectionCatalogEntry, target: BearerConnectionTarget, name: string) => {
    const kept = labelled.get(entry);
    if (kept?.target.label === name) return kept;
    const relabelled = new BearerConnectionTarget({
      environmentId: target.environmentId,
      connectionId: target.connectionId,
      label: name,
    });
    const next = { ...entry, target: relabelled };
    labelled.set(entry, next);
    return next;
  };
  return Atom.make((get): EnvironmentCatalogState => {
    const catalog = get(catalogAtom);
    if (!framed) return catalog;
    const told = get(namesAtom);
    if (told === undefined) return UNTOLD;
    let changed = false;
    const entries = new Map<EnvironmentId, ConnectionCatalogEntry>();
    for (const [environmentId, entry] of catalog.entries) {
      const name = namesOf(told, entry)?.label;
      if (name === undefined) {
        changed = true;
        continue;
      }
      const target = entry.target;
      const next =
        target._tag === "BearerConnectionTarget" && name !== target.label
          ? label(entry, target, name)
          : entry;
      changed ||= next !== entry;
      entries.set(environmentId, next);
    }
    if (!changed) return catalog;
    const kept = Option.getOrUndefined(get.self<EnvironmentCatalogState>());
    if (kept?.isReady === catalog.isReady && sameEntries(kept.entries, entries)) return kept;
    return { isReady: catalog.isReady, entries };
  }).pipe(Atom.withLabel("spinbox-workspaces-environment-catalog"));
}

/** snapshotAtom with the project of each workspace's dir titled as Spinbox names it. */
export function withSpinboxTitles(
  snapshotAtom: (environmentId: EnvironmentId) => Atom.Atom<OrchestrationV2ShellSnapshot | null>,
  catalogAtom: Atom.Atom<EnvironmentCatalogState>,
  namesAtom: Atom.Atom<ReadonlyArray<SpinboxNames> | undefined> = spinboxNamesAtom,
) {
  const titled = new WeakMap<OrchestrationProjectShell, OrchestrationProjectShell>();
  const title = (project: OrchestrationProjectShell, name: string) => {
    const kept = titled.get(project);
    if (kept?.title === name) return kept;
    const next = { ...project, title: name };
    titled.set(project, next);
    return next;
  };
  return Atom.family((environmentId: EnvironmentId) => {
    // The projects list stays the same object while no project changes: what reads it compares so.
    let kept:
      | { readonly from: OrchestrationV2ShellSnapshot; readonly to: OrchestrationV2ShellSnapshot }
      | undefined;
    return Atom.make((get): OrchestrationV2ShellSnapshot | null => {
      const snapshot = get(snapshotAtom(environmentId));
      if (snapshot === null) return null;
      const told = get(namesAtom);
      if (told === undefined) return snapshot;
      const names = namesOf(told, get(catalogAtom).entries.get(environmentId));
      if (names === undefined) return snapshot;
      const projects = snapshot.projects.map((p) =>
        p.workspaceRoot === names.dir && p.title !== names.title ? title(p, names.title) : p,
      );
      if (sameElements(projects, snapshot.projects)) return snapshot;
      if (kept !== undefined && sameElements(kept.to.projects, projects)) {
        if (kept.from === snapshot) return kept.to;
        kept = { from: snapshot, to: { ...snapshot, projects: kept.to.projects } };
      } else {
        kept = { from: snapshot, to: { ...snapshot, projects } };
      }
      return kept.to;
    }).pipe(Atom.withLabel(`spinbox-titled-environment-snapshot:${environmentId}`));
  });
}
