import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { HIDDEN_PALETTE_ACTIONS, HIDDEN_PATHS, HIDDEN_SETTINGS_PATHS } from "./hidden";

// Upstream's own sources: every file of the web client's but this directory's and the tests.
function upstreamSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === import.meta.dirname ? [] : upstreamSources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const upstream = upstreamSources(join(import.meta.dirname, ".."))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

// What Spinbox hides is named as upstream names it. A rename upstream - a page moved, an action
// renamed - leaves this branch merging cleanly while the renamed thing shows again; this is what
// says so when the stack is moved to a new tag.
describe("what Spinbox hides is still upstream's", () => {
  for (const hidden of [...HIDDEN_SETTINGS_PATHS, ...HIDDEN_PATHS, ...HIDDEN_PALETTE_ACTIONS]) {
    it(hidden, () => {
      expect(upstream.includes(`"${hidden}"`), `upstream names no "${hidden}" any more`).toBe(true);
    });
  }
});
