import { describe, expect, it } from "vitest";
import {
  canonicalizeFrmLikeV1,
  hashFrmLikeV1,
  parseFrmLikeV1,
  validateFrmLikeV1Ir,
  type FrmLikeV1ParseSuccess,
  type FrmLikeV1Statement,
} from "../engine/frm/v1";

const SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
PowerJulia {
  parameters:
    power : real=2 domain[1,16] classic p1
    offset:complex = (-0.75, 0.1) classic p2
    transform: function = sin classic fn1
  init:
    z = pixel ; initial point
  loop:
    previous = z
    if |z| < 2
      z = transform(z ^ power) + offset
    else
      z = z + c
    endif
  bailout:
    |z| <= 4
}`;

function parsed(source = SOURCE): FrmLikeV1ParseSuccess {
  const result = parseFrmLikeV1(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function withLoop(body: string): string {
  return SOURCE.replace(
    /  loop:\n[\s\S]*?  bailout:/,
    `  loop:\n${body}\n  bailout:`,
  );
}

describe("isolated FRM-like v1 core", () => {
  it("produces typed structural IR and a deterministic canonical formatter", () => {
    const result = parsed();
    expect(result.ir.numericProfile).toBe("standard32");
    expect(result.ir.parameters.map((parameter) => parameter.type)).toEqual([
      "real",
      "complex",
      "function",
    ]);
    expect(result.ir.init[0]).toMatchObject({
      kind: "assignment",
      target: "z",
    });
    expect(result.ir.loop[1]).toMatchObject({
      kind: "if",
      then: [{ kind: "assignment" }],
    });
    expect(result.ir.locals).toEqual([{ name: "previous", type: "complex" }]);
    expect(canonicalizeFrmLikeV1(result.ir)).toBe(`; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
PowerJulia {
  parameters:
    power: real = 2 domain [1, 16] classic p1
    offset: complex = (-0.75, 0.1) classic p2
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    previous = z
    if |z| < 2
      z = transform(z ^ power) + offset
    else
      z = z + c
    endif
  bailout:
    |z| <= 4
}`);
  });

  it("layers exact-source and semantic hashes with browser Web Crypto", async () => {
    const first = parsed();
    const commentOnly = parsed(
      SOURCE.replace("initial point", "changed comment").replace(
        "power : real=2",
        "power: real = 2",
      ),
    );
    const semanticChange = parsed(
      SOURCE.replace("power : real=2", "power: real = 3"),
    );
    const nameOnly = parsed(SOURCE.replace("PowerJulia", "RenamedFormula"));
    const a = await hashFrmLikeV1(first.source, first.ir);
    const b = await hashFrmLikeV1(commentOnly.source, commentOnly.ir);
    const c = await hashFrmLikeV1(semanticChange.source, semanticChange.ir);
    const d = await hashFrmLikeV1(nameOnly.source, nameOnly.ir);
    const reordered = {
      ...first.ir,
      parameters: [...first.ir.parameters].reverse(),
      locals: [...first.ir.locals].reverse(),
      init: first.ir.init.map((statement: FrmLikeV1Statement) =>
        statement.kind === "assignment" && statement.value.kind === "identifier"
          ? {
              value: {
                name: statement.value.name,
                kind: "identifier" as const,
              },
              target: statement.target,
              kind: "assignment" as const,
            }
          : statement,
      ),
    };
    const e = await hashFrmLikeV1(first.source, reordered);
    expect(a.sourceRevision).not.toBe(b.sourceRevision);
    expect(a.semanticHash).toBe(b.semanticHash);
    expect(a.semanticHash).not.toBe(c.semanticHash);
    expect(a.semanticHash).toBe(d.semanticHash);
    expect(a.semanticHash).toBe(e.semanticHash);
    expect(a.sourceRevision).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      hashFrmLikeV1(first.source, {
        ...first.ir,
        bailout: { kind: "number", value: Number.NaN },
      }),
    ).rejects.toThrow("invalid-semantic-ir");
    await expect(
      hashFrmLikeV1(first.source, semanticChange.ir),
    ).rejects.toThrow("source-ir-mismatch");
    await expect(hashFrmLikeV1(first.source, nameOnly.ir)).rejects.toThrow(
      "source-ir-mismatch",
    );
  });

  it("rejects unpaired UTF-16 surrogates before byte measurement and hashing", async () => {
    const high = SOURCE.replace("initial point", "\ud800");
    const low = SOURCE.replace("initial point", "\udc00");
    expect(parseFrmLikeV1(high)).toMatchObject({
      ok: false,
      reason: "invalid-unicode-source",
    });
    expect(parseFrmLikeV1(low)).toMatchObject({
      ok: false,
      reason: "invalid-unicode-source",
    });
    expect(parseFrmLikeV1(SOURCE.replace("initial point", "😀")).ok).toBe(true);
    expect(parseFrmLikeV1(SOURCE.replace("initial point", "�")).ok).toBe(true);
    await expect(hashFrmLikeV1(high, parsed().ir)).rejects.toThrow(
      "invalid-unicode-source",
    );
  });

  it("rejects cyclic and over-deep externally supplied IR before backend use", () => {
    const valid = parsed();
    const cyclic: { kind: "unary"; operator: "-"; operand?: unknown } = {
      kind: "unary",
      operator: "-",
    };
    cyclic.operand = cyclic;
    expect(
      validateFrmLikeV1Ir({ ...valid.ir, bailout: cyclic as never }),
    ).toMatchObject({ ok: false, reason: "invalid-semantic-ir" });

    let deep: unknown = { kind: "number", value: 1 };
    for (let index = 0; index < 66; index += 1)
      deep = { kind: "unary", operator: "-", operand: deep };
    expect(
      validateFrmLikeV1Ir({ ...valid.ir, bailout: deep as never }),
    ).toMatchObject({ ok: false, reason: "invalid-semantic-ir" });
  });

  it("round-trips signed complex literals and non-associative expressions without changing IR", () => {
    const expressions = [
      "((-0.75, -0.1) ^ power) ^ 2",
      "z - (c - pixel)",
      "z / (c / pixel)",
      "(z ^ 2) ^ 3",
      "z ^ (2 ^ 3)",
      "-(z + c)",
      "|z + c|",
      "|(|z|)|",
    ];
    for (const expression of expressions) {
      const candidate = parsed(
        SOURCE.replace("previous = z", `previous = ${expression}`),
      );
      const canonical = canonicalizeFrmLikeV1(candidate.ir);
      expect(parsed(canonical).ir).toEqual(candidate.ir);
    }
    expect(
      canonicalizeFrmLikeV1(
        parsed(
          SOURCE.replace(
            "previous = z",
            "previous = ((-0.75, -0.1) ^ power) ^ 2",
          ),
        ).ir,
      ),
    ).toContain("previous = ((-0.75, -0.1) ^ power) ^ 2");
  });

  it("uses path-sensitive definite assignment and requires initialized complex component targets", () => {
    const crossBranchRead = withLoop(`    if |z| < 2
      branchLocal = z
    else
      z = branchLocal
    endif`);
    expect(parseFrmLikeV1(crossBranchRead)).toMatchObject({
      ok: false,
      reason: "possibly-uninitialized-read",
    });

    const nonExhaustiveRead = withLoop(`    if |z| < 2
      branchLocal = z
    endif
    z = branchLocal`);
    expect(parseFrmLikeV1(nonExhaustiveRead)).toMatchObject({
      ok: false,
      reason: "possibly-uninitialized-read",
    });

    const exhaustive = parsed(
      withLoop(`    if |z| < 2
      branchLocal = z
    else
      branchLocal = c
    endif
    z = branchLocal`),
    );
    expect(exhaustive.ir.locals).toContainEqual({
      name: "branchLocal",
      type: "complex",
    });

    expect(
      parseFrmLikeV1(withLoop("    real(tmp) = 1\n    z = tmp")),
    ).toMatchObject({
      ok: false,
      reason: "component-target-not-initialized",
    });
    expect(
      parseFrmLikeV1(withLoop("    tmp = 1\n    real(tmp) = 2\n    z = tmp")),
    ).toMatchObject({
      ok: false,
      reason: "component-target-not-complex",
    });
  });

  it("enforces function arity and keeps extra reserved names non-callable", () => {
    expect(
      parseFrmLikeV1(SOURCE.replace("transform(z ^ power)", "transform()")),
    ).toMatchObject({ ok: false, reason: "invalid-function-arity" });
    expect(
      parseFrmLikeV1(SOURCE.replace("transform(z ^ power)", "atan2(z)")),
    ).toMatchObject({ ok: false, reason: "invalid-function-arity" });
    expect(
      parseFrmLikeV1(SOURCE.replace("previous = z", "previous = transform")),
    ).toMatchObject({ ok: false, reason: "function-value-not-callable" });
    expect(
      parseFrmLikeV1(SOURCE.replace("function = sin", "function = customStd"), {
        stdlibNames: new Set(["customStd"]),
      }),
    ).toMatchObject({ ok: false, reason: "unknown-stdlib-function" });
    expect(
      parseFrmLikeV1(SOURCE.replace("function = sin", "function = atan2")),
    ).toMatchObject({ ok: false, reason: "unknown-stdlib-function" });
    expect(
      parseFrmLikeV1(
        SOURCE.replace(
          "    transform: function = sin classic fn1\n",
          "",
        ).replace("transform(z ^ power)", "fn1(z ^ power)"),
      ),
    ).toMatchObject({ ok: false, reason: "unmapped-function-slot" });
  });

  it.each([
    [
      "; @language: frm-like/1\n; @stdlib: 1\n; @numeric-profile: standard32\nX {\ninit:\n z=0\nloop:\n z=z\nbailout:\n |z|<4\n}\n; @stdlib: 1",
      "misplaced-semantic-directive",
    ],
    [
      SOURCE.replace("z = pixel ; initial point", "z = pixel; not a comment"),
      "residual-semicolon",
    ],
    [SOURCE.replace("domain[1,16]", "domain[3,16]"), "default-out-of-domain"],
    [SOURCE.replace("previous = z", "previous = future"), "undeclared-read"],
    [SOURCE.replace("previous = z", "power = z"), "immutable-assignment"],
    [SOURCE.replace("previous = z", "sin = z"), "reserved-assignment"],
    [SOURCE.replace("PowerJulia", "sin"), "reserved-name"],
    [
      SOURCE.replace("previous = z", "previous = 1, 2)"),
      "trailing-expression-tokens",
    ],
    [SOURCE.replace("    endif\n", ""), "unterminated-if"],
    [SOURCE.replace("  init:", "  loop:"), "duplicate-section"],
    [SOURCE.replace("classic p2", "classic p1"), "duplicate-classic-binding"],
    [
      SOURCE.replace(
        "    previous = z\n",
        "    x = " + "(".repeat(70) + "z" + ")".repeat(70) + "\n",
      ),
      "expression-depth-exceeded",
    ],
  ])("rejects %s", (source, reason) => {
    expect(parseFrmLikeV1(source)).toMatchObject({ ok: false, reason });
  });

  it("rejects caller-provided stdlib name collisions", () => {
    expect(
      parseFrmLikeV1(SOURCE.replace("PowerJulia", "customStd"), {
        stdlibNames: new Set(["customStd"]),
      }),
    ).toMatchObject({ ok: false, reason: "reserved-name" });
  });

  it("enforces source, declaration, AST and control-flow limits independently of identity", () => {
    expect(parseFrmLikeV1(`${SOURCE}\n${"x".repeat(65_537)}`)).toMatchObject({
      ok: false,
      reason: "source-too-large",
    });
    expect(parseFrmLikeV1(`${SOURCE}\n${"é".repeat(32_769)}`)).toMatchObject({
      ok: false,
      reason: "source-too-large",
    });
    expect(
      parseFrmLikeV1(SOURCE, { limits: { maxParameters: 1 } }),
    ).toMatchObject({ ok: false, reason: "parameter-limit-exceeded" });
    expect(
      parseFrmLikeV1(SOURCE, { limits: { maxAstNodes: 3 } }),
    ).toMatchObject({ ok: false, reason: "ast-node-limit-exceeded" });
    expect(
      parseFrmLikeV1(SOURCE, { limits: { maxControlFlowNodes: 0 } }),
    ).toMatchObject({ ok: false, reason: "control-flow-limit-exceeded" });
    expect(
      parseFrmLikeV1(SOURCE, { limits: { maxStatements: 1 } }),
    ).toMatchObject({ ok: false, reason: "statement-limit-exceeded" });
    expect(
      parseFrmLikeV1(`${SOURCE}\n${"x".repeat(65_537)}`, {
        limits: { maxSourceBytes: 1_000_000 },
      }),
    ).toMatchObject({ ok: false, reason: "source-too-large" });
    expect(
      parseFrmLikeV1(SOURCE, { limits: { maxAstNodes: -1 } }),
    ).toMatchObject({ ok: false, reason: "invalid-safety-limit" });
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(
        parseFrmLikeV1(SOURCE, { limits: { maxAstNodes: value } }),
      ).toMatchObject({ ok: false, reason: "invalid-safety-limit" });
    }
    expect(parseFrmLikeV1(SOURCE, { limits: { maxLocals: 0 } })).toMatchObject({
      ok: false,
      reason: "local-limit-exceeded",
    });
    expect(
      parseFrmLikeV1(
        SOURCE.replace(
          "previous = z",
          `previous = ${Array(70).fill("z").join(" + ")}`,
        ),
      ),
    ).toMatchObject({ ok: false, reason: "expression-depth-exceeded" });
  });
});
