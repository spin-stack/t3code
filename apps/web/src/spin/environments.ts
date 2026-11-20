// The environments are Spinbox's: every workspace of the person's, told by the dashboard framing this
// client (window.spinboxEnvironments, "spinbox:environments"). None is added by hand; a workspace is
// paired when first asked for, through window.spinboxPair, which wakes it and answers the pairing URL.
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useSyncExternalStore } from "react";

import { connectPairing } from "../connection/onboarding";
import { useEnvironments } from "../state/environments";
import { useAtomCommand } from "../state/use-atom-command";

export type SpinboxEnvironmentState = "asleep" | "waking" | "ready" | "failed";

/** One environment as Spinbox tells it. */
export interface SpinboxEnvironment {
  /** The workspace it is: what its base URLs route by, and what a pairing names. */
  readonly workspaceId: string;
  /** T3's own id for it, once its server has said it; empty before. */
  readonly environmentId: string;
  readonly label: string;
  readonly project?: string;
  readonly state: SpinboxEnvironmentState;
  readonly why?: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

declare global {
  interface Window {
    spinboxEnvironments?: unknown;
    spinboxPair?: (workspaceId: string) => Promise<string>;
  }
}

const states: ReadonlySet<string> = new Set(["asleep", "waking", "ready", "failed"]);
const text = (v: unknown): v is string => typeof v === "string";

/**
 * readSpinboxEnvironments is what the page told, as this client takes it: each entry whole or not
 * at all. The list is another origin's word; one malformed entry is dropped, not the client.
 */
export function readSpinboxEnvironments(told: unknown): SpinboxEnvironment[] {
  if (!Array.isArray(told)) return [];
  return told.flatMap((e): SpinboxEnvironment[] => {
    if (typeof e !== "object" || e === null) return [];
    const r = e as Record<string, unknown>;
    if (
      !text(r.workspaceId) ||
      r.workspaceId === "" ||
      !text(r.environmentId) ||
      !text(r.label) ||
      !text(r.state) ||
      !states.has(r.state) ||
      !text(r.httpBaseUrl) ||
      !text(r.wsBaseUrl)
    ) {
      return [];
    }
    return [
      {
        workspaceId: r.workspaceId,
        environmentId: r.environmentId,
        label: r.label,
        ...(text(r.project) ? { project: r.project } : {}),
        state: r.state as SpinboxEnvironmentState,
        ...(text(r.why) ? { why: r.why } : {}),
        httpBaseUrl: r.httpBaseUrl,
        wsBaseUrl: r.wsBaseUrl,
      },
    ];
  });
}

/** Whether this client is framed by Spinbox's dashboard, which pairs environments for it. */
function inSpinbox(): boolean {
  return typeof window !== "undefined" && typeof window.spinboxPair === "function";
}

/** The environments Spinbox has told, kept current as it tells them again. */
// What the page last told, read once per telling: the shim replaces window.spinboxEnvironments and
// then says so, so the parse is kept until the list it was made from changes.
let readFrom: unknown;
let read: SpinboxEnvironment[] = [];
function snapshot(): SpinboxEnvironment[] {
  const told = typeof window === "undefined" ? undefined : window.spinboxEnvironments;
  if (told !== readFrom) {
    readFrom = told;
    read = readSpinboxEnvironments(told);
  }
  return read;
}
function subscribe(changed: () => void): () => void {
  window.addEventListener("spinbox:environments", changed);
  return () => window.removeEventListener("spinbox:environments", changed);
}
function useSpinboxEnvironments(): SpinboxEnvironment[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * usePairSpinboxEnvironment pairs this client with a Spinbox workspace: the page opens its agent -
 * waking it where it sleeps - and answers with the URL to pair at, which registerPairing takes as
 * any pairing link. Its result is the pairing's, as the connections page's would be.
 */
function usePairSpinboxEnvironment() {
  const connect = useAtomCommand(connectPairing, { reportFailure: false });
  return async (environment: SpinboxEnvironment) => {
    if (!window.spinboxPair) throw new Error("this client is not framed by Spinbox");
    const pairingUrl = await window.spinboxPair(environment.workspaceId);
    return connect(pairingInput(environment, pairingUrl));
  };
}

/** What registerPairing is asked for an environment Spinbox answered with pairingUrl for. */
export function pairingInput(environment: SpinboxEnvironment, pairingUrl: string) {
  return {
    pairingUrl,
    ...(environment.environmentId
      ? { expectedEnvironmentId: environment.environmentId as EnvironmentId }
      : {}),
  };
}

// The workspaces a pairing is out for: one at a time each, across a layout that remounts.
const pairing = new Set<string>();

/**
 * wantsPairing is whether a chat's address, naming this environment, pairs it: one this client has
 * not, or one it has whose workspace sleeps. Spinbox wakes a workspace for a pairing and for nothing
 * else - this client reconnecting to what it saved, on every load and focus, would wake each one it
 * ever opened - so opening a sleeping one's chat is what pairs it again.
 */
export function wantsPairing(wanted: SpinboxEnvironment | undefined, saved: boolean): boolean {
  if (wanted === undefined) return false;
  return !saved || wanted.state === "asleep";
}

/**
 * SpinboxPairing pairs the environment a chat's address names when wantsPairing says so: a chat of
 * another workspace, opened by its link, is that workspace chosen, and woken. It draws nothing; a
 * pairing refused is left to the address's own "not found".
 */
export function SpinboxPairing({ environmentId }: { environmentId: string | undefined }) {
  const environments = useSpinboxEnvironments();
  const { isReady, presentationById } = useEnvironments();
  const pair = usePairSpinboxEnvironment();
  const wanted = environments.find(
    (e) => e.environmentId !== "" && e.environmentId === environmentId,
  );
  const saved = environmentId !== undefined && presentationById.has(environmentId as EnvironmentId);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a pairing with another workspace's server, started once while this chat's address names it
  useEffect(() => {
    if (!inSpinbox() || !isReady || !wanted || !wantsPairing(wanted, saved)) return;
    if (pairing.has(wanted.workspaceId)) return;
    pairing.add(wanted.workspaceId);
    void pair(wanted).finally(() => pairing.delete(wanted.workspaceId));
  });
  return null;
}
