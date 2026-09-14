# Development Validation and CI Policy

This is the technical authority for selecting FractalPark validation scope.
The workflows implement automatic gates; the cross-surface contract lives in
[Fractal Content and Creation Model](../specs/fractal-content-and-creation-model.md).
Planning, approvals, delivery status, and device handoff remain in private
project management documents. This policy does not authorize external writes.

## Select scope before implementation

State the affected boundary, change class, planned checks, and why a full
specialist run is or is not necessary. Classify by actual behavior and
dependencies, not by a file or test containing the word `Julia`.

| Change class | Examples | Local validation | PR validation |
|---|---|---|---|
| Application | Analytics, UI, copy, ordinary data loading | Focused tests; relevant browser flow for visible behavior; affected lint | Standard Linux CI and Vercel Preview |
| Cross-surface state/recovery | Formula identity handoff, cloud preview loading, save/reopen, Gallery/Community/Remix | Focused contract tests and affected representative card/detail/reopen/refresh flows from the consumer matrix | Standard gates; relevant browser regression; full library WebGL is not required solely for an application recovery change |
| Rendering binding/capability | Runtime mode qualification, uniform/parameter mapping, reviewed execution adapter | Focused binding and negative tests plus relevant WebGL cases | Standard gates and related rendering checks; engine authority changes retain conservative full automatic specialist checks |
| Math, compiler, or published assets | Recurrence, initialization, bailout, GLSL, FRM compiler, published Definition/Profile, execution fingerprint | Relevant semantic/authority tests; review affected assets and compatibility fixtures | Standard gates and every affected full specialist workflow, including coverage/report verification |

Dependency, test-environment, and specialist-runner/verifier changes may affect
all cases even if they do not change a formula. Run the corresponding full
specialist checks. Documentation-only changes use link/content/diff checks
locally; required PR gates still apply. Workflow changes require trigger-scope
checks; changes to specialist execution or qualification also require its full
run. No browser or GPU run is needed for prose alone.

## Local development and commit

- Use Node 22, matching CI. During development run focused checks first.
- Complete the checks required for the classified change before committing.
  Do not repeat a successful lint/build/test run for unchanged source merely
  because a commit or push is requested. Always inspect the staged diff and
  run `git diff --cached --check`.
- Run a local production build when route/server/client composition, build
  configuration, generated output, or type correctness needs verification.
  Do not require both a local full-library GPU audit and the same audit in CI
  for an ordinary application change.
- Linux-only filesystem behavior is verified by Linux CI. Record known local
  failures with their actual result; do not repeatedly rerun unchanged
  environment failures or describe a failed local suite as green. Investigate
  failures in changed behavior and new failure cases.
- Browser automation must not generate production analytics or modify cloud
  data as a side effect. Use fixtures and block external analytics requests
  for local verification unless the relevant integration action is authorized.

## Push, PR, merge, and deployment

1. Push a feature branch when the change is ready for remote review or Preview.
   Feature-branch pushes do not run the standard Actions workflow. Preview
   deployment is not production acceptance.
2. Create a PR when preparing to merge into `main`. Do not create a PR solely
   to compensate for a known local platform limitation unless PR creation is
   authorized. If review/merge is the task, the PR provides the Linux evidence.
3. Standard `CI` runs on PRs and `main` pushes. It runs lint, browser-independent
   Vitest (excluding the dedicated Julia renderer evidence v2 test), formula
   publication isolation, build, and built publication isolation on Ubuntu.
   "Linux CI" is this workflow, not an additional validation layer. Keep full
   browser-independent tests here rather than maintaining a fragile test map.
4. Wait for required `gates` and `Vercel` checks plus relevant specialist gates.
   A successful Preview comment check does not replace deployment success.
   Do not bypass protections, cancel a required current check, or edit gates
   to make an unexpected failure disappear.
5. Merge and production actions require their own authorization. The new
   `main` commit has its own CI and automatic deployment; verify their exact
   SHA and results. Do not rerun local checks merely because the merge SHA is
   new. Behavior acceptance uses the affected production flow.

## Automatic specialist workflows

The YAML files are the exact executable path filters. Filters are conservative
approximations of dependencies; they do not replace the semantic classification.

| Workflow | Automatic scope | Full run means |
|---|---|---|
| [Julia Renderer Evidence](../../.github/workflows/julia-renderer-evidence.yml) | Julia authority assets; formula engine/FRM/plugin/shader sources; Julia workers, builders and verifiers; explicit renderer-evidence and WebGL release-gate tests; shared environment and workflow inputs | Four renderer shards, five activation shards, and both coverage verifiers |
| [Published Formula WebGL](../../.github/workflows/published-formula-webgl.yml) | Published runtime/preview/rights inputs, formula engine, and its runners/configuration | All published formula shards and report coverage |
| [Formula Record Assets](../../.github/workflows/formula-record-assets.yml) | Formula engine, Record generation/verification inputs, and published assets | The existing asset verification workflow |

Static consumer inventory and ordinary `julia-*.test.ts` edits do not, by their
name alone, require a full Julia GPU audit. The dedicated evidence/gate tests
remain explicit triggers. Engine and qualification changes still trigger full
checks; an application preview loader can instead use a representative WebGL
flow without rerendering every formula.

If a genuine high-risk dependency is missing from the filters, run the related
workflow through its existing manual dispatch and correct the filter in a
reviewable change. If a low-risk change triggers a full audit, inspect the
dependency before waiting or cancelling; propose a filter correction rather
than silently skipping the audit. The implementation of a targeted GPU runner
or a new orchestration system is not required by this policy.

## Reuse evidence and report it once

Reuse checks only when source, relevant artifacts, dependencies, configuration,
and environment remain applicable. New behavior changes or unexplained failures
justify new checks. Reports record the tested revision, scope, result, local
limitations, specialist reason, and remaining production acceptance. Formal
releases complete the applicable version gates; they do not automatically need
every unrelated historical GPU audit or regenerate frozen evidence.
