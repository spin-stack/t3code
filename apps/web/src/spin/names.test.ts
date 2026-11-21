import {
  BearerConnectionProfile,
  BearerConnectionTarget,
  type ConnectionCatalogEntry,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import {
  EnvironmentId,
  type OrchestrationProjectShell,
  type OrchestrationV2ShellSnapshot,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScratchProjectActions } from "../hooks/useScratchProject";
import {
  readSpinboxNames,
  type SpinboxNames,
  withSpinboxTitles,
  withSpinboxWorkspaces,
} from "./names";

const known = EnvironmentId.make("environment-known");
const fresh = EnvironmentId.make("environment-fresh");
const laptop = EnvironmentId.make("environment-laptop");

function paired(environmentId: EnvironmentId, httpBaseUrl: string): ConnectionCatalogEntry {
  const connectionId = `bearer:${environmentId}`;
  return {
    target: new BearerConnectionTarget({ environmentId, label: "localhost", connectionId }),
    profile: Option.some(
      new BearerConnectionProfile({
        connectionId,
        environmentId,
        label: "localhost",
        httpBaseUrl,
        wsBaseUrl: httpBaseUrl.replace(/^http/, "ws"),
      }),
    ),
    enabled: true,
  };
}

const catalogOf = (...entries: Array<[EnvironmentId, ConnectionCatalogEntry]>) =>
  ({ isReady: true, entries: new Map(entries) }) satisfies EnvironmentCatalogState;

const told = {
  workspaceId: "w1",
  environmentId: "",
  label: "swift-fox",
  state: "ready",
  httpBaseUrl: "https://w1.agents.spin.example",
  wsBaseUrl: "wss://w1.agents.spin.example",
  dir: "/workspace",
};

// What the page tells is another origin's word: what names a workspace whole is taken.
describe("the names Spinbox tells", () => {
  it("titles a workspace's project after its Spinbox project, else after the workspace", () => {
    expect(
      readSpinboxNames([
        { ...told, project: "qboot", dir: "/workspace/qboot" },
        { ...told, workspaceId: "w2", label: "calm-otter" },
      ]).map((n) => [n.label, n.title, n.dir]),
    ).toEqual([
      ["swift-fox", "qboot", "/workspace/qboot"],
      ["calm-otter", "calm-otter", "/workspace"],
    ]);
  });

  it.each([
    ["no label", { ...told, label: "" }],
    ["no directory", { ...told, dir: undefined }],
    ["no address", { ...told, httpBaseUrl: undefined }],
    ["not an object", "swift-fox"],
  ])("drops an entry with %s", (_, entry) => {
    expect(readSpinboxNames([entry])).toEqual([]);
  });
});

function labelled(
  catalog: EnvironmentCatalogState,
  names: ReadonlyArray<SpinboxNames> | undefined,
  framed = true,
) {
  const registry = AtomRegistry.make();
  const catalogAtom = Atom.make(catalog);
  const namesAtom = Atom.make(names);
  const atom = withSpinboxWorkspaces(catalogAtom, namesAtom, framed);
  return { registry, catalogAtom, namesAtom, read: () => registry.get(atom) };
}
const labels = (catalog: EnvironmentCatalogState) =>
  [...catalog.entries].map(([id, entry]) => [id, entry.target.label]);
const calmOtter = {
  ...told,
  workspaceId: "w2",
  label: "calm-otter",
  httpBaseUrl: "https://w2.agents.spin.example",
};

// Inside Spinbox the environment is the workspace: it reads as the workspace's name wherever the
// client reads an environment's label, never as the server's "localhost".
describe("an environment's label inside Spinbox", () => {
  it("is the name of the workspace at the address it was paired at", () => {
    const { read, registry } = labelled(
      catalogOf(
        [known, paired(known, "https://w2.agents.spin.example/")],
        [fresh, paired(fresh, "https://w1.agents.spin.example/")],
      ),
      readSpinboxNames([told, calmOtter]),
    );
    expect(labels(read())).toEqual([
      [known, "calm-otter"],
      [fresh, "swift-fox"],
    ]);
    registry.dispose();
  });

  it("is the server's own outside Spinbox", () => {
    const catalog = catalogOf([fresh, paired(fresh, "https://w1.agents.spin.example/")]);
    const { read, registry } = labelled(catalog, undefined, false);
    expect(read()).toBe(catalog);
    registry.dispose();
  });

  it("leaves the catalog and its entries as they were while nothing told changes", () => {
    const catalog = catalogOf(
      [fresh, paired(fresh, "https://w1.agents.spin.example/")],
      [known, paired(known, "https://w2.agents.spin.example/")],
    );
    const { read, registry, namesAtom, catalogAtom } = labelled(
      catalog,
      readSpinboxNames([told, calmOtter]),
    );
    const first = read();
    registry.set(namesAtom, readSpinboxNames([{ ...told, threads: [] }, calmOtter]));
    expect(read()).toBe(first);
    registry.set(catalogAtom, { ...catalog });
    expect(read()).toBe(first);
    registry.dispose();
  });
});

// Inside Spinbox the environments are the workspaces the page tells: one saved for a workspace since
// deleted, or no longer the person's, is neither drawn nor opened in while it waits to be forgotten.
describe("the environments the client reads inside Spinbox", () => {
  const catalog = catalogOf(
    [fresh, paired(fresh, "https://w1.agents.spin.example/")],
    [known, paired(known, "https://w2.agents.spin.example/")],
    [laptop, paired(laptop, "https://laptop.example/")],
  );

  it("are those at a told workspace's address, whatever id its server says", () => {
    const { read, registry } = labelled(
      catalog,
      readSpinboxNames([
        { ...told, environmentId: known },
        { ...calmOtter, httpBaseUrl: "https://w3.agents.spin.example" },
      ]),
    );
    expect(read().isReady).toBe(true);
    expect(labels(read())).toEqual([[fresh, "swift-fox"]]);
    registry.dispose();
  });

  it("are none once the page tells the person has none", () => {
    const { read, registry } = labelled(catalog, []);
    expect(read()).toEqual({ isReady: true, entries: new Map() });
    registry.dispose();
  });

  it("are not read until the page has told its list", () => {
    const { read, registry, namesAtom } = labelled(catalog, undefined);
    expect(read()).toEqual({ isReady: false, entries: new Map() });
    registry.set(namesAtom, readSpinboxNames([told]));
    expect(labels(read())).toEqual([[fresh, "swift-fox"]]);
    registry.dispose();
  });
});

const project = (id: string, workspaceRoot: string, title: string) =>
  ({ id, workspaceRoot, title }) as unknown as OrchestrationProjectShell;
const snapshotOf = (...projects: OrchestrationProjectShell[]) =>
  ({ projects }) as unknown as OrchestrationV2ShellSnapshot;

function titled(
  snapshot: OrchestrationV2ShellSnapshot,
  catalog: EnvironmentCatalogState,
  names: ReadonlyArray<SpinboxNames> | undefined,
) {
  const registry = AtomRegistry.make();
  const snapshotAtom = Atom.make<OrchestrationV2ShellSnapshot | null>(snapshot);
  const namesAtom = Atom.make(names);
  const atom = withSpinboxTitles(() => snapshotAtom, Atom.make(catalog), namesAtom);
  return { registry, snapshotAtom, read: () => registry.get(atom(fresh)) };
}
const titles = (snapshot: OrchestrationV2ShellSnapshot | null) =>
  snapshot?.projects.map((p) => [p.workspaceRoot, p.title]);

// The workspace's own project is titled as Spinbox names it, never after its directory: the
// workspace has one project, its repository's or none.
describe("a project's title inside Spinbox", () => {
  const catalog = catalogOf([fresh, paired(fresh, "https://w1.agents.spin.example/")]);

  it.each([
    ["its Spinbox project's name", { project: "qboot" }, "qboot"],
    ["the workspace's name where it has no project", {}, "swift-fox"],
  ])("is %s", (_, extra, title) => {
    const { read, registry } = titled(
      snapshotOf(project("p1", "/workspace", "workspace"), project("p2", "/tmp/other", "other")),
      catalog,
      readSpinboxNames([{ ...told, ...extra }]),
    );
    expect(titles(read())).toEqual([
      ["/workspace", title],
      ["/tmp/other", "other"],
    ]);
    registry.dispose();
  });

  it("keeps the projects list while no project changes", () => {
    const other = project("p2", "/tmp/other", "other");
    const { read, registry, snapshotAtom } = titled(
      snapshotOf(project("p1", "/workspace", "workspace"), other),
      catalog,
      readSpinboxNames([told]),
    );
    const first = read()!;
    expect(first.projects[1]).toBe(other);
    registry.set(snapshotAtom, { ...first, projects: registry.get(snapshotAtom)!.projects });
    expect(read()!.projects).toBe(first.projects);
    registry.dispose();
  });
});

// Inside Spinbox a workspace always has its one project, so nothing offers starting without one.
describe("starting without a project", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const scratch = () =>
    createScratchProjectActions({
      environments: () => [
        {
          environmentId: fresh,
          connection: { phase: "connected", error: null, traceId: null },
          serverConfig: { scratchWorkspaceRoot: "/root/.t3/scratch" } as never,
        },
      ],
      primaryEnvironmentId: () => null,
      registry: AtomRegistry.make(),
      handleNewThread: async () => null,
    });

  it("is not offered inside Spinbox", () => {
    vi.stubGlobal("window", { spinboxPair: async () => "" });
    expect(scratch().scratchWorkspaceRootFor(fresh)).toBeNull();
    expect(scratch().scratchEnvironmentId(fresh)).toBeNull();
  });

  it("is offered outside it", () => {
    vi.stubGlobal("window", {});
    expect(scratch().scratchWorkspaceRootFor(fresh)).toBe("/root/.t3/scratch");
  });
});
