# Formula Content Manifest and FRM Surface Contract

- Status: Accepted
- Date: 2026-07-26
- Target release: FractalPark v0.4.13
- Scope: Formula Atlas, formula guides, FRM Guide, and FRM Editor

## Purpose

This specification freezes the public formula content model and the boundary
between editorial content, runtime formula facts, canonical render state, and
FRM authoring. It specializes the
[Fractal Content and Creation Model](fractal-content-and-creation-model.md)
without creating another formula registry.

The formula catalog and plugin registry remain authoritative for formula
identity, family, capabilities, uniforms, and approved defaults. The content
manifest owns only public routes, editorial structure, references, and
relationships.

## Formula Content Model

`src/content/formula-manifest.ts` will expose entries with this contract:

```ts
interface FormulaContentEntry {
  formulaId: string;
  slug: string;
  math: {
    id: string;
    tex: string;
    plainText: string;
  }[];
  history?: {
    sourceIds: string[];
  };
  frm?: {
    sourcePath: string;
  };
  references?: {
    id: string;
    kind: 'primary' | 'reference' | 'further-reading';
    title: string;
    url: string;
  }[];
  parameters?: {
    id: string;
    uniformName?: string;
  }[];
  artworkIds: string[];
  relatedFormulaIds: string[];
  faqIds: string[];
}
```

The manifest must not repeat a formula display name, family, difficulty,
capability, uniform descriptor, default render state, or localized prose.
Those values are joined from the catalog, plugin registry, canonical formula
Document, and locale messages.

### Locale message contract

Each entry uses its public slug to derive these message keys:

```text
formulas.entries.<slug>.title
formulas.entries.<slug>.summary
formulas.entries.<slug>.math.<id>.label
formulas.entries.<slug>.math.<id>.explanation
formulas.entries.<slug>.history
formulas.entries.<slug>.visualCharacteristics
formulas.entries.<slug>.parameters.<id>
formulas.entries.<slug>.faq.<id>.question
formulas.entries.<slug>.faq.<id>.answer
```

The history key is required only when `history` exists. Parameter keys are
required only for declared parameter entries. English and Chinese messages
must be present together and non-empty.

## Frozen Formula Guide Set

The first Formula Atlas release has exactly 21 formula guides. Public slugs
are explicit, shared by both locales, and must not be derived from display
names at runtime.

| Formula ID | Public slug | Family |
|---|---|---|
| `mandelbrot` | `mandelbrot` | classic |
| `lambda` | `lambda` | classic |
| `mandelbox` | `mandelbox` | classic |
| `perpendicularCeltic` | `perpendicular-celtic` | classic |
| `quadJulia` | `quartic-julia` | classic |
| `burningShip` | `burning-ship` | burning-ship |
| `airship` | `airship` | burning-ship |
| `newton3` | `newton-3` | newton |
| `newtonCosh` | `newton-cosh` | newton |
| `magnet1` | `magnet-type-1` | magnet |
| `magnet2` | `magnet-type-2` | magnet |
| `phoenixMulti` | `multi-phoenix` | phoenix |
| `coshMandelb` | `cosh-mandelbrot` | transcendental |
| `buffalo` | `buffalo` | exotic |
| `circleInversion` | `circle-inversion` | exotic |
| `invertedLambda` | `inverted-lambda` | exotic |
| `mcMullen23` | `mcmullen-2-3` | exotic |
| `rationalMap1` | `rational-map-1` | exotic |
| `spider` | `spider` | exotic |
| `zaslavskyMap` | `zaslavsky-map` | exotic |
| `zubieta` | `zubieta` | exotic |

`frm` and `editor` are reserved below `/formulas` and cannot be formula
slugs. Published formula slugs are permanent. A later title correction does
not change a route.

The guide set must equal the unique built-in formula set resolved from all 26
entries in `gallery-presets.json`. A preset change that alters that set fails
validation until this contract and its manifest are intentionally updated.

## Formula Routes and Page Responsibilities

| Route | Responsibility |
|---|---|
| `/[locale]/formulas` | SSR Formula Atlas with 7 families, all 94 catalog formulas, 21 guide links, and the FRM creation path |
| `/[locale]/formulas/frm` | SSR FRM language guide; not a family, catalog formula, or formula guide entry |
| `/[locale]/formulas/editor` | Standalone FRM authoring workspace within the Formulas information architecture |
| `/[locale]/formulas/[slug]` | SSR page for one of the 21 frozen guide slugs |

The Atlas directory links guide formulas to their guide pages. Other catalog
formulas link directly to Explore using their canonical formula Documents.
No thin page is generated for the other formulas.

The Editor is not a top-level Navbar item. Formula Atlas, the FRM Guide,
formula pages with FRM examples, About, and the Explore custom-formula area
may link to it contextually. Explore remains the primary full creation
surface.

### Formula Atlas page order

The Atlas landing page renders these server-readable sections:

1. Hero that states 7 families, 94 catalog formulas, 21 in-depth guides, and
   a separate FRM learning and creation path.
2. Capability summary derived from stable catalog and renderer facts.
3. Seven family summaries with catalog-derived counts and anchor links.
4. A distinct Create Your Own Formula section with Learn FRM and Open Formula
   Editor actions. It is not an eighth family.
5. The 21 guide cards grouped by family.
6. The complete 94-formula directory. Guide entries link to content pages;
   all other entries link to Explore with their canonical formula state.
7. Parallel learning-to-creation calls to action for built-in formulas and
   FRM authoring.

Search, filtering, and sorting are optional progressive enhancements. With
JavaScript disabled, the complete directory and every destination remain
available.

### Formula guide page order

Every formula guide uses the same information hierarchy:

1. breadcrumb and Hero with family, difficulty, summary, canonical image, and
   Open in Explorer;
2. original Overview;
3. one or more mathematical definitions and variable explanations;
4. optional Origin and History backed by the entry's references;
5. optional compiled FractalPark-compatible FRM representation;
6. Visual Characteristics based on actual FractalPark output;
7. formula-specific Parameters to Explore;
8. Remix and configured artwork examples;
9. two to four explicitly related formulas;
10. SSR FAQ and References.

Pages do not show internal TypeScript, generated GLSL, or a GitHub
implementation link. The canonical image, default Explorer destination, and
Remix state all derive from one canonical formula Document.

## Canonical Formula Document Contract

`buildFormulaDefaultDocument(formulaId)` is the only constructor for a
built-in formula's approved starting state.

### Input and output

- Input is a built-in catalog formula ID.
- Unknown IDs throw an explicit error; they never fall back to Mandelbrot.
- Output is a normalized `FractalDocument` derived from
  `DEFAULT_FRACTAL_DOCUMENT` and catalog selection defaults.
- Each of the frozen 21 guide formulas has an explicit approved
  `defaultProfile`. Other catalog formulas use a profile when present or fall
  back to catalog bounds, suggested palette, and plugin uniform defaults.
- Transform and render state retain shared Document defaults.
- Canonical formula Documents contain no animation, assets, or provenance
  metadata.

Formula pages, Atlas-to-Explore links, formula thumbnails, Open Graph images,
and formula Remix links consume this exact result. They cannot add
surface-specific visual defaults.

### URL round-trip boundary

The supported Explore projection includes:

- scene bounds: center, zoom, and rotation;
- formula ID, Mandelbrot/Julia mode, Julia constant, power, and formula
  plugin parameters;
- palette or custom gradient, outside and inside coloring IDs, orbit trap,
  lighting, and supported coloring plugin parameters;
- transform ID and transform plugin parameters;
- iteration count, SSAA, and adaptive-iteration flags;
- view animation keyframes when a non-formula Document uses them.

Assets, metadata, coloring pipeline-only state, and animation tracks are not
part of the legacy query codec. The formula builder must not rely on those
fields. Contract tests compare the normalized supported projection after
`documentToExploreHref` and decode; they do not require byte-identical query
ordering. Plugin parameters equal to their registered descriptor defaults may
be omitted from the query; round-trip checks resolve an omitted value through
the same descriptor before comparing runtime behavior.

## Formula Manifest Validation

Build-time tests must reject content unless all of these invariants hold:

- the manifest contains exactly the frozen 21 IDs and slugs;
- every formula and related formula resolves in the catalog;
- each slug is unique, matches `^[a-z0-9-]+$`, and is not reserved;
- each entry has at least one unique math item, two FAQ items, and one related
  formula;
- every TeX expression renders on the server and has non-empty plain text;
- every referenced locale key exists in both locales;
- reference IDs are unique, URLs use HTTPS, and history source IDs resolve
  within the same entry;
- Wikipedia may be further reading but cannot be the only source for a claim
  about authorship, date, discovery, or priority;
- an FRM source file exists and passes `compileFrm` whenever `frm` is present;
- a declared uniform exists on the matching formula plugin;
- artwork and related-formula references resolve to their authoritative
  manifests or catalogs.

History and FRM sections are optional facts, not template-completion
requirements. Missing evidence or an inexpressible formula must omit the
section instead of publishing speculation or an unmarked approximation.

## FRM Guide Content Contract

The FRM Guide is a single SSR learning page with these sections in order:

1. What Is FRM
2. FRM Support in FractalPark
3. Formula Anatomy
4. Syntax Guide
5. FRM to AST to GLSL Pipeline
6. Progressive Tutorials
7. Errors and Diagnostics
8. Examples, Next Steps, and References

Its support claims are generated from, or reviewed against, the lexer,
parser, AST, validator, type system, code generator, `compileFrm`, source-map
implementation, and tests. Historical context is independently written from
reliable sources and is not copied or translated from an existing tutorial.

### Compatibility vocabulary

| Level | Meaning in the Guide |
|---|---|
| Supported | The syntax or behavior has a passing compiler test and can be used without semantic qualification |
| Adapted | FractalPark accepts the construct but documents a deliberate semantic difference or a FractalPark extension |
| Unsupported | The current compiler or file workflow cannot preserve and run the construct; the Editor must diagnose it without silently rewriting source |

### v0.4.13 compatibility baseline

| Level | Frozen baseline |
|---|---|
| Supported | One formula declaration; `init`, `loop`, and `bailout`; assignments and user variables; real and complex literals; arithmetic, comparison, logical, unary, and magnitude expressions; `if`/`elseif`/`else`/`endif`; `z`, `c`, `pixel`, `zPrev`, `p1`-`p5`, constants, and tested built-in functions; comments; structured diagnostics and FRM source mapping |
| Adapted | `ismand` maps to the current Mandelbrot/Julia runtime mode; `fn1`-`fn4` use compile-time dispatch; `; @mode: native`, `; @default-view`, and `; @default-coloring` are FractalPark extensions and the default directives apply only in native mode |
| Unsupported | Multi-formula file selection, automatic conversion of classic Fractint dialects, arbitrary source directives, non-ASCII identifiers, user-defined functions or macros, preprocessor features, and any construct not accepted by the current compile pipeline |

The Guide must not claim full Fractint compatibility. A later compiler change
updates this matrix and its tests in the same logical change.

### Shared progressive examples

The P0 tutorials use these stable IDs from the shared example registry:

| Example ID | Teaching role |
|---|---|
| `starter-brot` | Minimal quadratic formula and core sections |
| `parameter-drift` | Parameters and Julia-oriented variation |
| `orbit-echo` | Stateful iteration with `zPrev` |

The Guide, Editor example picker, and tests resolve the same source and
experience hint by ID. Every published example compiles during the build.
Guide links use `/[locale]/formulas/editor?example=<id>`; source code is never
placed in the URL.

## Math and FRM Presentation

- `MathBlock` renders version-controlled TeX on the server with KaTeX HTML,
  MathML, and non-empty plain-text fallback.
- `FrmCodeBlock` renders a semantic server-side `<pre><code>` view using the
  project lexer or the same token definitions.
- FRM source is escaped before token markup. Highlighting failure falls back
  to complete plain text.
- Copy is an optional client enhancement. Line numbers are not included in
  copied text.
- Long math and code scroll within their containers on narrow screens and do
  not create page-level horizontal overflow.
- Math is the authoritative definition. An FRM block is an independently
  written, compiled FractalPark-compatible representation, not historical
  source code or the internal generated GLSL implementation.

## FRM Editor Boundary

The standalone Editor owns source authoring, lint, explicit compilation,
diagnostics, a compiled preview, and local formula defaults. It reuses the
owner-scoped cloud formula library, `compileFrm`, plugin registration, cache
invalidation, experience hints, and shared formula resolver. Before an
explicit cloud save, source and preview stay only in the current tab.

### P0 workflow

- CodeMirror is the visual center of a desktop 60/40 editor-preview layout;
  mobile uses explicit Editor and Preview modes.
- Lint may update while typing, but the WebGL preview changes only after an
  explicit successful Compile.
- A failed compile preserves the last successful preview.
- Preview controls are limited to pan, zoom, reset, and setting the formula's
  default bounds/basic coloring hint.
- Save is explicit, requires sign-in, and uses the owner-scoped cloud formula
  library and its 50-item account quota. Cloud-disabled/unavailable saves fail
  closed and never restore browser persistence.
- Replacing dirty source or leaving the workspace requires confirmation.
- `Save & Open in Explorer` requires a successful compile and cloud save, then
  hands off the cloud formula ID through
  `/[locale]/explore?open=custom-formula&formula=<formula-id>`. The URL never
  contains FRM source. Explore resolves and registers the cloud formula (using
  an owner detail read in a fresh tab), applies its experience hint, and
  removes both one-time intent parameters from the canonicalized URL.
- Missing, invalid, cross-account, or cloud-unavailable formula IDs produce an
  explicit error and never resolve to a built-in formula or local fallback.

Full coloring controls, transforms, render/SSAA/iteration controls, animation,
image or project export, Gallery saving, and fullscreen playback remain in
Explore.

### Example query contract

`?example=<id>` accepts only a shared registry ID. It preloads source and its
experience hint without compiling or saving, marks the document dirty, and
preserves the query for refresh and sharing. The canonical URL and sitemap
entry remain the query-free Editor route. Local IDs, source, diagnostics, and
preview state never enter SSR metadata or structured data. The query-free
route is indexable and exposes localized title, description, canonical and
alternate links, `WebPage`, and `BreadcrumbList`.

### Local `.frm` file contract

- Import reads a browser-local UTF-8 `.frm` file of at most 256 KiB and never
  uploads it.
- Imported text is preserved exactly, loaded through the same source
  preflight path as paste, and is not compiled or saved automatically.
- A supported single formula can be compiled, previewed, and saved.
- Multi-entry or incompatible source remains visible with diagnostics; the
  Editor must not choose the first entry, rewrite source, or fall back to
  another formula.
- Download always exports the current source text, even when compilation
  fails, using a sanitized formula name or a stable fallback filename.

Multi-entry selection, classic syntax conversion, compatibility reports,
collaboration, tabs, version history, and automatic draft saving remain outside
this contract; owner-scoped cloud persistence was added by v0.4.16.

## Shared Resolver Contract

Editor and Explore resolve formulas through the same boundary:

- a catalog ID resolves to a registered built-in plugin;
- a cloud ID resolves source from the owner detail API (or current session
  registration), compiles, registers, and returns the merged experience hint;
- a transient in-session compiled plugin may support an unsaved preview;
- built-in ID conflicts, missing source, compile failures, and registration
  failures have distinct typed results;
- no failure path silently selects another formula.

The resolver does not own storage. Callers provide owner cloud records,
session registrations, or portable snapshots through named boundaries.
