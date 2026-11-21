// The workspaces of the person's that this client has not paired, as Spinbox lists them, each with
// its chats (window.spinboxEnvironments' threads). Opening a chat there, or a new one, opens the
// workspace (useOpenSpinboxEnvironment), which pairs - and so wakes - it.
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { MoonIcon, SquarePenIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { environmentCatalog } from "../connection/catalog";
import {
  readSpinboxEnvironment,
  savedEnvironmentId,
  type SpinboxEnvironment,
  type SpinboxEnvironmentState,
  useOpenSpinboxEnvironment,
} from "./environments";

/** One chat as Spinbox lists it: what a person sees of it without opening it. */
export interface SpinboxThread {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}

/** A workspace as the list shows it: its environment, and its chats newest first. */
export interface ListedEnvironment {
  readonly environment: SpinboxEnvironment;
  readonly threads: ReadonlyArray<SpinboxThread>;
}

const text = (v: unknown): v is string => typeof v === "string" && v !== "";

/** What a person reads of a workspace's state beside its name. */
const STATE_WORDS: Record<SpinboxEnvironmentState, string> = {
  asleep: "asleep",
  waking: "waking",
  ready: "ready",
  failed: "failed",
};

function readThreads(told: unknown): SpinboxThread[] {
  if (!Array.isArray(told)) return [];
  return told
    .flatMap((t): SpinboxThread[] => {
      if (typeof t !== "object" || t === null) return [];
      const c = t as Record<string, unknown>;
      if (!text(c.id) || typeof c.title !== "string" || !text(c.updatedAt)) return [];
      if (c.archived === true) return [];
      return [{ id: c.id, title: c.title, updatedAt: c.updatedAt }];
    })
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * readListedEnvironments is, from what the page told, each workspace with its chats, the archived
 * ones left out. Another origin's word: a malformed entry or chat is dropped, not the list. A chat's
 * address names T3's id, so a workspace whose agent never ran lists none.
 */
export function readListedEnvironments(told: unknown): ListedEnvironment[] {
  if (!Array.isArray(told)) return [];
  return told.flatMap((e): ListedEnvironment[] => {
    const environment = readSpinboxEnvironment(e);
    if (environment === undefined) return [];
    const threads =
      environment.environmentId === "" ? [] : readThreads((e as Record<string, unknown>).threads);
    return [{ environment, threads }];
  });
}

/** notPaired is each listed workspace this client has not saved, with chats or none. */
export function notPaired(
  listed: ReadonlyArray<ListedEnvironment>,
  catalog: EnvironmentCatalogState,
): ListedEnvironment[] {
  return listed.filter((e) => savedEnvironmentId(catalog, e.environment) === undefined);
}

let readFrom: unknown;
let read: ListedEnvironment[] = [];
function snapshot(): ListedEnvironment[] {
  const told = typeof window === "undefined" ? undefined : window.spinboxEnvironments;
  if (told !== readFrom) {
    readFrom = told;
    read = readListedEnvironments(told);
  }
  return read;
}
function subscribe(changed: () => void): () => void {
  window.addEventListener("spinbox:environments", changed);
  return () => window.removeEventListener("spinbox:environments", changed);
}

/**
 * SpinboxWorkspaces lists the workspaces this client has not paired, each under its name and how
 * it is, with its chats and a new one: with the paired ones' own, every workspace the person has.
 */
export function SpinboxWorkspaces() {
  const listed = useSyncExternalStore(subscribe, snapshot, snapshot);
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const open = useOpenSpinboxEnvironment();
  const shown = catalog.isReady ? notPaired(listed, catalog) : [];
  if (shown.length === 0) return null;
  return (
    <section aria-label="Workspaces" className="px-2 pb-2">
      {shown.map(({ environment: e, threads }) => (
        <div key={e.workspaceId} className="pt-3">
          <div className="flex items-center gap-1.5 px-2.5 pb-1 text-xs text-sidebar-muted-foreground">
            {e.state === "asleep" ? <MoonIcon aria-hidden className="size-3.5 shrink-0" /> : null}
            <h3 className="truncate">{e.label}</h3>
            <span className="shrink-0">
              · {e.project ? `${e.project} · ` : ""}
              {STATE_WORDS[e.state]}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`New chat in ${e.label}`}
                    onClick={() => void open(e.workspaceId, { to: "new" })}
                    className="ml-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                  >
                    <SquarePenIcon aria-hidden className="size-3.5" />
                  </button>
                }
              />
              <TooltipPopup side="top">New chat in {e.label}</TooltipPopup>
            </Tooltip>
          </div>
          {e.why ? (
            <p className="px-2.5 pb-1 text-xs text-sidebar-muted-foreground">{e.why}</p>
          ) : null}
          {e.state === "asleep" ? (
            <p className="px-2.5 pb-1 text-xs text-sidebar-muted-foreground">
              Opening a chat here wakes it.
            </p>
          ) : null}
          <ul>
            {threads.map((t) => (
              <li key={t.id} className="list-none">
                <button
                  type="button"
                  onClick={() => void open(e.workspaceId, { to: "chat", threadId: t.id })}
                  className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                >
                  <span className="truncate">{t.title || "Untitled thread"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
