import {
  BearerConnectionProfile,
  BearerConnectionTarget,
  RelayConnectionTarget,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { openSpinboxSignIn } from "./providerLogin";

const paired = EnvironmentId.make("environment-paired");
const relayed = EnvironmentId.make("environment-relayed");
const connectionId = "bearer:environment-paired";
const catalog: EnvironmentCatalogState = {
  isReady: true,
  entries: new Map([
    [
      paired,
      {
        target: new BearerConnectionTarget({ environmentId: paired, label: "dev", connectionId }),
        profile: Option.some(
          new BearerConnectionProfile({
            connectionId,
            environmentId: paired,
            label: "dev",
            httpBaseUrl: "https://dev.agents.spin.example/",
            wsBaseUrl: "wss://dev.agents.spin.example/",
          }),
        ),
        enabled: true,
      },
    ],
    [
      relayed,
      {
        target: new RelayConnectionTarget({ environmentId: relayed, label: "laptop" }),
        profile: Option.none(),
        enabled: true,
      },
    ],
  ]),
};

// Inside Spinbox a provider is signed in from Spinbox's own sign-in, which knows the environment by
// the address this client paired it at. T3's own settings are the way only outside it.
describe("setting up a provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("inside Spinbox asks the page to sign in the environment paired at its address", () => {
    const signIn = vi.fn();
    vi.stubGlobal("window", { spinboxSignIn: signIn });
    expect(openSpinboxSignIn(catalog, paired)).toBe(true);
    expect(signIn.mock.calls).toEqual([["https://dev.agents.spin.example/"]]);
  });

  it("outside Spinbox is T3's settings", () => {
    vi.stubGlobal("window", {});
    expect(openSpinboxSignIn(catalog, paired)).toBe(false);
  });

  it.each([
    ["one not paired at an address", relayed],
    ["one this client has not", EnvironmentId.make("environment-unknown")],
  ])("inside Spinbox is T3's settings for %s", (_, environmentId) => {
    const signIn = vi.fn();
    vi.stubGlobal("window", { spinboxSignIn: signIn });
    expect(openSpinboxSignIn(catalog, environmentId)).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
  });
});
