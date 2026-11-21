import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";

import { withSpinboxWorkspaces } from "../spin/names";
import { connectionAtomRuntime } from "./runtime";

const catalog = createEnvironmentCatalogAtoms(connectionAtomRuntime);

// Spinbox: the catalog the client reads holds the workspaces the page tells, each called by its
// name (spin/names).
export const environmentCatalog = {
  ...catalog,
  catalogValueAtom: withSpinboxWorkspaces(catalog.catalogValueAtom),
};
