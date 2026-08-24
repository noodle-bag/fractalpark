# FractalPark FRM-like Language v1

- Status: Normative
- Language identifier: `frm-like/1`
- Standard library: `1`
- NumericProfile: `standard32`
- Date: 2026-08-20
- Target release: FractalPark v0.4.19
- Implementation: `src/engine/frm/v1.ts`, `src/engine/frm/frm-v1-stdlib.ts`, and `src/engine/frm/v1-backend.ts`
- Asset and lifecycle contract: [Unified Formula Library and FRM-like Language Contract v1](unified-formula-library-v1.md)
- Legacy import contract: [FRM Compatibility and Migration Contracts v1](frm-compatibility-v1.md)

## 1. Scope and conformance language

This document is the normative English reference for executable FractalPark
FRM-like v1 Definitions. It specifies source structure, types, evaluation,
stdlib behavior, safety limits, canonicalization, and compatibility boundaries.
The asset contract governs Formula IDs, Profiles, Records, Documents, rights,
and writer activation; those concerns do not change language semantics.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, and **MAY** are to
be interpreted as conformance requirements. A conforming implementation MUST
reject a program it cannot preserve. It MUST NOT guess, silently rewrite an
unsupported construct, or grant exceptions based on Formula ID, catalog scope,
rights class, provenance, or trust metadata.

FRM-like v1 is not the same version axis as the legacy
`frmSemanticsVersion: 1 | 2` contract. `frm-like/1` identifies this canonical,
typed language. `frmSemanticsVersion` selects frozen behavior while importing or
running Classic-compatible `.frm` source.

This reference uses two distinct source terms:

- **pinned Definition source**: the exact UTF-8 byte body accepted by the active
  reader and identified by `sourceRevision`; and
- **canonical formatter form**: the deterministic text emitted by
  `canonicalizeFrmLikeV1`, required by the gated writer before new persistence
  or publication.

A conforming executable pipeline is:

```text
pinned Definition source
  -> FRM-like v1 parser and type analysis
  -> typed semantic IR
  -> CPU and GLSL execution artifacts
  -> versioned orbit, event, and continuation behavior
```

Generated GLSL, caches, JavaScript objects, and native recipes are backend
artifacts. They are never durable authoring source and never replace the
pinned Definition source.

## 2. Source grammar

### 2.1 Lexical form

A source is valid Unicode text. Unpaired UTF-16 surrogates are rejected before
UTF-8 byte measurement or hashing. The input byte ceiling is measured before
newline normalization. The parser normalizes CRLF and lone CR to LF; the
canonical formatter form always uses LF. Identifiers are ASCII and match
`[A-Za-z_][A-Za-z0-9_]*`; non-ASCII text may appear in ordinary comments but not
in identifiers. Identifiers, keywords, section names, stdlib names, and directive
keys and values are case-sensitive; `z` and `Z`, or `init` and `Init`, are
different spellings. Except for the magnitude/OR boundary below, ASCII spaces or
tabs used for leading indentation or around
`:`, `=`, commas, brackets, parentheses, braces, and operators are insignificant
and do not affect `semanticHash`. Newlines remain structural: they delimit
physical statements and section contents. At least one ASCII space or tab is
REQUIRED between a closing magnitude bar and a following logical `||`; this is
the only position where inter-token whitespace is significant. The reverse order,
`||` followed by an opening magnitude bar, needs no separator. The formatter
always emits the required separator.

A semicolon begins an ordinary comment when it is the first non-whitespace
character of a physical line, or when whitespace precedes it after executable
text. A residual semicolon in executable text is invalid. There is no
preprocessor, macro system, user-defined function syntax, implicit
multiplication, or statement separator.

A semantic-directive line has the exact lexical shape
`; @<key>: <value>` after optional ASCII indentation/spacing, where `<key>` is
lowercase ASCII letters and hyphens. The key set is closed to `language`,
`stdlib`, `numeric-profile`, and `classic-guards`; another matching key is an
`unknown-semantic-directive`, not an ordinary comment.

The preamble has three required semantic directives plus one optional directive.
The required directives are:

```text
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
```

They may appear in any order and may be separated by blank lines or ordinary
comments, but each MUST appear exactly once before the formula header. Unknown
or duplicated semantic directives are invalid. A directive-looking comment
after the header is invalid. The canonical formatter, not the input parser,
fixes their output order.

A fourth directive MAY be present:

```text
; @classic-guards: zero-division, floored-log, hyperbolic-clamp
```

The list is comma-separated, non-empty, unique, and limited to those three
values. These guards reproduce diagnosed Classic behavior for migrated
Definitions; they are not general error recovery and SHOULD NOT be added to new
source without conformance evidence.

### 2.2 Structural grammar

The source contains exactly one formula. Blank lines and ordinary comment lines
MAY follow its closing brace; semantic directives and executable tokens MUST NOT.
After semantic-preamble recognition, blank lines and ordinary comment lines are
lexical trivia removed before the structural grammar below applies. A comment
line ends at its normalized newline or at EOF. This reduction also accounts for
trivia between declarations, statements, section headers, and the closing brace.

```ebnf
source          = preamble, formula ;
preamble        = permutationWithTrivia(languageDirective, stdlibDirective,
                                        numericProfileDirective,
                                        classicGuardsDirective?) ;
formula         = identifier, "{", NEWLINE, parameters?, init, loop, bailout,
                  "}", NEWLINE? ;
parameters      = "parameters", ":", NEWLINE, parameterDeclaration* ;
parameterDeclaration
                = identifier, ":", parameterType, "=", parameterDefault,
                  domain?, classicBinding?, NEWLINE ;
parameterType   = "real" | "complex" | "function" ;
parameterDefault
                = realLiteral | complexLiteral | unaryStdlibName ;
domain          = "domain", "[", realLiteral, ",", realLiteral, "]" ;
classicBinding  = "classic", ("p1" | "p2" | "p3" | "p4" | "p5" |
                                     "fn1" | "fn2" | "fn3" | "fn4") ;
init            = "init", ":", NEWLINE, statement* ;
loop            = "loop", ":", NEWLINE, statement* ;
bailout         = "bailout", ":", NEWLINE, booleanExpression, NEWLINE ;
```

`permutationWithTrivia(a, b, c, d?)` is normative metalanguage for exactly one
occurrence of each required operand and zero or one occurrence of the optional
operand, in any order, with blank lines or ordinary comment lines allowed before,
between, or after them. `languageDirective`, `stdlibDirective`,
`numericProfileDirective`, and `classicGuardsDirective` are the exact directive
line forms in §2.1. `NEWLINE` is the normalized LF boundary defined in §2.1.
`identifier` is the lexical form defined in §2.1; `realLiteral` and
`complexLiteral` are defined in §3.2. `unaryStdlibName` is any unary name frozen
in §5. `expression` is
specified in §3.2, `booleanExpression` is an `expression` whose inferred type is
`boolean`, and `statement` is specified in §3.3. Blank lines and ordinary comment
lines may appear between declarations, statements, section headers, and the
closing brace; they are trivia, not declarations or statements.

The formula header name MUST NOT collide with a section, keyword, system value,
constant, or stdlib name. It is otherwise outside the executable variable
namespace.

Sections MUST appear in the order `parameters`, `init`, `loop`, `bailout`.
`parameters` MAY be omitted. An empty `parameters` body is conforming and the
canonical formatter omits that section. The other three sections are REQUIRED.
Empty `init` and `loop` bodies are conforming; the formatter emits their headers
with no placeholder statement. The `bailout` section contains exactly one
expression and cannot be empty.

A minimal conforming Definition is:

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
MinimalBrot {
  init:
    z = 0
  loop:
    z = z ^ 2 + c
  bailout:
    |z| <= 4
}
```

Here `|z| <= 4` means radius 4 because v1 magnitude bars return true magnitude.
A Classic squared-magnitude threshold of `4` corresponds to `|z| <= 2`; the
numeral must not be copied without translating its meaning.

### 2.3 Parameters

A parameter occupies one physical line. Parameter names MUST be unique and MUST
NOT collide with a section, keyword, system value, constant, or stdlib name.
The formula name is a non-executable label in a separate namespace, so a
parameter MAY use the same spelling.

- `real` defaults are finite decimal literals. A real parameter MAY declare an
  inclusive `domain [min, max]`; `min <= default <= max` is REQUIRED.
- `complex` defaults are literal pairs `(real, imaginary)`. v1 does not define a
  complex hard-domain syntax.
- `function` defaults name a unary stdlib function. `atan2` is binary and cannot
  be a function-parameter default.
- A `classic` binding is optional and unique. `real` and `complex` parameters
  bind only to `p1`-`p5`; `function` parameters bind only to `fn1`-`fn4`.
- Profile concerns such as labels, soft ranges, steps, grouping, current values,
  camera, iteration count, palette, and coloring MUST NOT appear in a Definition.

```frm
; @language: frm-like/1
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
    z = transform(z ^ power) + offset
  bailout:
    |z| <= 4
}
```

## 3. Values, expressions, and statements

### 3.1 Value types

The semantic types are `real`, `complex`, `boolean`, and `function`.

- A real used by a complex operation promotes to `(value, 0)`.
- A boolean used numerically, including assignment to a numeric target such as
  `z`, promotes to `false = 0` or `true = 1` with zero imaginary component.
- A function value is callable only. Any non-call use, including assignment or a
  logical/numeric operand, fails with `function-value-not-callable`.
- Locals infer `real`, `complex`, or `boolean` from their first assignment and
  retain that type. There are no function-typed locals.

At runtime a `real` local uses numeric storage with zero imaginary component; a
`boolean` local uses boolean storage. A later assignment whose inferred type
differs from the local's first-assignment type fails with `local-type-mismatch`.

Exact zeros are canonicalized to positive zero at language-visible
`standard32` boundaries. Nonzero one-sided branch-cut inputs retain their sign.

### 3.2 Expressions

Declaration defaults, domain bounds, and complex-literal components use finite
decimal or scientific-notation real literals with an optional leading minus
sign. They require a digit before any decimal point, do not accept a leading plus
sign, and do not accept a leading zero on a multi-digit integer. An exponent MAY
contain `+` or `-`. In an executable expression, a leading `-` is the unary-minus
operator rather than part of the numeric token. Complex literals are pairs of
signed real literals such as `(-0.75, 0.1)`. Complex literals are valid in
executable expressions as well as declaration defaults. A parenthesized pair
containing a top-level comma is a complex literal; parentheses without that comma
are grouping.

```ebnf
digit            = "0" | nonzeroDigit ;
nonzeroDigit     = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
unsignedInteger  = "0" | nonzeroDigit, digit* ;
fractionPart     = ".", digit+ ;
exponentPart     = ("e" | "E"), ("+" | "-")?, digit+ ;
numericToken     = unsignedInteger, fractionPart?, exponentPart? ;
realLiteral      = "-"?, numericToken ;
complexLiteral   = "(", realLiteral, ",", realLiteral, ")" ;
expression       = primary | unaryExpression | binaryExpression ;
primary          = numericToken | complexLiteral | identifier |
                   functionCall | "(", expression, ")" |
                   magnitudeExpression ;
magnitudeExpression
                 = "|", expressionWithoutMagnitude, "|" ;
unaryExpression  = ("-" | "!"), (primary | unaryExpression) ;
binaryExpression = expression, binaryOperator, expression ;
functionCall     = identifier, "(", argumentList?, ")" ;
argumentList     = expression, (",", expression)* ;
binaryOperator   = "||" | "&&" | "<" | ">" | "<=" | ">=" |
                   "==" | "!=" | "+" | "-" | "*" | "/" | "^" ;
```

`numericToken` is the unsigned executable real token described above;
`complexLiteral` uses its signed component form. `expressionWithoutMagnitude`
means the same expression grammar with the `magnitudeExpression` alternative
unavailable at every recursive depth. A conforming source MUST NOT nest
magnitude-bar expressions; use `cabs(...)` for the inner modulus. The precedence
and associativity rules below disambiguate the intentionally recursive binary
production. The
expression operators, from lower to higher precedence, are:

1. `||`
2. `&&`
3. `<`, `>`, `<=`, `>=`, `==`, `!=`
4. `+`, `-`
5. `*`, `/`
6. `^`
7. unary `-`, unary `!`

Exponentiation is right-associative. Other binary operators group from the left.
Unary operators bind more tightly than exponentiation, so `-z ^ 2` means
`(-z) ^ 2`. Calls, parenthesized groups, and magnitude bars are primary forms and
bind more tightly than every operator. The lexer takes the longest operator token,
so `||` is logical OR,
not two adjacent magnitude delimiters. The canonical formatter form MUST NOT nest
magnitude-bar expressions and MUST use `cabs(...)` for an inner modulus.

Migration warning: common mathematical notation and Classic source may read
`-z^2` with exponentiation first. A v1 migration MUST insert parentheses for the
intended meaning rather than copy that spelling unchanged.

Evaluation is in source-order and left-to-right; a backend MUST NOT reassociate
expressions unless a later NumericProfile explicitly permits it.

Expression result types are frozen as follows:

| Expression | Result type |
|---|---|
| Numeric token | `real` |
| Complex literal | `complex` |
| Magnitude, `real`, `imag`, `cabs`, or direct `atan2` call | `real` |
| Call through a function parameter, or any other stdlib call | `complex` |
| Unary `!`, comparison, `&&`, or `||` | `boolean` |
| Unary `-` | the numeric operand type; a boolean operand converts to `real` |
| `+`, `-`, `*`, `/`, or `^` | `complex` if either operand is complex; otherwise `real`; boolean operands convert to `0` or `1` real |

`|x|` returns ordinary absolute value for a real and Euclidean magnitude for a
complex value. It does not return squared magnitude. `<`, `>`, `<=`, and `>=`
compare real projections. Complex `==` requires both components to match;
complex `!=` is true when either component differs. `&&`, `||`, and unary `!`
accept `real`, `complex`, or `boolean` operands and return `boolean`; function
operands are invalid. Numeric truthiness tests the real projection against zero,
so an imaginary-only complex value is false. A branch or bailout expression must
itself have boolean type: bare numeric truthiness is not an implicit condition.

Exponentiation uses the real projection of its right operand. An exactly zero
complex base returns `(0, 0)` for every exponent, including zero or a negative
value. A nonzero base is evaluated as the principal
`exp((right.real, 0) * log(left))` under `standard32`; there is no integer-power
shortcut. Function calls have one argument except `atan2(y, x)`, which has two.

### 3.3 Statements and control flow

The statement forms are:

```ebnf
statement       = assignment | componentAssignment | conditional ;
assignment      = identifier, "=", expression, NEWLINE ;
componentAssignment
                = ("real" | "imag"), "(", identifier, ")", "=",
                  expression, NEWLINE ;
conditional     = "if", booleanExpression, NEWLINE, statement*,
                  ("elseif", booleanExpression, NEWLINE, statement*)*,
                  ("else", NEWLINE, statement*)?, "endif", NEWLINE ;
```

A read of an identifier that is not a parameter, system value, constant, or
definitely assigned local is invalid and fails with `undeclared-read`.

A conditional expression MUST have boolean type. Component assignment requires
an already definitely initialized complex target and stores the real projection
of the right-hand side. A local read is valid only if every control-flow path to
that read initialized it. A local cannot change type after introduction.

All locals live in one per-pixel state frame shared by `init`, every `loop`
iteration, and `bailout`; their stored values persist until that pixel's orbit
ends. A local definitely assigned in `init` is visible in `loop` and `bailout`,
and a local definitely assigned in `loop` is visible in `bailout`. `bailout` MAY
read such locals. Definite-assignment analysis remains conservative: a loop read
MUST be justified by `init` or by an earlier assignment on every path in the
current loop body, not solely by a value left from a previous iteration.

Parameters and system inputs are immutable. `z` is the only writable system
value. Assigning a previously unused legal identifier introduces a local.

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
BranchEcho {
  parameters:
    gain: real = 0.25 domain [0, 1]
  init:
    z = pixel
  loop:
    z = z + zPrev * gain
    previous = z
    if real(z) > 0
      z = sqr(z) + c
      real(z) = real(z) + gain
    else
      z = sin(z) + c
    endif
    z = z + gain * previous
  bailout:
    |z| < 32
}
```

### 3.4 Iteration order

For one pixel, the runtime:

1. initializes system values and parameters;
2. executes `init` once;
3. before each iteration, snapshots `z` into `zPrev`;
4. executes `loop` in source order;
5. records `LastSqr` as the squared magnitude of `z` at the end of that
   successfully completed `loop`; and
6. evaluates `bailout` as the **continue-iteration predicate**.

The runtime repeats steps 3–6 until termination.

A false bailout result ends normally. The host iteration ceiling also ends the
orbit. A required non-finite orbit value produces the `nonFinite` event and
terminates instead of being repaired silently.

`LastSqr` is a saturating post-loop decision channel. If `z` is finite but its
squared magnitude overflows binary32, the step stores positive infinity in
`LastSqr` without emitting `nonFinite`; a predicate that independently inspects
finite `z` can therefore escape normally. `LastSqr` is exempt only from the
post-step finite-state sweep. Reading that positive-infinity value through an
ordinary language expression, including a bailout comparison, crosses the checked
numeric boundary and emits `nonFinite`.

## 4. Parameters and system values

The host supplies or initializes these names:

| Name | Type | Meaning |
|---|---|---|
| `pixel` | complex | Current plane coordinate |
| `c` | complex | Runtime-selected formula constant |
| `z` | complex | Writable orbit state; starts at canonical zero |
| `zPrev` | complex | Previous iteration's `z`; zero before `init` |
| `LastSqr` | real | Squared magnitude of `z` at the end of the most recently completed `loop`; zero before the first loop |
| `pi`, `e` | real | Mathematical constants |
| `maxit` | real | Host iteration ceiling |
| `ismand` | boolean | Parameter-plane versus Julia-mode selector |
| `p1`-`p5` | complex | Classic interoperability inputs |
| `fn1`-`fn4` | function | Classic interoperability function slots |

`zPrev` and `LastSqr` are runtime-maintained channels, not external host inputs.
A host MUST NOT override them.

When `ismand` is true, the host supplies the current `pixel` as `c`. When
`ismand` is false, the host supplies the Profile's Julia constant as `c`.

A CPU state initializes an unbound `p1`-`p5` slot to complex zero. GLSL exposes
an unbound slot as a uniform, but a conforming host MUST leave or supply that
uniform as complex zero. When a named numeric parameter declares `classic pN`,
the slot mirrors that parameter's resolved value, so a bare `pN` read and a read
of the named parameter observe the same value on both backends.

A direct `fn1`-`fn4` call is valid only when the Definition declares a function
parameter with the matching `classic fnN` binding. The bound slot mirrors the
resolved named selection. An unbound `fnN` call fails with
`unmapped-function-slot`; it does not select an implicit function.

## 5. Standard library v1

The complete frozen function-name surface is:

```text
abs sqr sqrt exp log recip conj flip real imag cabs round atan2
sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh
cotanh cosxx identity
```

All functions are unary except `atan2`. Function parameters may select any name
frozen in this section except binary `atan2`, including the real-returning `real`,
`imag`, and `cabs`. A call through a function parameter is statically
complex-valued; a selected real-returning function is promoted to `(result, 0)`
by both backends.

| Function | Normative meaning |
|---|---|
| `abs(z)` | Component-wise absolute value |
| `sqr(z)` | `z * z` |
| `sqrt(z)` | Principal complex square root |
| `exp(z)` | Complex exponential |
| `log(z)` | Principal log with argument in `(-pi, pi]`; `log(0)` is non-finite |
| `recip(z)` | `1 / z` |
| `conj(z)` | Complex conjugate |
| `flip(z)` | Component swap `(x, y) -> (y, x)` |
| `real(z)`, `imag(z)` | Real scalar projection of the selected component |
| `cabs(z)` | Euclidean complex modulus as a real |
| `round(z)` | Component-wise rounding; exact halves away from zero |
| `atan2(y, x)` | Real `atan2` of the arguments' real projections |
| `sin`, `cos`, `tan` | Principal circular functions |
| `asin`, `acos`, `atan` | Principal inverse circular functions |
| `sinh`, `cosh`, `tanh` | Principal hyperbolic functions |
| `asinh`, `acosh`, `atanh` | Principal inverse hyperbolic functions |
| `cotanh(z)` | Reciprocal hyperbolic tangent |
| `cosxx(x + i*y)` | `cos(x) * cosh(y) + i * sin(x) * sinh(y)`; same real component as `cos`, opposite imaginary sign |
| `identity(z)` | Returns `z` after per-component binary32 rounding, canonicalizes exact zero to `+0`, and propagates non-finite input to the versioned event |

`round` MUST use an explicit halves-away-from-zero equivalent on CPU and GLSL.
An implementation MUST NOT delegate this rule to host-dependent or GLSL-native
rounding behavior.

The principal inverse functions use these frozen definitions:

- `asin(z) = -i * log(i*z + sqrt(1 - z*z))`;
- `acos(z) = pi/2 - asin(z)`;
- `atan(z) = (log(1 + i*z) - log(1 - i*z)) / (2*i)`;
- `asinh(z) = log(z + sqrt(z*z + 1))`;
- `acosh(z) = log(z + sqrt(z - 1) * sqrt(z + 1))`; and
- `atanh(z) = (log(1 + z) - log(1 - z)) / 2`.

Their cuts are part of stdlib v1. `asinh` has cuts on the imaginary axis from
`+i` and `-i` outward. `acosh` has the real cut `(-infinity, 1]`. `atanh` has
real cuts `(-infinity, -1]` and `[1, infinity)`; `atanh(1)` and `atanh(-1)`
produce the versioned non-finite event.

`cabs` and the radii used by `log` and `sqrt` share the operation order
`sqrt(re^2 + im^2)` with per-primitive `standard32` rounding on CPU and GLSL.
A separately rounded double-precision `hypot` is not conforming. One-sided
nonzero inputs retain their imaginary sign on a cut; exact signed zero uses the
canonical upper-cut value.

The optional Classic guards alter only diagnosed singular behavior for the
Definition that declares them:

- `zero-division`: complex division and `recip` return `(0, 0)` when the
  divisor's squared magnitude is zero in the active surface precision, and when
  it overflows so that finite division flushes to zero like `x / Inf === 0`;
- `floored-log`: the log radius is floored at `1e-20` at exact zero; and
- `hyperbolic-clamp`: hyperbolic inputs are clamped to `[-80, 80]`. This bounds
  finiteness only. A row whose orbit crosses the clamp and no longer matches its
  Classic binary64 evidence remains held.

The declared guarded row set lives in
`src/engine/formulas/v1/classic-dialect-guards.ts`. It changes only with per-row
diagnosis evidence and a maintainer decision. Guards are applied on CPU and GLSL,
including `fn1`-`fn4` dispatch. They do not change grammar, safety limits,
identity rules, or rights state. The parser accepts any syntactically valid guard
list without consulting Formula ID or the ledger. Ledger membership and evidence
are enforced by publication/validation review, not at parse time.
A `@classic-guards` directive MUST NOT be added, removed, or edited without
recorded evidence for that Formula Record and a maintainer decision.

Classic lowering treats `flip` on a statically real operand as the identity;
canonical v1 `flip(z)` remains the component swap. A Classic `fn1`-`fn4` slot
without an explicit function default lowers to `identity`, then follows the same
bound-slot execution contract as other migrated source. Lowering MAY introduce
a fresh local binding, but MUST NOT make an immutable parameter or host input
writable.

Any visual change to a pinned Definition caused by stdlib semantics requires a
new stdlib version and Upgrade & Compare. An implementation MUST NOT mutate an
existing work in place.

## 6. NumericProfile `standard32`

`standard32` is the only executable NumericProfile in v1.

- Storage and arithmetic target IEEE-754 binary32 behavior.
- Every specified primitive rounds at its language-visible boundary; merely
  rounding at the end of a whole expression is not conforming.
- Evaluation order is source-order and left-to-right. Reassociation and
  contraction are disabled unless proven equivalent under the profile.
- Exact `-0` becomes `+0` at visible operation and branch-sensitive boundaries.
- CPU and WebGL conformance uses declared numeric tolerances plus matching orbit,
  event, and continuation behavior. The profile does not promise bit-identical
  pixels across GPU vendors.
- An unsupported NumericProfile MUST open read-only with metadata and any existing
  preview still available. It MUST NOT silently run as `standard32`.
  **Open Compatible Copy** creates a new compatible copy, records lineage to the
  unchanged original, and never overwrites that original.

v1 currently exposes only `standard32`; unsupported-profile handling is therefore
unreachable on the active surface and regression gate C10 remains pending. The
preceding MUST is a future reader/writer requirement, not a claim of exercised
v0.4.19 product behavior.

## 7. Termination and safety envelope

The parser rejects a source input above 65,536 UTF-8 bytes before parsing. A
published pinned Definition source MUST fit the same ceiling. The default v1
envelope is identical for Standard, Mine, and future Community source:

| Limit | Maximum |
|---|---:|
| Source input and pinned Definition source | 65,536 UTF-8 bytes |
| Generated shader | 262,144 bytes |
| Parameters | 64 |
| Locals | 256 |
| AST nodes | 4,096 |
| Expression depth | 64 |
| Statements | 1,024 |
| Control-flow nodes | 128 |
| Control-flow depth | 16 |

A caller MAY request stricter integer limits. It MUST NOT raise these maxima.
Invalid, negative, non-integral, or over-budget input fails closed with a stable
reason. New executable source never uses the legacy 256 KiB allowance; legacy
source above 65,536 bytes may be preserved only through the reader/writer rules
in the
[Unified Formula Library invariants](unified-formula-library-v1.md#non-negotiable-invariants)
and the Classic import behavior in the
[compatibility contract](frm-compatibility-v1.md).

Runtime terminates on a false continue predicate, host iteration ceiling, or the
versioned `nonFinite` event. Division by zero and required non-finite inputs
produce versioned result/event state; they MUST NOT escape as host exceptions.
Backends MUST NOT replace an unsafe expression with a default formula, default
radius, zero, or a source-specific exception.

## 8. Canonicalization, revisions, and conformance

The canonical formatter emits:

- the three REQUIRED directives in fixed order;
- `@classic-guards`, when present, immediately after `@numeric-profile`, with
  values in the frozen order `zero-division, floored-log, hyperbolic-clamp`
  after omitted values are removed;
- one formula and ordered sections;
- two-space section indentation and four-space statement indentation;
- one statement or parameter per physical line; and
- stable spacing and parentheses that preserve non-associative expressions.

Emitting the canonical formatter form and parsing it again MUST reproduce the
same formula name and semantic IR. Source order of executable statements is semantic.
Parameter and local arrays are name-sorted only in semantic serialization, so
non-semantic declaration ordering cannot create a different semantic hash.

Known v0.4.19 implementation deviation and non-conformance with §1: the front-end
parser can return IR for a parenthesized nested magnitude even though nested
magnitude is not valid in the canonical formatter form; the formatter cannot
round-trip that input.
Publication validation MUST hold such input, and authoring tools MUST reject it.
A 2026-08-20 audit of the
513 published Definitions and all examples in this reference found zero nested
magnitudes. This deviation does not grant a language extension and remains open
until the front end rejects the non-canonical input before writer activation.

Known v0.4.19 Unicode-validation deviation: the front end rejects an unpaired
surrogate when another UTF-16 code unit follows it, but a terminal unpaired high
surrogate can reach ordinary comment handling. Canonical writer/import activation
MUST remain blocked until every unpaired surrogate is rejected before UTF-8
measurement or hashing. No published pinned Definition or example contains one;
acceptance by the current front end does not make it valid source under §2.1.
While that terminal case is accepted, `TextEncoder` hashes replacement U+FFFD
bytes, so `sourceRevision` is not byte-injective for this invalid input. This is an
additional reason writer/import activation remains blocked.

Known v0.4.19 host-integration limitation: the GLSL backend emits an unbound
`p1`-`p5` slot as a uniform and cannot diagnose a nonzero host value. The host's
zero-value obligation in §4 is therefore part of conformance. A 2026-08-20 audit
found no published Definition that reads an unbound numeric Classic slot; broader
host/device enforcement remains an integration gate.

The active published reader and the gated writer use different validation layers:

- `sourceRevision` is lowercase SHA-256 of the exact UTF-8 Definition source bytes
  supplied to the reader. Hashing does not normalize comments, formatting, line
  endings, or a terminal LF.
- `semanticHash` is lowercase SHA-256 of the versioned canonical semantic-IR
  serialization. It includes directives, declarations, guards, and executable
  meaning, but excludes ordinary comments, insignificant formatting, Formula
  name, Profile, Record, and backend artifacts.
- `hashFrmLikeV1(source, ir)` is the byte-exact primitive used by the published
  reader. CRLF- or comment-bearing input with the same semantic IR therefore has
  a different `sourceRevision` but the same `semanticHash`.
- `canonicalizeFrmLikeV1(ir)` emits the deterministic writer form. The gated
  Safety Envelope rejects a writer candidate whose bytes differ from that form
  as `source-not-canonical` before persistence or publication.

A comment, formatting, line-ending, terminal-LF, or formula-header edit may alter
`sourceRevision` without changing `semanticHash`. A semantic edit MUST alter
`semanticHash`. A backend optimization MUST alter neither. Current published
Definition bodies are pinned and verified byte-for-byte; this contract does not
claim that every existing body is byte-identical to the gated writer form.

A conforming implementation MUST pass, at minimum:

1. pinned Definition source -> typed IR -> canonical formatter form -> identical
   typed IR;
2. stable revision and semantic hashing;
3. fail-closed negative grammar, type, definite-assignment, and safety fixtures;
4. CPU/GLSL stdlib conformance for branch cuts and non-finite events;
5. CPU/WebGL orbit, event, and continuation comparisons under `standard32`; and
6. no Formula-ID, scope, provenance, rights, or trust branches in parser,
   compiler, backend, or safety code.

## 9. Compatibility and availability

FractalPark v0.4.19 has 677 Standard Formula identities. The current publication
decision binds pinned executable Definition source, a Profile, runtime artifacts, and
Record actions to 534 published Definitions. The remaining 143 Records are held
and do not expose runnable source or actions. These numbers are release facts,
not language privileges: every executable Definition uses this same contract.

Published Standard source can be viewed and downloaded from its Formula Record.
Open and anonymous Remix consume the pinned Definition and Profile through the
published runtime. A diagnostic preview is evidence about preview generation,
not proof that language conformance failed.

The standalone FRM Editor remains a Classic-compatible authoring surface. Its
examples and `frmSemanticsVersion` controls are governed by the legacy
compatibility specification. Canonical FRM-like v1 writer and import activation
remains gated, as do new cloud writers. Until those gates are enabled, this
normative reference accurately describes published Standard Definitions and the
execution contract; it does not promise that pasting the canonical v1 formatter
form into the standalone Editor will work.

Classic `.frm` remains an import dialect, not a second public runtime tier. A
Classic source must be scanned, explicitly selected when multi-entry, lowered,
and validated. Unsupported or ambiguous input remains readable where possible
but MUST NOT be presented as a conforming executable v1 Definition.

Future coloring programs, materials, compositing, arbitrary loops, user-defined
functions, macros, preprocessing, and a Rust/WASM authoring language are outside
v1. FDL remains a future research name and does not describe this runtime.
Adding any of them requires a new versioned contract rather than permissive
parsing.
