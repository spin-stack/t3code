import { describe, expect, it } from "vite-plus/test";

import { pairingInput, readSpinboxEnvironments, wantsPairing } from "./environments";

const env = {
  workspaceId: "01a1f54c-0b33-7b64-ae5d-36864dcaf9cb",
  environmentId: "",
  label: "dev",
  state: "asleep",
  httpBaseUrl: "https://agents.spin.example/env/01a1f54c-0b33-7b64-ae5d-36864dcaf9cb",
  wsBaseUrl: "wss://agents.spin.example/env/01a1f54c-0b33-7b64-ae5d-36864dcaf9cb",
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

// Spinbox wakes a workspace only for a pairing, so a chat's address is what pairs one: one this
// client has not, and one it saved whose workspace has gone to sleep since.
describe("which environment a chat's address pairs", () => {
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
