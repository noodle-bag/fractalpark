import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/creation/custom-formulas/lifecycle/route";
import { MINE_FORMULA_LIFECYCLE_BODY_LIMIT_BYTES } from "@/lib/cloud/mine-formula-lifecycle";

const previous = process.env.FRACTALPARK_CREATION_CLOUD_ENABLED;

afterEach(() => {
  if (previous === undefined)
    delete process.env.FRACTALPARK_CREATION_CLOUD_ENABLED;
  else process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = previous;
  delete process.env.FRACTALPARK_MINE_FORMULA_LIFECYCLE_WRITER_ENABLED;
});

describe("Mine formula lifecycle route gate", () => {
  it("is disabled by default before session, parsing, or any cloud write", async () => {
    expect(MINE_FORMULA_LIFECYCLE_BODY_LIMIT_BYTES).toBeGreaterThan(65_536);
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = "true";
    const response = await POST(
      new Request(
        "https://fractalpark.test/api/creation/custom-formulas/lifecycle",
        { method: "POST" },
      ),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "cloud_disabled" },
    });
  });
});
