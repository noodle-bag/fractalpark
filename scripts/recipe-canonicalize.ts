#!/usr/bin/env tsx
/**
 * Canonicalizes a draft FRM-like v1 source read from a file argument.
 * Prints the canonical form on success or the parse failure on stderr.
 * Used when authoring native recipes: draft, canonicalize, store the
 * canonical output byte-for-byte.
 */
import { readFileSync } from "node:fs";

import { canonicalizeFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";

const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: tsx scripts/recipe-canonicalize.ts <draft-file>\n");
  process.exit(2);
}
const draft = readFileSync(file, "utf8").replace(/\s+$/, "");
const parsed = parseFrmLikeV1(draft);
if (!parsed.ok) {
  process.stderr.write(`${JSON.stringify(parsed)}\n`);
  process.exit(1);
}
process.stdout.write(`${canonicalizeFrmLikeV1(parsed.ir)}\n`);
