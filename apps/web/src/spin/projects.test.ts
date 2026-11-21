import { describe, expect, it, vi } from "vite-plus/test";

import { buildSpinboxProjectItems, ensuredWorkspace, readSpinboxProjects } from "./projects";

// The projects are another origin's word: a whole entry is taken, one that is not is dropped.
describe("the projects Spinbox tells", () => {
  it("takes each whole entry", () => {
    expect(
      readSpinboxProjects([
        { id: "p1", name: "qboot" },
        { id: "p2", name: "web", extra: true },
      ]),
    ).toEqual([
      { id: "p1", name: "qboot" },
      { id: "p2", name: "web" },
    ]);
  });

  it.each([
    ["not a list", { 0: { id: "p", name: "n" } }],
    ["no id", [{ name: "n" }]],
    ["an empty id", [{ id: "", name: "n" }]],
    ["no name", [{ id: "p" }]],
    ["a name that is not text", [{ id: "p", name: 3 }]],
    ["not an object", ["p"]],
  ])("drops %s", (_, told) => {
    expect(readSpinboxProjects(told)).toEqual([]);
  });
});

describe("a new thread on a Spinbox project", () => {
  it("is a row per project, which starts that project's thread", async () => {
    const start = vi.fn(async (_: string) => {});
    const rows = buildSpinboxProjectItems(
      [
        { id: "p1", name: "qboot" },
        { id: "p2", name: "web" },
      ],
      start,
    );
    expect(rows.map((r) => [r.title, r.value])).toEqual([
      ["qboot", "new-thread-in-spinbox:p1"],
      ["web", "new-thread-in-spinbox:p2"],
    ]);
    await rows[1]?.run();
    expect(start).toHaveBeenCalledWith("p2");
  });
});

// The workspace the page answers a project with is another origin's word: the one it names is
// opened, and an answer naming none is refused rather than opening nothing.
describe("the workspace Spinbox ensures for a project", () => {
  it("is the one it names", () => {
    expect(ensuredWorkspace({ workspaceId: "w1", dir: "/workspace/qboot" })).toBe("w1");
  });

  it.each([
    ["no workspace", { dir: "/workspace" }],
    ["an empty one", { workspaceId: "", dir: "/workspace" }],
    ["nothing", undefined],
  ])("is refused for an answer with %s", (_, told) => {
    expect(() => ensuredWorkspace(told)).toThrow(Error);
  });
});
