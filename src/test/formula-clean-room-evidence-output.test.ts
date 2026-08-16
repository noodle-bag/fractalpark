import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writePrivateCleanRoomEvidenceManifest } from "../../scripts/generate-formula-clean-room-evidence";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "formula-clean-room-evidence-"));
  roots.push(root);
  return root;
}

function outputDirectory(root: string): string {
  return join(
    root,
    ".formula-library-private",
    "formula-library-v1",
    "clean-room-evidence-v1",
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("formula clean-room private writer", () => {
  it("atomically writes the sole manifest with exact private permissions", () => {
    const root = temporaryRoot();
    const path = writePrivateCleanRoomEvidenceManifest(root, "{}\n");
    writePrivateCleanRoomEvidenceManifest(
      root,
      '{"revision":2}\n',
    );
    expect(path).toBe(join(outputDirectory(root), "manifest.json"));
    expect(readFileSync(path, "utf8")).toBe('{"revision":2}\n');
    expect(readdirSync(outputDirectory(root))).toEqual(["manifest.json"]);
    expect(lstatSync(outputDirectory(root)).mode & 0o777).toBe(0o700);
    expect(lstatSync(path).mode & 0o777).toBe(0o600);
    expect(lstatSync(path).nlink).toBe(1);
  });

  it("rejects a symlink in the output ancestry", () => {
    const root = temporaryRoot();
    const outside = temporaryRoot();
    chmodSync(outside, 0o700);
    symlinkSync(outside, join(root, ".formula-library-private"));
    expect(() =>
      writePrivateCleanRoomEvidenceManifest(root, "{}\n"),
    ).toThrow("clean-room-evidence-output-symlink-rejected");
  });

  it("rejects an existing manifest symlink", () => {
    const root = temporaryRoot();
    const outside = temporaryRoot();
    const directory = outputDirectory(root);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const sentinel = join(outside, "sentinel.json");
    writeFileSync(sentinel, "must-survive\n", { mode: 0o600 });
    symlinkSync(sentinel, join(directory, "manifest.json"));
    expect(() =>
      writePrivateCleanRoomEvidenceManifest(root, "replacement\n"),
    ).toThrow("clean-room-evidence-output-containment-failed");
    expect(readFileSync(sentinel, "utf8")).toBe("must-survive\n");
  });

  it("rejects a hardlinked manifest without mutating the external inode", () => {
    const root = temporaryRoot();
    const directory = outputDirectory(root);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const original = join(root, "original.json");
    writeFileSync(original, "must-survive\n", { mode: 0o600 });
    linkSync(original, join(directory, "manifest.json"));
    expect(() =>
      writePrivateCleanRoomEvidenceManifest(root, "replacement\n"),
    ).toThrow("clean-room-evidence-output-containment-failed");
    expect(readFileSync(original, "utf8")).toBe("must-survive\n");
  });

  it("rejects unexpected files instead of normalizing an unknown tree", () => {
    const root = temporaryRoot();
    const directory = outputDirectory(root);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, "unexpected.json"), "{}\n", {
      mode: 0o600,
    });
    expect(() =>
      writePrivateCleanRoomEvidenceManifest(root, "{}\n"),
    ).toThrow("clean-room-evidence-output-set-invalid");
  });

  it("pins the output descriptor and rejects an ancestry swap", () => {
    const root = temporaryRoot();
    let replacementSentinel = "";
    expect(() =>
      writePrivateCleanRoomEvidenceManifest(root, "replacement\n", () => {
        renameSync(
          join(root, ".formula-library-private"),
          join(root, ".formula-library-private-moved"),
        );
        mkdirSync(outputDirectory(root), { recursive: true, mode: 0o700 });
        replacementSentinel = join(outputDirectory(root), "sentinel.json");
        writeFileSync(replacementSentinel, "must-survive\n", { mode: 0o600 });
      }),
    ).toThrow("clean-room-evidence-output-containment-failed");
    expect(readFileSync(replacementSentinel, "utf8")).toBe("must-survive\n");
    expect(() =>
      readFileSync(join(outputDirectory(root), "manifest.json"), "utf8"),
    ).toThrow();
  });
});
