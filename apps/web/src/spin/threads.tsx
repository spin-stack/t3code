// Chats of workspaces this client has not paired, as Spinbox lists them (window.spinboxEnvironments'
// threads). Opening one pairs - and so wakes - its workspace (SpinboxPairing).
import type { EnvironmentId } from "@t3tools/contracts";
import { MoonIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useRouter } from "@tanstack/react-router";

import { useEnvironments } from "../state/environments";

/** One chat as Spinbox lists it: what a person sees of it without opening it. */
export interface SpinboxThread {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}

/** The chats of one environment this client has not paired. */
export interface SleepingEnvironment {
  readonly environmentId: string;
  readonly label: string;
  /** How its workspace is, in a word, and why where it is not ready. */
  readonly state: string;
  readonly why?: string;
  readonly threads: ReadonlyArray<SpinboxThread>;
}

const text = (v: unknown): v is string => typeof v === "string" && v !== "";

/** What a person reads of an environment's state beside its name. */
const STATE_WORDS: Record<string, string> = {
  asleep: "Asleep",
  waking: "Waking",
  ready: "Ready",
  failed: "Failed",
};

/**
 * readSleepingThreads is, from what the page told, each environment with T3's id and chats, its
 * archived ones left out and the rest newest first. Another origin's word: a malformed entry or
 * chat is dropped, not the list.
 */
export function readSleepingThreads(told: unknown): SleepingEnvironment[] {
  if (!Array.isArray(told)) return [];
  return told.flatMap((e): SleepingEnvironment[] => {
    if (typeof e !== "object" || e === null) return [];
    const r = e as Record<string, unknown>;
    if (!text(r.environmentId) || !text(r.label) || !Array.isArray(r.threads)) return [];
    const threads = r.threads
      .flatMap((t): SpinboxThread[] => {
        if (typeof t !== "object" || t === null) return [];
        const c = t as Record<string, unknown>;
        if (!text(c.id) || typeof c.title !== "string" || !text(c.updatedAt)) return [];
        if (c.archived === true) return [];
        return [{ id: c.id, title: c.title, updatedAt: c.updatedAt }];
      })
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (threads.length === 0) return [];
    const state = typeof r.state === "string" && STATE_WORDS[r.state] ? r.state : "asleep";
    return [
      {
        environmentId: r.environmentId,
        label: r.label,
        state,
        ...(text(r.why) ? { why: r.why } : {}),
        threads,
      },
    ];
  });
}

let readFrom: unknown;
let read: SleepingEnvironment[] = [];
function snapshot(): SleepingEnvironment[] {
  const told = typeof window === "undefined" ? undefined : window.spinboxEnvironments;
  if (told !== readFrom) {
    readFrom = told;
    read = readSleepingThreads(told);
  }
  return read;
}
function subscribe(changed: () => void): () => void {
  window.addEventListener("spinbox:environments", changed);
  return () => window.removeEventListener("spinbox:environments", changed);
}

/**
 * SpinboxSleepingThreads lists the chats of the environments this client has not paired, under each
 * one's name: with the paired ones' own, every chat the person has.
 */
export function SpinboxSleepingThreads() {
  const told = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { presentationById } = useEnvironments();
  const router = useRouter();
  const sleeping = told.filter((e) => !presentationById.has(e.environmentId as EnvironmentId));
  if (sleeping.length === 0) return null;
  return (
    <section aria-label="Asleep" className="px-2 pb-2">
      {sleeping.map((e) => (
        <div key={e.environmentId} className="pt-3">
          <h3 className="flex items-center gap-1.5 px-2.5 pb-1 text-xs text-sidebar-muted-foreground">
            <MoonIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{e.label}</span>
            <span className="shrink-0">· {STATE_WORDS[e.state]}</span>
          </h3>
          {e.why ? (
            <p className="px-2.5 pb-1 text-xs text-sidebar-muted-foreground">{e.why}</p>
          ) : null}
          <ul>
            {e.threads.map((t) => (
              <li key={t.id} className="list-none">
                <button
                  type="button"
                  onClick={() =>
                    void router.navigate({
                      to: "/$environmentId/$threadId",
                      params: { environmentId: e.environmentId, threadId: t.id },
                    })
                  }
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
