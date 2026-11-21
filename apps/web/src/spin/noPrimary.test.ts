import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// Read as the client loads, so each case loads it afresh in the window it is given.
async function hostedIn(window: object) {
  vi.stubGlobal("window", window);
  vi.resetModules();
  const { isHostedStaticApp } = await import("../hostedPairing");
  return isHostedStaticApp(new URL("https://agents.spin.example/"));
}

// Every client Spinbox frames is its Agents page's: no primary, whatever frame it is in, and every
// environment one Spinbox pairs.
describe("a client Spinbox frames", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("has no primary, whatever its frame is named", async () => {
    expect(await hostedIn({ spinboxPair: async () => "", name: "" })).toBe(true);
  });

  it("is T3 Code's own client, with its primary, when nothing frames it", async () => {
    expect(await hostedIn({ name: "spinbox-agents" })).toBe(false);
  });
});
