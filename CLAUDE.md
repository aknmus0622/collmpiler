# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Phase 1 spike. The design documents (written in Japanese) are still the bulk of the repo. The code:

- `packages/core/index.ts` — `defineComponent(...).cases(...)` (a component declared as a value, with types derived from it), `DecisionTable`, `applyDecision`, `applyFormula`, `bindSpecification`, `createState` (concrete execution). Zero dependencies. `packages/core/test/*.check.ts` are type-level checks: they are verified by `tsc` passing (wrong usages carry `@ts-expect-error`), not by the test runner.
- `packages/cli/src/` (no `aac` bin yet; `compile.ts` and `implement.ts` are temporary entry points)
  - `loader.ts` — the single `SpecLoader`. It normalizes a component into the internal `SpecModel` + behaviours form the rest of the CLI uses (inputs under `model.actions`; `from` / `where` / cases under behaviours), so the IR shape is independent of how the component is written.
  - `extract.ts` — recording-Proxy abstract execution → IR. `lint.ts` — token whitelist applied to each case body first.
  - `generate.ts` — IR → test-side files. `runtime.ts` — PBT runtime (fast-check) called by the generated `verify.ts`, plus `selfCheck`, the spec-only simulation run before any agent.
  - `strategy.ts` — the swappable implementation step (an external agent command). `gates.ts` — entry gate (isolated sandbox with allowlisted inputs) and exit gate (collect allowlisted outputs, checks, PBT). `request.ts` — the agent-facing request text. `loop.ts` — entry gate → strategy → exit gate → feedback.
  - `check.ts` + `scan.ts` — mechanical checks on what the LLM wrote (imports and generated files only; adapter contents are unrestricted).
  - `mutation.ts` — the mutation gate: a swappable `MutationStrategy` (built-in literal mutation) plus `judge`, the pass rule owned by the gate. `guide.ts` — default design guidance embedded in the request.
- `specs/` — the example: `order.component.ts` (Layer 1: boundary, decision tables, cases) and `order.binding.ts` (Layer 2). Only one component can be loaded at present.
- `examples/checkout-ts/` — `src/` is production code written by an LLM agent from the IR; `aac/` is the generated test side. Do not hand-edit `src/` to make verification pass; rerun the loop.
- Run tests through `pnpm test` (explicit glob). A bare `node --test` executes every file under any `test/` directory, including fixtures and temporary work directories.
- Tests: `extract.test.ts` pins what the Proxy can and cannot capture, `lint.test.ts` the case-body whitelist, `loop.test.ts` the loop and the checks (using `test/fixtures/scripted-agent.ts` as a stand-in LLM). Update them when behaviour changes.

The repo is a colocated Jujutsu (`.jj/`) + git repository, so `git` normally shows a detached `HEAD`. Commit with `jj`.

## Commands

```bash
pnpm install
pnpm test                                             # all packages/**/*.test.ts
node --test packages/cli/test/extract.test.ts         # one file
node --test --test-name-pattern="スプレッド" "packages/**/*.test.ts"   # tests by name
pnpm -s run ir                                        # specs/ -> IR JSON on stdout, diagnostics on stderr; also runs the spec self-check
pnpm --filter example-checkout-ts verify              # PBT against examples/checkout-ts (add -- --seed N --path P to replay)

# Have an agent (re)write an implementation. Any command works; it runs in an isolated temp directory.
# --fresh discards the existing src/ and adapter; --transcripts <dir> saves the agent's stdout per attempt;
# --guide <file> replaces the default design guidance; --mutation auto|builtin|off selects the mutation strategy.
pnpm -s run implement --out examples/checkout-ts --fresh --max-attempts 3 \
  --agent 'claude -p "Read aac/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

`typescript` is deliberately not a dependency, so there is no type-check script; `tsconfig.json` exists for editors and for an externally installed `tsc -p .`. `fast-check` (in `@aac/cli`) is the only third-party dependency.

## What is being built

A "Specification & Verification Engine": specs are written as pure TypeScript data, compiled to a language-independent JSON IR, and used to generate property-based tests (PBT) that verify a production system from the outside. The platform deliberately owns *only* spec/verification and places no constraints on the target system's architecture.

The same thing goes by several names across the docs: `co-llm-piler` (repo), `aac` (CLI command), `@aac/*` (package scope), "SpecForge" and `aac-engine-monorepo` (older names).

## Documents and their precedence

| File | Role |
| --- | --- |
| `SPEC.md` | Concept and layer design, with the intended TypeScript schemas |
| `PACKAGE.md` | Long-term monorepo layout and the Phase 1–4 roadmap |
| `SELF_HOSTING.md` | Stage 0/1/2 bootstrap and fixed-point verification of the compiler |
| `DISTRIBUTION.md` | How the `aac` CLI is built and shared; the most recent and most concrete doc |

`DISTRIBUTION.md` is the most concrete on layout and distribution and **overrides `PACKAGE.md` and `SELF_HOSTING.md` where they conflict**; `SPEC.md` has been updated to match the code and is authoritative for the layers, the IR, and the LLM loop:

- Near-term layout is `DISTRIBUTION.md` §6, not the full `PACKAGE.md` tree. `plugins/` and `packages/compiler` are not to be created yet.
- The self-hosting fixed-point check compares **IR and generated sources** (`DISTRIBUTION.md` §8), not `stage1.js` vs `stage2.js` as in `SELF_HOSTING.md`, because no `.js` is built.
- Open questions are tracked in `DISTRIBUTION.md` §9 (multi-step path exploration, value objects and constraints, how strict the thin-adapter check should be, agent isolation).

## Architecture

Layers, from `SPEC.md`:

- **Layer 1 – Spec**: one component per unit (a scenario, a domain part, a UI part all take the same shape). `defineComponent({...})` declares the boundary and structure as pure data — `states` / `initial`; `actions` (each with `input`, `from` = states it can run in, `where` = preconditions); `queries` (values it asks its dependencies for, including external services' responses); `commands` (side effects on its dependencies); `data` (what it remembers between actions; unset initially); `formulas` and `invariants` (natural-language names only). Everything except `states`, `initial`, `actions` is optional. Literals written inline are inferred narrowly without `as const`, but an enum array pulled into a variable needs `as const` (a widened `string[]` is rejected by the types). Numeric fields can carry constraints (`{ type, min, max, around }`; `around` lists thresholds the PBT probes closely). Decision tables (DMN) are keyed by natural-language condition strings, declared with `as const satisfies DecisionTable<T>`, return constants only, need a `"default"` key, and must be exported (the IR names them by export name). `.cases({...})` then attaches, for every action, either a single function or a table keyed by conditions with a mandatory `default`; the outputs are transitions (`nextState`, `effects`, `set`). The order boundary → tables → cases is forced by type dependencies.
- **Layer 2 – Binding**: one `bindSpecification(Component, { tables, conditions, formulas, invariants })` call binds every natural-language name to a function. The condition names to bind are collected in the type system from `where`, case keys, and the rows of the tables passed in `tables`, so both a missing binding and an unused condition are compile errors. The same sentence means the same thing wherever it appears (rebinding it to a different function throws). Conditions are hit-policy Unique: more than one true is a `RuleConflictError`, none true means `default`. Conditions, cases and formulas see `status`, data, query answers, and action input in one flat namespace, so those field names must not collide (the loader rejects it). Invariants see only `status` and data, and verify the spec, not the implementation.
- **Universal IR**: flat, language-independent JSON extracted from Layer 1 (older docs call it "Layer 1.5" or "Layer 2.5").
- **Layer 3 – Verification**: PBT generated on the test side (fast-check for TS today; rapid/proptest planned). A trial is a sequence of actions from the initial state; failures shrink to the shortest sequence.
- **Adapter Contract**: `TargetSystemAdapter` (`setupIsolation(ports)` / `teardownIsolation` / `executeAction(action)` / `getCurrentState`) is the only boundary to the target system. The harness-owned `Ports` fakes answer queries and record commands; there is deliberately no way to inject state into the system — states are reached by executing actions, and remembered data is never read back directly, only observed through later behaviour.

Roadmap (`PACKAGE.md` §5): Phase 1 (core, dynamic evaluation in Node with fast-check, the LLM implementation loop) is in progress; IR extraction was pulled forward from Phase 2 because the LLM needs it as input. Multi-language generators and Mermaid/observability follow in Phases 3–4.

## LLM as the compiler

The framework generates **test-side code only**; it never places types, signatures, or files in production code. The pipeline (`SPEC.md` §2.3): specs → IR → **entry gate** (temp directory outside the repo holding only the IR, adapter contract, adapter, `REQUEST.md`, and any previous `src/`) → **strategy** (an external agent command writes `src/` and fills `aac/adapter.ts` there) → **exit gate** (audit the sandbox, copy only `src/` and the adapter to `--out`, regenerate `ir.json` / contract / `verify.ts` there, run `check.ts`, run PBT, run the mutation gate) → on any failure the violation, minimal counterexample, or surviving mutation goes into the next `REQUEST.md`.

Invariants to preserve when changing this:

- Isolation belongs to the gates, not to strategies. Nothing that points at the repo may enter the sandbox: no spec sources, no `verify.ts` (it contains the specs path), no repo paths in file contents or environment variables. A new strategy must not need to re-implement any of this.
- Production code carries zero constraints: no framework imports or types, no required naming, no required DI, no shared vocabulary with the spec. The adapter always adapts to the production code, so never restrict what the adapter may contain; whether business decisions really live in `src/` is established by mutation, not by inspecting the adapter.
- Anything you want the implementer to do about design goes into the guide (`guide.ts`, or `--guide <file>`), which is advice and never a pass/fail rule. The guide must not mention business rules.
- The mutation pass rule lives in `judge`, not in a strategy. A strategy only breaks code and reports which mutants survived; record which strategy ran in the result.
- Anything the framework only has to *judge* (conditions, formulas, invariants) is a natural-language name in Layer 1 plus a function in Layer 2; anything it has to *generate* or match exactly (states, actions, inputs, queries, commands, numeric constraints, `from`) is data. Do not put arithmetic or branching in case bodies or table cells: add a condition or a formula.
- Spec errors are never the implementer's problem. `selfCheck` (`runtime.ts`) simulates the spec alone before any agent runs, and a `SpecError` during PBT yields `status: "error"`, which stops the loop instead of becoming feedback.
- Money and other exact quantities are integers, with rounding spelled out in the formula's name; float arithmetic makes the oracle and a correct implementation disagree for no good reason.
- The agent sees the IR only. Layer 2 predicates are the oracle and must never be emitted into the IR or the request; interpreting the natural-language condition keys is the LLM's job, and PBT judges it.
- Test cases are never LLM-written. Expected values come from executing the spec concretely (`createState` + `applyDecision`).
- Generated files are a pure function of the IR (no timestamps, no versions); `check.ts` relies on byte-equality with a regeneration. The PBT seed is derived from the spec hash so verification is deterministic.
- `--out` must sit where `@aac/cli/runtime` resolves (a workspace package like `examples/*`, or under `packages/cli/` as the tests do).
- Agent-facing text (`REQUEST.md`, check violations) is English; user-facing diagnostics are Japanese.

Types vanish at runtime, so anything the IR or PBT needs must be declared as a value (the component) with the type derived from it — never the other way round.

## Case bodies: no branching, no operators

The recording Proxy cannot observe `===`, truthiness, `??`, `||`, or destructuring defaults, so a case that branches yields a silently wrong IR (only one path recorded). The decision is to keep the Proxy approach and forbid such syntax: `lint.ts` allows only `const`, `return`, literals, property access, calls, spread, and destructuring, and anything else is a `forbidden-syntax` error. All branching and arithmetic belongs in the DecisionTable rows/columns — when a spec seems to need an `if`, add a row or column instead of relaxing the lint. The lint works on `fn.toString()` with a hand-written tokenizer to stay dependency-free; it does not see into helper functions called from a case.

## Decided constraints for implementation

From `DISTRIBUTION.md`; these are settled decisions, not suggestions:

- **Node is the only allowed runtime dependency.** No Bun, Deno, single binaries, or Docker. No npm publishing for now — the git repo is the distribution channel.
- **No build step.** `.ts` files run directly via Node type stripping; `packages/cli/package.json` `bin` will point straight at `./bin/aac.ts`, shared through a pnpm workspace (`"@aac/cli": "workspace:*"`).
- **Node >= 22.18** (`.node-version` is to be `24`), enforced via `engines`, `engine-strict=true` in `.npmrc`, and a version guard at the top of `bin/aac.ts`.
- Because of type stripping: no `enum`, no `namespace`, and relative imports must include the `.ts` extension. Use `as const` + unions instead of `enum`.
- Node refuses to type-strip `.ts` whose real path is inside `node_modules`. A workspace link is fine; a git dependency or tarball install is not. This is why specs live in this repo (`specs/`) for now, and it — not npm publishing — is the trigger for ever adding a build.
- **Keep third-party dependencies minimal** (`packages/core` must stay pure TS with none; `fast-check` in `@aac/cli` is the one accepted exception). Use `util.parseArgs` for CLI arguments.
- Resolve paths against `process.cwd()`, never the script location (the `.bin` shim runs with the caller's cwd).
- Keep all spec loading behind a single `SpecLoader` (`packages/cli/src/loader.ts`).
- **Output must be deterministic**: sorted JSON keys, fixed indentation and line endings. Generated file headers carry only `ir-version` and `spec-hash` — never timestamps or the CLI version. The integer, monotonically increasing IR version is the sole compatibility contract.

## Planned CLI (not yet available)

`pnpm aac compile` / `generate` / `test --seed 123` / `implement`, per `DISTRIBUTION.md` §6 and `PACKAGE.md` §3.
