import { describe, expect, it } from "vite-plus/test";

import { AGENTS_FRAME, spinboxWithoutPrimary } from "./noPrimary";

describe("a client Spinbox frames", () => {
  it("on the Agents page has no primary", () => {
    expect(spinboxWithoutPrimary(true, AGENTS_FRAME)).toBe(true);
  });

  it("for a workspace is that workspace's, whatever the tab framed before it", () => {
    expect(spinboxWithoutPrimary(true, "spinbox-workspace")).toBe(false);
  });

  it("in a frame Spinbox gave no name is not taken for the Agents page", () => {
    expect(spinboxWithoutPrimary(true, "")).toBe(false);
  });

  it("is T3 Code's own client when nothing frames it, whatever its window is named", () => {
    expect(spinboxWithoutPrimary(false, AGENTS_FRAME)).toBe(false);
  });
});
