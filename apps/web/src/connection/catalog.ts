import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";

import { withSpinboxLabels } from "../spin/names";
import { connectionAtomRuntime } from "./runtime";

const catalog = createEnvironmentCatalogAtoms(connectionAtomRuntime);

// Spinbox: every label the client reads of an environment is its workspace's name (spin/names).
export const environmentCatalog = {
  ...catalog,
  catalogValueAtom: withSpinboxLabels(catalog.catalogValueAtom),
};
