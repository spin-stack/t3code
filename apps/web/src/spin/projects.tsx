// Spinbox's projects in "New thread in...": picked, Spinbox ensures its workspace
// (window.spinboxEnsure), and this client opens that workspace with a new chat in its checkout.
import { FolderGit2Icon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "../components/CommandPalette.logic";
import { useOpenSpinboxEnvironment } from "./environments";

/** A project of the person's, as Spinbox tells it. */
export interface SpinboxProject {
  readonly id: string;
  readonly name: string;
}

declare global {
  interface Window {
    spinboxProjects?: unknown;
    spinboxEnsure?: (projectId: string, fresh?: boolean) => Promise<unknown>;
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

/**
 * ensuredWorkspace is the workspace the page answered a project picked with: another origin's
 * word, refused when it names none. Its dir is the environment's, which the opening reads.
 */
export function ensuredWorkspace(told: unknown): string {
  const r = typeof told === "object" && told !== null ? (told as Record<string, unknown>) : {};
  if (!text(r.workspaceId)) throw new Error("Spinbox answered no workspace for the project.");
  return r.workspaceId;
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

/**
 * useStartSpinboxThread opens a new thread on a Spinbox project: its workspace ensured, then opened
 * as any workspace is, with a new chat in its checkout. fresh asks for a workspace apart from the
 * person's others of the project.
 */
export function useStartSpinboxThread() {
  const open = useOpenSpinboxEnvironment();
  return async (projectId: string, fresh = false) => {
    if (!window.spinboxEnsure) throw new Error("this client is not framed by Spinbox");
    const workspaceId = ensuredWorkspace(await window.spinboxEnsure(projectId, fresh));
    await open(workspaceId, { to: "new" });
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
