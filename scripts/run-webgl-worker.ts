#!/usr/bin/env tsx
/**
 * GPU-leg worker: reads a JSON array of GpuCase from the path in argv[2],
 * runs the census WebGL harness, prints the per-case status map as JSON on
 * stdout. Runs as a short-lived subprocess so SwiftShader JIT memory spikes
 * and wedged GPU channels are reclaimed by the OS between chunks.
 */
import { readFileSync } from "node:fs";
import { runWebgl, type GpuCase } from "./formula-library-bulk-migration";

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) throw new Error("usage: run-webgl-worker.ts <cases.json>");
  const cases = JSON.parse(readFileSync(path, "utf8")) as GpuCase[];
  const results = await runWebgl(cases);
  process.stdout.write(
    `${JSON.stringify(Object.fromEntries(results))}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
