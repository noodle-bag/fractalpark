import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writePrivateReadinessManifest } from "../../scripts/generate-formula-publication-readiness";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "formula-readiness-"));
  roots.push(root);
  return root;
}

function outputDirectory(root: string): string {
  return join(
    root,
    ".formula-library-private",
    "formula-library-v1",
    "publication-readiness-v1",
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("formula publication readiness private writer", () => {
  it("writes the sole manifest with exact private permissions", () => {
    const root = temporaryRoot();
    const path = writePrivateReadinessManifest(root, "{}\n");
    writePrivateReadinessManifest(root, '{"revision":2}\n');
    expect(path).toBe(join(outputDirectory(root), "manifest.json"));
    expect(readFileSync(path, "utf8")).toBe('{"revision":2}\n');
    expect(readdirSync(outputDirectory(root))).toEqual(["manifest.json"]);
    expect(lstatSync(outputDirectory(root)).mode & 0o777).toBe(0o700);
    expect(lstatSync(path).mode & 0o777).toBe(0o600);
    expect(lstatSync(path).nlink).toBe(1);
  });

  it("rejects a symlink in the private output ancestry", () => {
    const root = temporaryRoot();
    const outside = temporaryRoot();
    chmodSync(outside, 0o700);
    symlinkSync(outside, join(root, ".formula-library-private"));
    expect(() => writePrivateReadinessManifest(root, "{}\n")).toThrow(
      "readiness-output-symlink-rejected",
    );
  });

  it("rejects an existing hardlinked manifest before truncation", () => {
    const root = temporaryRoot();
    const directory = outputDirectory(root);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const original = join(root, "original.json");
    writeFileSync(original, "must-survive\n", { mode: 0o600 });
    linkSync(original, join(directory, "manifest.json"));
    expect(() => writePrivateReadinessManifest(root, "replacement\n")).toThrow(
      "readiness-output-containment-failed",
    );
  });

  it("rejects unexpected files instead of normalizing an unknown tree", () => {
    const root = temporaryRoot();
    const directory = outputDirectory(root);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, "unexpected.json"), "{}\n", { mode: 0o600 });
    expect(() => writePrivateReadinessManifest(root, "{}\n")).toThrow(
      "readiness-output-set-invalid",
    );
  });
});
