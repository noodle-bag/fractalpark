import { readFileSync } from "node:fs";
import { join } from "node:path";

import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import {
  JULIA_PRE_GPU_SOURCE_BINDING_PATHS_V1,
  parseJuliaPreGpuCapabilityCensusV1,
} from "../src/engine/formulas/v1/julia-pre-gpu-capability";
import { sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import { matchesJuliaPreGpuReleaseSourceBindings } from "./lib/julia-pre-gpu-release-source-bindings";

const ROOT = process.cwd();
const parsed = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
if (!parsed.ok) throw new Error(parsed.code);

const current = Object.freeze(
  Object.fromEntries(
    JULIA_PRE_GPU_SOURCE_BINDING_PATHS_V1.map((relativePath) => [
      relativePath,
      sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
    ]),
  ),
);
const packageJson = readFileSync(join(ROOT, "package.json"), "utf8");
const lockJson = readFileSync(join(ROOT, "package-lock.json"), "utf8");
if (
  !matchesJuliaPreGpuReleaseSourceBindings(
    parsed.value.sourceBindings,
    current,
    packageJson,
    lockJson,
  )
) throw new Error("julia-pre-gpu-release-source-binding-invalid");

console.log(
  "PASS: sealed Julia pre-GPU authority; exact 0.4.20 metadata-only package transition; all executable inputs byte-exact",
);
