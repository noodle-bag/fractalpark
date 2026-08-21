# FRM-like v1 Author Manual

- Language: FractalPark FRM-like Language v1 (`frm-like/1`)
- Date: 2026-08-20
- Normative reference: [FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md)
- Formula Records: `/en/formulas/<formulaId>` on FractalPark

This manual teaches the language by reading and modifying small Definitions.
Published Standard formulas use the language today. Canonical v1 writer/import
activation is still gated.

## 1. What you can do today

FractalPark currently exposes 677 Standard identities: 513 published Definitions
and 164 held Records.

For a published Record you can:

- inspect its identity, provenance, rights decision, source revision, and Profile;
- view or download the pinned `.frm` Definition source;
- open the pinned Definition and Profile in Explore; and
- start an anonymous Remix without changing the Standard source.

A held Record explains why it is unavailable. It has no source, run, edit, or
Remix action. Catalog presence does not mean runtime availability.

The standalone FRM Editor remains a Classic-compatible authoring surface.
Canonical FRM-like v1 writer and import activation remains gated. The examples in
this manual are executable v1 Definitions verified with the production v1
parser, CPU/GLSL artifact generation, and two finite CPU steps, but the current
standalone Editor is not a canonical v1 paste target. Use Formula Records to
inspect active Standard source; use the existing FRM Guide for the
Classic-compatible Editor workflow.

## 2. Read a published Definition

A published Definition begins with three semantic directives:

```text
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
```

They pin the language, function vocabulary, and numeric behavior. They look like
comments so Classic readers can tolerate them, but FractalPark treats them as
semantic input. Removing, duplicating, placing one after the formula header, or
changing one invalidates the Definition. Reordering the three directives inside
the preamble is valid; canonical output restores the order shown above.

Migrated source may also carry one optional
`; @classic-guards: zero-division, floored-log, hyperbolic-clamp` directive.
Canonical output places it immediately after `@numeric-profile`. It records
reviewed compatibility evidence, so authors MUST NOT add, remove, or edit it by
hand; see [normative §5](../specs/frm-like-language-v1.md#5-standard-library-v1).

The body has one formula name and three required executable sections:

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
FirstOrbit {
  init:
    z = 0
  loop:
    z = z ^ 2 + c
  bailout:
    |z| <= 4
}
```

Here `|z| <= 4` means radius 4. A Classic squared-magnitude threshold of `4`
corresponds to `|z| <= 2`, so migration must translate the meaning rather than
copy the numeral.

Unary minus also differs from common and Classic `^`-first reading: v1 reads
`-z ^ 2` as `(-z) ^ 2`. When migrating, add the parentheses that express the
intended sign instead of copying an ambiguous spelling.

Read it in iteration order:

1. `init` sets the orbit state once for each pixel.
2. Before every `loop`, FractalPark snapshots `z` as `zPrev`.
3. `loop` updates the orbit in source order.
4. `bailout` answers “should iteration continue?” A false result stops.

`|z|` is true complex magnitude, not squared magnitude. The example therefore
continues while the orbit radius is at most 4.

A Formula Record pins the exact source by `sourceRevision` and separately pins a
Profile. The Profile owns the camera, iterations, mode, Julia constant, palette,
and coloring. Those presentation choices do not belong in the Definition.

## 3. Write a Definition

Start with the smallest structure above. Formula names and variables use ASCII
letters, digits, and underscores; the first character cannot be a digit. Keep
one statement per physical line.

Useful system and host values are:

- `pixel`: the current plane coordinate;
- `c`: the runtime-selected formula constant;
- `z`: the writable orbit state;
- `zPrev`: the runtime-maintained previous iteration orbit value;
- `LastSqr`: the runtime-maintained squared magnitude of `z` at the end of the
  most recently completed `loop`. For finite `z` whose squared magnitude exceeds
  binary32, this decision channel saturates to positive infinity without ending
  the step; reading that value in source still produces `nonFinite`;
- `ismand`: parameter-plane (`true`) versus Julia (`false`) mode;
- `pi`, `e`, and `maxit`;
- Classic interoperability inputs `p1`-`p5`, which can be read directly. An
  unbound slot is complex zero on CPU and MUST remain complex zero in a
  conforming GLSL host. A `classic pN` binding makes the bare slot and named
  parameter resolve to the same value; and
- Classic function slots `fn1`-`fn4`, which require matching named function
  parameters with `classic fnN` bindings before they can be called.

`zPrev` and `LastSqr` are not external host inputs and MUST NOT be overridden.
See the [standard library quick reference](#standard-library-quick-reference) for
the functions available to state expressions.

This Definition works in both parameter-plane and Julia modes:

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
ModeAwarePower {
  parameters:
    power: real = 2 domain [1, 16]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = z ^ power + c
  bailout:
    |z| <= 64
}
```

Do not assign to any system value or Classic slot listed in §3, any parameter,
constant, or stdlib name. `z` is the only writable system value. A new legal
assignment name creates a local, but later assignments must keep the same type.

Expressions support arithmetic, comparison, logical operators, unary minus and
not, function calls, parentheses, complex literals, and magnitude bars. `^` is
right-associative. FractalPark evaluates in source-order and left-to-right rather
than silently rearranging floating-point work. The canonical v1 formatter form
MUST NOT nest magnitude bars; use `cabs(...)` for the inner modulus. Unary minus binds more
tightly than exponentiation, so `-z ^ 2` means `(-z) ^ 2`.

## 4. Add parameters

Put an optional `parameters` section before `init`. A parameter has one of three
types:

- `real`: finite scalar, optionally with inclusive `domain [min, max]`;
- `complex`: literal default `(real, imaginary)`; or
- `function`: a unary stdlib function name.

A named parameter may record a unique Classic binding. Bind `real` or `complex`
parameters only to `p1`-`p5`, and function parameters only to `fn1`-`fn4`.
Bindings support migration and interoperability; your source should use the named
parameter.

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
FunctionGarden {
  parameters:
    scale: real = 0.5 domain [0, 2] classic p1
    offset: complex = (-0.2, 0.1) classic p2
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    z = transform(z) * scale + offset + c / maxit
  bailout:
    LastSqr < 576
}
```

Hard domains are validated semantic limits. If values outside a suggested range
remain valid, place that soft range in the Profile or Record instead.

Function parameters accept unary stdlib names such as `sqr`, `sin`, `log`, or
`identity`. `atan2` has two arguments and cannot be selected as a function
parameter. If `real`, `imag`, or `cabs` is selected, its scalar result is promoted
to a complex value with zero imaginary component. The example also uses the
runtime-maintained squared magnitude `LastSqr` as its continue threshold and the
host iteration ceiling `maxit` to scale the `c` contribution.
See the [standard library quick reference](#standard-library-quick-reference) for
the complete selectable set.

## 5. Use state and control flow

`if`, `elseif`, `else`, and `endif` operate on boolean conditions. A local may be
read after a branch only if every path initialized it. This rejects formulas that
would depend on stale or backend-specific values.

Component assignment updates one part of an already initialized complex value:

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
OrbitMemory {
  parameters:
    feedback: complex = (0.3, -0.12)
    bias: real = 0.05 domain [-1, 1]
  init:
    z = pixel
  loop:
    z = z + zPrev * feedback
    previous = z
    if real(z) >= 0
      z = sqr(z) + c
      real(z) = real(z) + bias
    else
      z = cos(z) + c
      imag(z) = imag(z) - bias
    endif
    z = z + bias * previous
  bailout:
    |z| < 48
}
```

Here `previous` is captured after the initial feedback update and before the
branch, while `zPrev` is the runtime snapshot taken immediately before `loop`.
They are not interchangeable: `zPrev` is the incoming orbit value, while
`previous` is the intermediate value consumed after the branch.

### Standard library quick reference

The stdlib includes:

- arithmetic and projections: `abs`, `sqr`, `sqrt`, `exp`, `log`, `recip`,
  `conj`, `flip`, `real`, `imag`, `cabs`, `round`, `atan2`, `identity`;
- circular functions: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`; and
- hyperbolic functions: `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`,
  `cotanh`, plus compatibility function `cosxx`.

Remember that `abs(z)` is component-wise, while `cabs(z)` and `|z|` return the
complex modulus. Division by zero, `log(0)`, and other required non-finite values
terminate with the `nonFinite` event unless a migrated Definition carries a
specific, evidence-backed Classic guard.

## 6. Diagnose a rejected Definition

Start with the first stable reason. Later errors are often consequences of the
same missing section, bad token, or undeclared value.

A practical check order is:

1. **Preamble:** all three required directives are present once and before the
   header; preserve any reviewed optional `@classic-guards` directive unchanged.
2. **Shape:** one formula; ordered `parameters`, `init`, `loop`, `bailout`;
   exactly one bailout expression; no trailing executable text.
3. **Names:** ASCII identifiers, no reserved-name collision, no duplicate
   parameter or Classic binding.
4. **Types:** boolean branch/bailout conditions, callable functions, consistent
   local type, initialized component target.
5. **Definite assignment:** every local read is initialized on every path.
6. **Safety:** source, parameters, locals, AST, expression depth, statements,
   control flow, and generated shader remain inside the v1 envelope.
7. **Post-acceptance runtime:** a syntactically valid formula can still
   terminate with `nonFinite`; that is runtime evidence, not permission to replace
   the formula.

Common corrections:

| Rejection | Correct response |
|---|---|
| `invalid-semantic-directives` | Restore exact language, stdlib, and NumericProfile values |
| `invalid-section-order` | Move `parameters` before `init`, then `loop`, then `bailout` |
| `undeclared-read` | Assign a local first or declare a parameter; do not guess a host value |
| `possibly-uninitialized-read` | Initialize the local on every branch before reading it |
| `unmapped-function-slot` | Declare a function parameter with the matching `classic fnN` binding |
| `bailout-not-boolean` | Use an explicit comparison such as `|z| < 4` |
| `source-too-large` | Reduce source input and formatter output to at most 65,536 UTF-8 bytes |
| `generated-shader-too-large` | Simplify the Definition; do not request a larger public limit |

Known v0.4.19 deviation: parenthesized nested magnitude may currently parse but
is non-canonical, fails formatter round-trip, and MUST be held by publication
validation. It is tracked in the
[normative reference §8](../specs/frm-like-language-v1.md#8-canonicalization-revisions-and-conformance),
with writer activation blocked until the front end rejects it.

A conforming tool rejects unsupported punctuation, macros, user-defined
functions, multiple formulas, arbitrary directives, and trailing executable
content. Unsupported constructs are rejected rather than executed with altered
meaning.

## 7. Revisions, Remix, and portability

Two hashes answer different questions:

- `sourceRevision` identifies the exact UTF-8 bytes of the pinned Definition
  source asset.
- `semanticHash` identifies canonical typed meaning. Comments, insignificant
  formatting, and the formula name do not change it; executable edits do.

The published reader hashes source bytes exactly as supplied. CRLF/CR-to-LF
normalization applies to parsing only and never to `sourceRevision`; line endings,
comments, formatting, or a terminal LF can therefore change `sourceRevision`
without changing `semanticHash`. The gated writer is stricter:
it must emit the deterministic formatter form and pass the Safety Envelope
before persistence or publication.

A Profile has its own revision. Changing the camera or palette does not rewrite
formula meaning. Likewise, a backend build has its own revision and cannot become
a second source of truth.

A Standard Definition is immutable at its pinned revision. **Open** runs that
Definition and Profile. **Remix** creates an editable anonymous context with
frozen lineage; it does not modify or impersonate the Standard Record. Handoff
parameters are consumed once and removed from the URL. Save and cloud restore
remain separate identity and authorization operations.

Portable work follows the reader-first asset contract. A self-contained work
pins or embeds the Definition, resolved parameter values, Profile, language,
stdlib, and NumericProfile needed for replay. The contract requires unsupported
future profiles to open read-only rather than downgrade silently. v1 currently
exposes only `standard32`, and regression gate C10 remains pending, so this
future-profile behavior is not claimed as exercised product behavior today.
Writer activation and Production migration are separate release gates, not
implied by this manual.

## 8. Classic `.frm` and the standalone Editor

Classic `.frm` is an import dialect with a different source grammar and a
separate `frmSemanticsVersion` compatibility axis. It may contain multiple
entries, classic headers, colon-separated blocks, implicit slots, and historical
semantics that canonical v1 intentionally does not copy as authoring syntax.

The standalone FRM Editor currently scans and compiles that Classic-compatible
surface. Its shared examples do not include the three canonical v1 directives or
the v1 `parameters` section. Do not treat a successful Classic Editor compile as
proof that the source is in the canonical v1 formatter form.

Conversely, do not paste the canonical v1 formatter form into the current
standalone Editor and infer that the language is unsupported when the legacy
authoring surface rejects it. Use the Formula Record's Source action to inspect
or download published v1 source, and its Open/Remix actions to run the pinned
published runtime. Canonical v1 writer/import support must pass its own activation gate
before the availability rules in this section or normative reference §9 change.

For Classic selection, frozen visual compatibility, strict-v2 diagnostics, and
Upgrade & Compare behavior, use the
[FRM Compatibility and Migration Contracts v1](../specs/frm-compatibility-v1.md).
For exact language semantics and limits, the
[FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md) reference is
authoritative.
