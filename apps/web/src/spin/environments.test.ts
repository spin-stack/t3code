import {
  BearerConnectionProfile,
  BearerConnectionTarget,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createSpinboxOpener,
  pairingInput,
  readOpening,
  readSpinboxEnvironments,
  savedEnvironmentId,
  wantsPairing,
} from "./environments";

const env = {
  workspaceId: "01a1f54c-0b33-7b64-ae5d-36864dcaf9cb",
  environmentId: "",
  label: "dev",
  state: "asleep",
  httpBaseUrl: "https://agents.spin.example/env/01a1f54c-0b33-7b64-ae5d-36864dcaf9cb",
  wsBaseUrl: "wss://agents.spin.example/env/01a1f54c-0b33-7b64-ae5d-36864dcaf9cb",
  dir: "/workspace/qboot",
};

// The list is another origin's word: what is whole is taken, and an entry that is not is dropped,
// never the client.
describe("the environments Spinbox tells", () => {
  it("takes each whole entry, with its project and why where told", () => {
    expect(
      readSpinboxEnvironments([
        { ...env, project: "qboot", why: "It is stopping." },
        { ...env, workspaceId: "w2", environmentId: "e2", state: "ready" },
      ]),
    ).toEqual([
      { ...env, project: "qboot", why: "It is stopping." },
      { ...env, workspaceId: "w2", environmentId: "e2", state: "ready" },
    ]);
  });

  it.each([
    ["not a list", { 0: env }],
    ["nothing", undefined],
  ])("is none for %s", (_, told) => {
    expect(readSpinboxEnvironments(told)).toEqual([]);
  });

  it.each([
    ["no workspace", { ...env, workspaceId: "" }],
    ["a state it does not know", { ...env, state: "sleeping" }],
    ["no base URL", { ...env, httpBaseUrl: undefined }],
    ["no directory to work in", { ...env, dir: undefined }],
    ["not an object", "dev"],
  ])("drops an entry with %s", (_, entry) => {
    expect(readSpinboxEnvironments([entry, env])).toEqual([env]);
  });
});

// A pairing is asked with the URL Spinbox answered, and expects T3's own id where Spinbox knows it,
// so a workspace whose server is not the one told is refused rather than saved under it.
describe("what a pairing asks", () => {
  const url = `${env.httpBaseUrl}/pair#token=t`;
  it("expects T3's id where it is known", () => {
    const told = readSpinboxEnvironments([{ ...env, environmentId: "e1" }])[0]!;
    expect(pairingInput(told, url)).toEqual({ pairingUrl: url, expectedEnvironmentId: "e1" });
  });

  it("expects none before the workspace's server has said it", () => {
    const told = readSpinboxEnvironments([env])[0]!;
    expect(pairingInput(told, url)).toEqual({ pairingUrl: url });
  });
});

// Spinbox wakes a workspace only for a pairing, so opening one is what pairs it: one this client
// has not, and one it saved whose workspace has gone to sleep since.
describe("which environment opening pairs", () => {
  const told = (state: string) => readSpinboxEnvironments([{ ...env, state }])[0]!;
  it.each([
    ["one not saved", "ready", false, true],
    ["one saved and asleep", "asleep", true, true],
    ["one saved and running", "ready", true, false],
    ["one saved and already waking", "waking", true, false],
  ])("%s", (_, state, saved, pairs) => {
    expect(wantsPairing(told(state), saved)).toBe(pairs);
  });

  it("none Spinbox did not tell", () => {
    expect(wantsPairing(undefined, false)).toBe(false);
  });
});

const savedAt = (id: string, httpBaseUrl: string): EnvironmentCatalogState => {
  const environmentId = EnvironmentId.make(id);
  const connectionId = `bearer:${id}`;
  return {
    isReady: true,
    entries: new Map([
      [
        environmentId,
        {
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
        },
      ],
    ]),
  };
};
const nothingSaved: EnvironmentCatalogState = { isReady: true, entries: new Map() };

// A workspace is the environment saved with T3's id where Spinbox knows it, else the one paired at
// its address, which T3 keeps in its own form.
describe("the environment saved for a workspace", () => {
  const told = (environmentId: string) =>
    readSpinboxEnvironments([
      { ...env, environmentId, httpBaseUrl: "https://w1.agents.example" },
    ])[0]!;

  it("is the one with T3's id where Spinbox knows it", () => {
    expect(savedEnvironmentId(savedAt("e1", "https://other.example/"), told("e1"))).toBe("e1");
  });

  it("is the one paired at its address before Spinbox knows T3's id", () => {
    expect(savedEnvironmentId(savedAt("e1", "https://w1.agents.example/"), told(""))).toBe("e1");
  });

  it.each([
    ["one at another address", savedAt("e1", "https://w2.agents.example/"), ""],
    ["one with another id", savedAt("e2", "https://w1.agents.example/"), "e1"],
    ["nothing", nothingSaved, ""],
  ])("is none where this client saved %s", (_, catalog, environmentId) => {
    expect(savedEnvironmentId(catalog, told(environmentId))).toBeUndefined();
  });
});

// What the page asks to open is another origin's word: a workspace, at the chat it names or a new
// one; a chat that is no address is not landed somewhere else.
describe("what the page asks to open", () => {
  it.each([
    [
      "a chat",
      { workspaceId: "w1", chat: "/e1/t1" },
      { to: "chat", environmentId: "e1", threadId: "t1" },
    ],
    ["a new chat, naming none", { workspaceId: "w1" }, { to: "new" }],
    ["no landing, for a chat that is no address", { workspaceId: "w1", chat: "e1" }, undefined],
  ])("is %s", (_, told, landing) => {
    expect(readOpening(told)).toEqual({ workspaceId: "w1", landing });
  });

  it.each([
    ["no workspace", { chat: "/e1/t1" }],
    ["not an object", "w1"],
  ])("is nothing for %s", (_, told) => {
    expect(readOpening(told)).toBeUndefined();
  });
});

// The page hears every open: it asked for the pairing, or for the open itself, and shows a wait
// until it is told the workspace is open or why it could not be.
describe("opening a Spinbox workspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function page(environments: unknown[], pair: (workspaceId: string) => Promise<string>) {
    const window = Object.assign(new EventTarget(), {
      spinboxEnvironments: environments,
      spinboxPair: vi.fn(pair),
      spinboxOpened: vi.fn<(workspaceId: string, error?: string) => void>(),
    });
    vi.stubGlobal("window", window);
    return window;
  }

  function opener(catalog: EnvironmentCatalogState) {
    const connect = vi.fn(async (_: ReturnType<typeof pairingInput>) => EnvironmentId.make("e1"));
    const land = vi.fn(async (_opened: { environmentId: string }, _landing: unknown) => {});
    const open = createSpinboxOpener({ catalog: async () => catalog, connect, land });
    return { open, connect, land };
  }

  const url = (workspaceId: string) => `https://agents.example/env/${workspaceId}/pair#token=t`;
  const landed = (land: ReturnType<typeof opener>["land"]) =>
    land.mock.calls.map(([opened, landing]) => [opened.environmentId, landing]);

  it("pairs one this client has not, lands, and tells the page", async () => {
    const window = page([{ ...env, workspaceId: "w1", state: "ready" }], async (w) => url(w));
    const { open, connect, land } = opener(nothingSaved);
    await open("w1", { to: "new" });
    expect(window.spinboxPair).toHaveBeenCalledWith("w1");
    expect(connect).toHaveBeenCalledWith({ pairingUrl: url("w1") });
    expect(landed(land)).toEqual([["e1", { to: "new" }]]);
    expect(window.spinboxOpened.mock.calls).toEqual([["w1"]]);
  });

  it("lands in one saved and running without a pairing", async () => {
    const told = { ...env, workspaceId: "w1", environmentId: "e1", state: "ready" };
    const window = page([told], async (w) => url(w));
    const { open, land } = opener(savedAt("e1", "https://agents.example/"));
    await open("w1", { to: "chat", environmentId: "e1", threadId: "t1" });
    expect(window.spinboxPair).not.toHaveBeenCalled();
    expect(landed(land)).toEqual([["e1", { to: "chat", environmentId: "e1", threadId: "t1" }]]);
    expect(window.spinboxOpened.mock.calls).toEqual([["w1"]]);
  });

  it("pairs one saved whose workspace sleeps, which is what wakes it", async () => {
    const told = { ...env, workspaceId: "w1", environmentId: "e1", state: "asleep" };
    const window = page([told], async (w) => url(w));
    const { open } = opener(savedAt("e1", "https://agents.example/"));
    await open("w1", { to: "new" });
    expect(window.spinboxPair).toHaveBeenCalledWith("w1");
  });

  it("tells the page why it did not open where the page could not pair it", async () => {
    const window = page([{ ...env, workspaceId: "w1" }], async () => {
      throw new Error("It could not wake.");
    });
    const { open, land } = opener(nothingSaved);
    await open("w1", { to: "new" });
    expect(land).not.toHaveBeenCalled();
    expect(window.spinboxOpened.mock.calls).toEqual([["w1", "It could not wake."]]);
  });

  it("tells the page why it did not open where T3 refused the pairing", async () => {
    const window = page([{ ...env, workspaceId: "w1" }], async (w) => url(w));
    const { open, connect, land } = opener(nothingSaved);
    connect.mockRejectedValueOnce(new Error("That address reaches another."));
    await open("w1", { to: "new" });
    expect(land).not.toHaveBeenCalled();
    expect(window.spinboxOpened.mock.calls).toEqual([["w1", "That address reaches another."]]);
  });

  it("asks the page once while a pairing is out, and lands each open that asked to", async () => {
    let answer: (url: string) => void = () => {};
    const answered = new Promise<string>((resolve) => (answer = resolve));
    const window = page([{ ...env, workspaceId: "w1" }], () => answered);
    const { open, land } = opener(nothingSaved);
    const first = open("w1", { to: "new" });
    const second = open("w1", { to: "chat", environmentId: "e1", threadId: "t1" });
    const byAddress = open("w1", { to: "here" });
    answer(url("w1"));
    await Promise.all([first, second, byAddress]);
    expect(window.spinboxPair).toHaveBeenCalledTimes(1);
    expect(landed(land)).toEqual([
      ["e1", { to: "new" }],
      ["e1", { to: "chat", environmentId: "e1", threadId: "t1" }],
    ]);
    expect(window.spinboxOpened.mock.calls).toEqual([["w1"], ["w1"]]);
  });

  it("waits for the page to tell of a workspace it has just made", async () => {
    const window = page([], async (w) => url(w));
    const { open, land } = opener(nothingSaved);
    const opened = open("w9", { to: "new" });
    window.spinboxEnvironments = [{ ...env, workspaceId: "w9", state: "ready" }];
    window.dispatchEvent(new Event("spinbox:environments"));
    await opened;
    expect(window.spinboxPair).toHaveBeenCalledWith("w9");
    expect(landed(land)).toEqual([["e1", { to: "new" }]]);
  });
});
