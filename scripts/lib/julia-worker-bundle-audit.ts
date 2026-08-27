import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { chromium } from "@playwright/test";

import { canonicalJsonV1, sha256HexSyncV1 } from "../../src/engine/formulas/v1/revisions";

interface EsbuildMetafile {
  readonly inputs: Readonly<Record<string, unknown>>;
}

export interface JuliaWorkerBundleAuditV2 {
  readonly bundleSha256: string;
  readonly repoInputPaths: readonly string[];
  readonly runtimeDependencyBindings: Readonly<Record<string, string>>;
  readonly browserExecutablePath: string;
}

const RUNTIME_PACKAGES = Object.freeze([
  "@playwright/test",
  "playwright",
  "playwright-core",
]);

function directoryTreeHash(directoryRoot: string): string {
  const files: Record<
    string,
    Readonly<{ bytes: number; executable: boolean; sha256: string }>
  > = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const projected = relative(directoryRoot, path).split(sep).join("/");
      const stat = lstatSync(path);
      if (stat.isSymbolicLink())
        throw new Error("julia-worker-bundle-audit-runtime-symlink-invalid");
      if (stat.isDirectory()) {
        visit(path);
        continue;
      }
      if (!stat.isFile())
        throw new Error("julia-worker-bundle-audit-runtime-file-invalid");
      files[projected] = Object.freeze({
        bytes: stat.size,
        executable: (stat.mode & 0o111) !== 0,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      });
    }
  };
  visit(directoryRoot);
  if (Object.keys(files).length === 0)
    throw new Error("julia-worker-bundle-audit-runtime-empty");
  return sha256HexSyncV1(canonicalJsonV1(files, 1_048_576));
}

function packageTreeHash(root: string, packageName: string): string {
  return directoryTreeHash(join(root, "node_modules", packageName));
}

export function auditJuliaRuntimeDependenciesV2(
  root: string,
  executable = chromium.executablePath(),
): Readonly<Record<string, string>> {
  const executableStat = lstatSync(executable);
  if (!executableStat.isFile() || executableStat.isSymbolicLink())
    throw new Error("julia-worker-bundle-audit-browser-invalid");
  return Object.freeze({
    "@playwright/test": packageTreeHash(root, "@playwright/test"),
    playwright: packageTreeHash(root, "playwright"),
    "playwright-core": packageTreeHash(root, "playwright-core"),
    "chromium-runtime": directoryTreeHash(dirname(executable)),
  });
}

export function pinJuliaRuntimeDependenciesV2(
  sourceRoot: string,
  sourceExecutable: string,
  targetRoot: string,
  expected: Readonly<Record<string, string>>,
): string {
  const targetNodeModules = join(targetRoot, "node_modules");
  mkdirSync(targetNodeModules, { mode: 0o700 });
  for (const packageName of RUNTIME_PACKAGES) {
    const target = join(targetNodeModules, packageName);
    mkdirSync(join(target, ".."), { recursive: true, mode: 0o700 });
    cpSync(join(sourceRoot, "node_modules", packageName), target, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  const targetBrowserRoot = join(targetRoot, "chromium-runtime");
  cpSync(dirname(sourceExecutable), targetBrowserRoot, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const targetExecutable = join(targetBrowserRoot, basename(sourceExecutable));
  const actual = auditJuliaRuntimeDependenciesV2(targetRoot, targetExecutable);
  if (canonicalJsonV1(actual, 64) !== canonicalJsonV1(expected, 64))
    throw new Error("julia-worker-bundle-audit-pinned-runtime-invalid");
  return targetExecutable;
}

export function auditJuliaWorkerBundleV2(
  root: string,
  workerSource: string,
  frozenBundle: string,
  expectedExecutionPaths: readonly string[],
  writeFrozenBundle: boolean,
): JuliaWorkerBundleAuditV2 {
  const temporary = mkdtempSync(join(tmpdir(), "julia-worker-audit-"));
  try {
    const output = writeFrozenBundle ? frozenBundle : join(temporary, "worker.mjs");
    const metafile = join(temporary, "meta.json");
    const result = spawnSync(
      join(root, "node_modules/.bin/esbuild"),
      [
        workerSource,
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--loader:.glsl=text",
        "--packages=external",
        `--outfile=${output}`,
        `--metafile=${metafile}`,
      ],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    if (result.status !== 0)
      throw new Error("julia-worker-bundle-audit-build-failed");
    const generated = readFileSync(output);
    const bundleSha256 = createHash("sha256").update(generated).digest("hex");
    if (
      !writeFrozenBundle &&
      createHash("sha256").update(readFileSync(frozenBundle)).digest("hex") !==
        bundleSha256
    )
      throw new Error("julia-worker-bundle-audit-frozen-bundle-invalid");
    const parsed = JSON.parse(readFileSync(metafile, "utf8")) as EsbuildMetafile;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      parsed.inputs === null ||
      typeof parsed.inputs !== "object" ||
      Array.isArray(parsed.inputs)
    )
      throw new Error("julia-worker-bundle-audit-metafile-invalid");
    const rootPath = resolve(root);
    const repoInputs = Object.keys(parsed.inputs)
      .map((path) => {
        const absolute = resolve(rootPath, path);
        const projected = relative(rootPath, absolute).split(sep).join("/");
        if (projected === ".." || projected.startsWith("../"))
          throw new Error("julia-worker-bundle-audit-input-escape");
        return projected;
      })
      .filter((path) => !path.startsWith("node_modules/"))
      .sort();
    if (
      repoInputs.length === 0 ||
      new Set(repoInputs).size !== repoInputs.length ||
      repoInputs.some((path) => !expectedExecutionPaths.includes(path))
    )
      throw new Error("julia-worker-bundle-audit-source-binding-incomplete");
    const browserExecutablePath = chromium.executablePath();
    return Object.freeze({
      bundleSha256,
      repoInputPaths: Object.freeze(repoInputs),
      runtimeDependencyBindings: auditJuliaRuntimeDependenciesV2(
        root,
        browserExecutablePath,
      ),
      browserExecutablePath,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
