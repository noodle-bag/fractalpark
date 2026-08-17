import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writePublicAsset } from "../../scripts/generate-formula-publication-decisions";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "formula-decisions-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("formula publication decisions asset writer", () => {
  it("writes the asset atomically with public read permissions", () => {
    const root = temporaryRoot();
    const path = join(root, "publication-decisions.json");
    writePublicAsset(path, '{"revision":1}\n');
    writePublicAsset(path, '{"revision":2}\n');
    expect(readFileSync(path, "utf8")).toBe('{"revision":2}\n');
    expect(lstatSync(path).mode & 0o777).toBe(0o644);
    expect(lstatSync(path).nlink).toBe(1);
  });

  it("rejects a symlinked parent directory", () => {
    const root = temporaryRoot();
    const outside = temporaryRoot();
    chmodSync(outside, 0o755);
    symlinkSync(outside, join(root, "linked"));
    expect(() =>
      writePublicAsset(join(root, "linked", "asset.json"), "{}\n"),
    ).toThrow("decisions-asset-write-failed");
  });

  it("rejects replacing an existing symlink", () => {
    const root = temporaryRoot();
    const original = join(root, "original.json");
    writeFileSync(original, "must-survive\n");
    symlinkSync(original, join(root, "asset.json"));
    expect(() =>
      writePublicAsset(join(root, "asset.json"), "replacement\n"),
    ).toThrow("decisions-asset-write-failed");
    expect(readFileSync(original, "utf8")).toBe("must-survive\n");
  });

  it("rejects a missing parent directory", () => {
    const root = temporaryRoot();
    expect(() =>
      writePublicAsset(join(root, "absent", "asset.json"), "{}\n"),
    ).toThrow("decisions-asset-write-failed");
  });
});
