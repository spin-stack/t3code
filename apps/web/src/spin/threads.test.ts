import { describe, expect, it } from "vite-plus/test";

import { readSleepingThreads } from "./threads";

const thread = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  updatedAt,
  ...extra,
});

// The chats are another origin's word: what is whole is listed, newest first, and the archived and
// malformed ones are left out without taking the rest with them.
describe("the chats Spinbox lists of the environments", () => {
  it("lists each environment's chats newest first, without the archived ones", () => {
    expect(
      readSleepingThreads([
        {
          environmentId: "e1",
          label: "dev",
          threads: [
            thread("old", "2026-11-01T00:00:00Z"),
            thread("archived", "2026-11-03T00:00:00Z", { archived: true }),
            thread("new", "2026-11-02T00:00:00Z"),
          ],
        },
      ]),
    ).toEqual([
      {
        environmentId: "e1",
        label: "dev",
        threads: [thread("new", "2026-11-02T00:00:00Z"), thread("old", "2026-11-01T00:00:00Z")],
      },
    ]);
  });

  it.each([
    ["not a list", { 0: {} }],
    [
      "no environment id: its agent never ran",
      [{ environmentId: "", label: "dev", threads: [thread("a", "t")] }],
    ],
    ["no threads", [{ environmentId: "e1", label: "dev" }]],
    [
      "only archived threads",
      [{ environmentId: "e1", label: "dev", threads: [thread("a", "t", { archived: true })] }],
    ],
    [
      "a thread with no id",
      [{ environmentId: "e1", label: "dev", threads: [{ title: "x", updatedAt: "t" }] }],
    ],
  ])("lists nothing for %s", (_, told) => {
    expect(readSleepingThreads(told)).toEqual([]);
  });
});
