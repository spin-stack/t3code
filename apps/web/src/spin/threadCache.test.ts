import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { KEPT_MESSAGES, toCached } from "./threadCache";

const message = (id: string, role: "user" | "assistant", text: string, minute = 0) => ({
  id,
  role,
  text,
  createdAt: DateTime.makeUnsafe(Date.UTC(2026, 10, 19, 10, minute)),
});

const projection = (messages: ReturnType<typeof message>[]) =>
  ({ thread: { title: "Fix the build" }, messages }) as unknown as OrchestrationV2ThreadProjection;

// What a sleeping chat reads from is its words in order: the title, who said what, and when.
describe("what of a chat is kept", () => {
  it("is its title and each message's words, in order", () => {
    expect(
      toCached(
        projection([
          message("m1", "user", "Why is CI red?"),
          message("m2", "assistant", "A flake.", 1),
        ]),
      ),
    ).toEqual({
      title: "Fix the build",
      messages: [
        { id: "m1", role: "user", text: "Why is CI red?", at: "2026-11-19T10:00:00.000Z" },
        { id: "m2", role: "assistant", text: "A flake.", at: "2026-11-19T10:01:00.000Z" },
      ],
    });
  });

  it("leaves out a message with no words: a tool's turn shows nothing to read", () => {
    const kept = toCached(
      projection([message("m1", "assistant", "  "), message("m2", "user", "hi")]),
    );
    expect(kept.messages.map((m) => m.id)).toEqual(["m2"]);
  });

  it("keeps the end of a long chat, which is what a person comes back to", () => {
    const many = Array.from({ length: KEPT_MESSAGES + 5 }, (_, i) =>
      message(`m${i}`, "user", `n${i}`),
    );
    const kept = toCached(projection(many));
    expect(kept.messages).toHaveLength(KEPT_MESSAGES);
    expect(kept.messages[0]?.id).toBe("m5");
    expect(kept.messages.at(-1)?.id).toBe(`m${KEPT_MESSAGES + 4}`);
  });
});
