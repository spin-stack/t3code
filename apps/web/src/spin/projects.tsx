// Spinbox's projects in "New thread in...": picked, Spinbox ensures its workspace
// (window.spinboxEnsure), this client pairs, and a thread opens in its checkout.
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { FolderGit2Icon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "../components/CommandPalette.logic";
import { connectPairing } from "../connection/onboarding";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { usePrimaryEnvironmentId } from "../state/environments";
import { environmentProjects } from "../state/projects";
import { useAtomCommand } from "../state/use-atom-command";
import { waitForAtomValue } from "../state/waitForAtomValue";

/** A project of the person's, as Spinbox tells it. */
export interface SpinboxProject {
  readonly id: string;
  readonly name: string;
}

/** What Spinbox answers a project picked with. No pairingUrl: this client's own workspace. */
interface Ensured {
  readonly workspaceId: string;
  readonly dir: string;
  readonly pairingUrl?: string;
}

declare global {
  interface Window {
    spinboxProjects?: unknown;
    spinboxEnsure?: (projectId: string, fresh?: boolean) => Promise<Ensured>;
  }
}

const text = (v: unknown): v is string => typeof v === "string" && v !== "";

/** readSpinboxProjects is what the page told, each entry whole or dropped: another origin's word. */
export function readSpinboxProjects(told: unknown): SpinboxProject[] {
  if (!Array.isArray(told)) return [];
  return told.flatMap((p): SpinboxProject[] => {
    if (typeof p !== "object" || p === null) return [];
    const r = p as Record<string, unknown>;
    return text(r.id) && text(r.name) ? [{ id: r.id, name: r.name }] : [];
  });
}

// Parsed once per telling: the shim replaces window.spinboxProjects and then says so.
let readFrom: unknown;
let read: SpinboxProject[] = [];
function snapshot(): SpinboxProject[] {
  const told = typeof window === "undefined" ? undefined : window.spinboxProjects;
  if (told !== readFrom) {
    readFrom = told;
    read = readSpinboxProjects(told);
  }
  return read;
}
function subscribe(changed: () => void): () => void {
  window.addEventListener("spinbox:projects", changed);
  return () => window.removeEventListener("spinbox:projects", changed);
}
export function useSpinboxProjects(): SpinboxProject[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The T3 project at dir in environment, once that environment's shell has it. */
async function projectAt(environmentId: EnvironmentId, dir: string) {
  const find = () =>
    appAtomRegistry
      .get(environmentProjects.projectsAtom)
      .find((p) => p.environmentId === environmentId && p.workspaceRoot === dir);
  // A workspace just woken is paired before its shell has streamed its projects.
  const seen = await waitForAtomValue({
    registry: appAtomRegistry,
    atom: environmentProjects.projectsAtom,
    predicate: () => find() !== undefined,
    timeoutMs: 30_000,
  });
  const project = seen ? find() : undefined;
  if (!project) throw new Error(`The workspace's checkout ${dir} did not appear as a project.`);
  return project;
}

/**
 * useStartSpinboxThread opens a new thread on a Spinbox project: its workspace ensured, paired with
 * where this client has not been, and a draft opened in its checkout. fresh asks for a workspace
 * apart from the person's others of the project.
 */
export function useStartSpinboxThread() {
  const connect = useAtomCommand(connectPairing, { reportFailure: false });
  const primary = usePrimaryEnvironmentId();
  const handleNewThread = useNewThreadHandler();
  return async (projectId: string, fresh = false) => {
    if (!window.spinboxEnsure) throw new Error("this client is not framed by Spinbox");
    const ensured = await window.spinboxEnsure(projectId, fresh);
    let environmentId = primary;
    if (ensured.pairingUrl) {
      const paired = await connect({ pairingUrl: ensured.pairingUrl });
      if (paired._tag === "Failure") throw squashAtomCommandFailure(paired);
      environmentId = paired.value;
    }
    if (environmentId === null) throw new Error("No environment to open the thread in.");
    const project = await projectAt(environmentId, ensured.dir);
    await handleNewThread(scopeProjectRef(project.environmentId, project.id));
  };
}

/** The "New thread in..." rows for Spinbox's projects, each run by start. */
export function buildSpinboxProjectItems(
  projects: ReadonlyArray<SpinboxProject>,
  start: (projectId: string) => Promise<void>,
): CommandPaletteActionItem[] {
  return projects.map((p) => ({
    kind: "action",
    value: `new-thread-in-spinbox:${p.id}`,
    searchTerms: [p.name, "Spinbox"],
    title: p.name,
    description: "Spinbox project",
    icon: <FolderGit2Icon className={ITEM_ICON_CLASS} />,
    run: () => start(p.id),
  }));
}
