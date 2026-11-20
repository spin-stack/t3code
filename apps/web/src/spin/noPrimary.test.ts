import { describe, expect, it } from "vite-plus/test";

import { spinboxWithoutPrimary } from "./noPrimary";

function memory(had = false) {
  const m = { had, read: () => m.had, write: () => void (m.had = true) };
  return m;
}

describe("a client Spinbox frames", () => {
  it("without a workspace's credential has no primary", () => {
    expect(spinboxWithoutPrimary(true, new URL("https://agents.example/"), memory())).toBe(true);
  });

  it("with one is that workspace's, and stays so across a reload in the tab", () => {
    const m = memory();
    expect(spinboxWithoutPrimary(true, new URL("https://agents.example/#token=abc"), m)).toBe(
      false,
    );
    expect(spinboxWithoutPrimary(true, new URL("https://agents.example/env/thread"), m)).toBe(
      false,
    );
  });

  it("is T3 Code's own client when nothing frames it", () => {
    expect(spinboxWithoutPrimary(false, new URL("https://agents.example/"), memory())).toBe(false);
  });
});
