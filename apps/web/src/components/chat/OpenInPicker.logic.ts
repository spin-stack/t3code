import type { EnvironmentId } from "@t3tools/contracts";

import type { RemoteOpenMode } from "../../remoteOpen";
import { SHOW_OPEN_IN } from "../../spin/openIn";

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly hostEnvironmentId: string | null;
  readonly remoteOpenMode: RemoteOpenMode;
}): boolean {
  if (!SHOW_OPEN_IN || !input.activeProjectName) return false;
  if (
    input.activeThreadEnvironmentId === input.primaryEnvironmentId ||
    input.activeThreadEnvironmentId === input.hostEnvironmentId
  ) {
    return true;
  }
  return input.remoteOpenMode !== "local-exec";
}
