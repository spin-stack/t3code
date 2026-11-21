import {
  BearerConnectionProfile,
  BearerConnectionTarget,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { notPaired, readListedEnvironments } from "./threads";

const thread = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  updatedAt,
  ...extra,
});

const workspace = (workspaceId: string, extra: Record<string, unknown> = {}) => ({
  workspaceId,
  environmentId: `e-${workspaceId}`,
  label: workspaceId,
  state: "asleep",
  httpBaseUrl: `https://${workspaceId}.agents.spin.example`,
  wsBaseUrl: `wss://${workspaceId}.agents.spin.example`,
  dir: "/workspace",
  ...extra,
});

const listed = (told: unknown[]) =>
  readListedEnvironments(told).map((e) => [e.environment.workspaceId, e.threads.map((t) => t.id)]);

// The chats are another origin's word: what is whole is listed, newest first, and the archived and
// malformed ones are left out without taking the rest with them.
describe("the chats Spinbox lists of a workspace", () => {
  it("are newest first, without the archived ones", () => {
    expect(
      listed([
        workspace("w1", {
          threads: [
            thread("old", "2026-11-01T00:00:00Z"),
            thread("archived", "2026-11-03T00:00:00Z", { archived: true }),
            thread("new", "2026-11-02T00:00:00Z"),
            { title: "no id", updatedAt: "2026-11-04T00:00:00Z" },
          ],
        }),
      ]),
    ).toEqual([["w1", ["new", "old"]]]);
  });

  it("are none where its agent never ran: a chat's address names T3's id", () => {
    expect(listed([workspace("w1", { environmentId: "", threads: [thread("a", "t")] })])).toEqual([
      ["w1", []],
    ]);
  });
});

const savedAt = (environmentId: EnvironmentId, httpBaseUrl: string): EnvironmentCatalogState => {
  const connectionId = `bearer:${environmentId}`;
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

// The list has every workspace this client has not paired - one without chats, and one whose agent
// never ran, too - so each can be opened from it; a paired one is the client's own to list.
describe("the workspaces the list shows", () => {
  it("are each one not paired, chats or none", () => {
    const told = readListedEnvironments([
      workspace("w1", { threads: [thread("a", "2026-11-01T00:00:00Z")] }),
      workspace("w2", { state: "ready" }),
      workspace("w3", { environmentId: "", state: "failed", why: "Its machine could not boot." }),
      workspace("w4", { environmentId: "" }),
    ]);
    const paired = savedAt(EnvironmentId.make("e-w1"), "https://elsewhere.example/");
    const pairedByAddress = savedAt(EnvironmentId.make("e-x"), "https://w4.agents.spin.example/");
    expect(notPaired(told, paired).map((e) => e.environment.workspaceId)).toEqual([
      "w2",
      "w3",
      "w4",
    ]);
    expect(notPaired(told, pairedByAddress).map((e) => e.environment.workspaceId)).toEqual([
      "w1",
      "w2",
      "w3",
    ]);
  });
});
