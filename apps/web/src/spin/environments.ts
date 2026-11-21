// The environments are Spinbox's: every workspace of the person's, told by the dashboard framing this
// client (window.spinboxEnvironments, "spinbox:environments"). None is added by hand: a workspace is
// paired when it is opened, through window.spinboxPair, which wakes it and answers the pairing URL.
import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { environmentCatalog } from "../connection/catalog";
import { connectPairing } from "../connection/onboarding";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useStableCallback } from "../hooks/useStableCallback";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentProjects } from "../state/projects";
import { useAtomCommand } from "../state/use-atom-command";
import { waitForAtomValue } from "../state/waitForAtomValue";

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
  /** Where its agent works: the workspace root of the T3 project made for the workspace. */
  readonly dir: string;
}

/** Where opening a workspace lands: one of its chats, a new chat in its project, or where it is. */
type SpinboxLanding =
  | { readonly to: "chat"; readonly environmentId: string; readonly threadId: string }
  | { readonly to: "new" }
  | { readonly to: "here" };

declare global {
  interface Window {
    spinboxEnvironments?: unknown;
    spinboxPair?: (workspaceId: string) => Promise<string>;
    spinboxOpening?: unknown;
    spinboxOpened?: (workspaceId: string, error?: string) => void;
  }
}

const states: ReadonlySet<string> = new Set(["asleep", "waking", "ready", "failed"]);
const text = (v: unknown): v is string => typeof v === "string";

/** readSpinboxEnvironment is one entry of what the page told, whole, or undefined. */
function readSpinboxEnvironment(e: unknown): SpinboxEnvironment | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const r = e as Record<string, unknown>;
  if (
    !text(r.workspaceId) ||
    r.workspaceId === "" ||
    !text(r.environmentId) ||
    !text(r.label) ||
    !text(r.state) ||
    !states.has(r.state) ||
    !text(r.httpBaseUrl) ||
    !text(r.wsBaseUrl) ||
    !text(r.dir) ||
    r.dir === ""
  ) {
    return undefined;
  }
  return {
    workspaceId: r.workspaceId,
    environmentId: r.environmentId,
    label: r.label,
    ...(text(r.project) ? { project: r.project } : {}),
    state: r.state as SpinboxEnvironmentState,
    ...(text(r.why) ? { why: r.why } : {}),
    httpBaseUrl: r.httpBaseUrl,
    wsBaseUrl: r.wsBaseUrl,
    dir: r.dir,
  };
}

/**
 * readSpinboxEnvironments is what the page told, as this client takes it: each entry whole or not
 * at all. The list is another origin's word; one malformed entry is dropped, not the client.
 */
export function readSpinboxEnvironments(told: unknown): SpinboxEnvironment[] {
  if (!Array.isArray(told)) return [];
  return told.flatMap((e) => {
    const environment = readSpinboxEnvironment(e);
    return environment === undefined ? [] : [environment];
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

/** The workspace as Spinbox tells it, waiting a while for a telling that has it: one just made. */
function toldEnvironment(workspaceId: string): Promise<SpinboxEnvironment> {
  const find = () => snapshot().find((e) => e.workspaceId === workspaceId);
  const now = find();
  if (now !== undefined) return Promise.resolve(now);
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("spinbox:environments", heard);
    };
    const heard = () => {
      const told = find();
      if (told === undefined) return;
      done();
      resolve(told);
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error("Spinbox has not told this client of that workspace."));
    }, 30_000);
    window.addEventListener("spinbox:environments", heard);
  });
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

// T3 saves the address it paired at in its own form: a trailing slash the page's has not.
function sameBase(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}

/**
 * savedEnvironmentId is the environment this client saved for a workspace: the one with T3's id
 * where Spinbox knows it, else the one paired at the workspace's address.
 */
export function savedEnvironmentId(
  catalog: EnvironmentCatalogState,
  environment: SpinboxEnvironment,
): EnvironmentId | undefined {
  if (environment.environmentId !== "") {
    const id = environment.environmentId as EnvironmentId;
    return catalog.entries.has(id) ? id : undefined;
  }
  for (const [id, entry] of catalog.entries) {
    const profile = Option.getOrUndefined(entry.profile);
    if (profile?._tag !== "BearerConnectionProfile") continue;
    if (sameBase(profile.httpBaseUrl, environment.httpBaseUrl)) return id;
  }
  return undefined;
}

/**
 * wantsPairing is whether opening this environment pairs it: one this client has not, or one it
 * has whose workspace is not ready. Spinbox wakes a workspace only for a pairing and refuses this
 * client's own reconnects while it does not run; the page wakes one asleep, answers one starting
 * once it runs, and says why one failed.
 */
export function wantsPairing(wanted: SpinboxEnvironment | undefined, saved: boolean): boolean {
  if (wanted === undefined) return false;
  return !saved || wanted.state !== "ready";
}

/**
 * readOpening is what the page asked to open: the workspace, and the chat it named or a new one.
 * undefined where it named no workspace; a landing of undefined where the chat is not an address.
 */
export function readOpening(
  told: unknown,
): { workspaceId: string; landing: SpinboxLanding | undefined } | undefined {
  if (typeof told !== "object" || told === null) return undefined;
  const r = told as Record<string, unknown>;
  if (!text(r.workspaceId) || r.workspaceId === "") return undefined;
  if (r.chat === undefined) return { workspaceId: r.workspaceId, landing: { to: "new" } };
  const chat = text(r.chat) ? /^\/([^/]+)\/([^/]+)$/.exec(r.chat) : null;
  return {
    workspaceId: r.workspaceId,
    landing: chat ? { to: "chat", environmentId: chat[1]!, threadId: chat[2]! } : undefined,
  };
}

interface Opened {
  readonly environmentId: EnvironmentId;
  readonly environment: SpinboxEnvironment;
}

// What opening each workspace waits on - told, saved, paired where it has to be - one at a time
// each, across openers: the layout remounts, and the page may ask again while a pairing is out.
const opening = new Map<string, Promise<Opened>>();

/**
 * createSpinboxOpener opens Spinbox workspaces: each paired where this client has not saved it or
 * it is not ready, then the landing shown, and the page told how it went (window.spinboxOpened).
 */
export function createSpinboxOpener(deps: {
  /** The saved environments, once this client has read them. */
  readonly catalog: () => Promise<EnvironmentCatalogState>;
  /** Pairs as registerPairing does, answering the environment saved. */
  readonly connect: (input: ReturnType<typeof pairingInput>) => Promise<EnvironmentId>;
  readonly land: (opened: Opened, landing: SpinboxLanding) => Promise<void>;
}) {
  const savedOrPaired = async (workspaceId: string): Promise<Opened> => {
    const environment = await toldEnvironment(workspaceId);
    const saved = savedEnvironmentId(await deps.catalog(), environment);
    if (saved !== undefined && !wantsPairing(environment, true)) {
      return { environmentId: saved, environment };
    }
    if (!window.spinboxPair) throw new Error("This client is not framed by Spinbox.");
    const pairingUrl = await window.spinboxPair(workspaceId);
    return {
      environmentId: await deps.connect(pairingInput(environment, pairingUrl)),
      environment,
    };
  };
  return async (workspaceId: string, landing: SpinboxLanding): Promise<void> => {
    let pending = opening.get(workspaceId);
    // The open already under way lands where it was asked, and tells the page.
    if (pending !== undefined && landing.to === "here") return;
    if (pending === undefined) {
      pending = savedOrPaired(workspaceId);
      opening.set(workspaceId, pending);
      const settled = () => opening.delete(workspaceId);
      void pending.then(settled, settled);
    }
    try {
      await deps.land(await pending, landing);
      window.spinboxOpened?.(workspaceId);
    } catch (error) {
      window.spinboxOpened?.(workspaceId, error instanceof Error ? error.message : String(error));
    }
  };
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

/** useOpenSpinboxEnvironment opens a Spinbox workspace at a landing (createSpinboxOpener). */
function useOpenSpinboxEnvironment() {
  const connect = useAtomCommand(connectPairing, { reportFailure: false });
  const router = useRouter();
  const handleNewThread = useNewThreadHandler();
  return createSpinboxOpener({
    catalog: async () => {
      await waitForAtomValue({
        registry: appAtomRegistry,
        atom: environmentCatalog.catalogValueAtom,
        predicate: (catalog) => catalog.isReady,
        timeoutMs: 30_000,
      });
      return appAtomRegistry.get(environmentCatalog.catalogValueAtom);
    },
    connect: async (input) => {
      const paired = await connect(input);
      if (paired._tag === "Failure") throw squashAtomCommandFailure(paired);
      return paired.value;
    },
    land: async ({ environmentId, environment }, landing) => {
      if (landing.to === "chat") {
        await router.navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId: landing.environmentId, threadId: landing.threadId },
        });
      } else if (landing.to === "new") {
        const project = await projectAt(environmentId, environment.dir);
        await handleNewThread(scopeProjectRef(project.environmentId, project.id));
      }
    },
  });
}

const HERE: SpinboxLanding = { to: "here" };

/**
 * SpinboxPairing pairs the environment a chat's address names when wantsPairing says so: a chat of
 * another workspace, opened by its link, is that workspace chosen, and woken. It draws nothing; a
 * pairing refused is left to the address's own "not found".
 */
export function SpinboxPairing({ environmentId }: { environmentId: string | undefined }) {
  const environments = useSpinboxEnvironments();
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const open = useOpenSpinboxEnvironment();
  const wanted = environments.find(
    (e) => e.environmentId !== "" && e.environmentId === environmentId,
  );
  // The workspace and state it last paired for: every telling renders this again, and a workspace
  // that failed is still failed once the page refused its pairing.
  const asked = useRef<string | undefined>(undefined);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a pairing with another workspace's server, started once per state it is told in while this chat's address names it
  useEffect(() => {
    const pair =
      inSpinbox() &&
      catalog.isReady &&
      wanted !== undefined &&
      wantsPairing(wanted, savedEnvironmentId(catalog, wanted) !== undefined)
        ? wanted
        : undefined;
    const ask = pair && `${pair.workspaceId} ${pair.state}`;
    if (ask === asked.current) return;
    asked.current = ask;
    if (pair) void open(pair.workspaceId, HERE);
  });
  return null;
}

/**
 * SpinboxOpen opens what the page asks it to (window.spinboxOpening, "spinbox:open"): a workspace,
 * at a chat of it or a new one. It draws nothing; the page hears how it went (spinboxOpened).
 */
export function SpinboxOpen() {
  const openNow = useOpenSpinboxEnvironment();
  const open = useStableCallback(openNow);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- listens to the page framing this client, outside React, and takes what it asked before this mounted
  useEffect(() => {
    if (!inSpinbox()) return;
    const take = (told: unknown) => {
      window.spinboxOpening = undefined;
      const asked = readOpening(told);
      if (asked === undefined) return;
      if (asked.landing === undefined) {
        window.spinboxOpened?.(asked.workspaceId, "The chat asked for is not a chat's address.");
        return;
      }
      void open(asked.workspaceId, asked.landing);
    };
    const heard = (event: Event) => take((event as CustomEvent<unknown>).detail);
    window.addEventListener("spinbox:open", heard);
    if (window.spinboxOpening !== undefined) take(window.spinboxOpening);
    return () => window.removeEventListener("spinbox:open", heard);
  }, [open]);
  return null;
}
