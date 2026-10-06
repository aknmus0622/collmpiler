# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Phase 1 spike. The design documents (written in Japanese) are still the bulk of the repo. The code:

- `packages/core/index.ts` — `DomainModel` (value-level states/data/commands, with types derived from it), `DecisionTable`, `defineBehaviors`, `applyDecision`, `bindDecisionDetails`, `bindPreconditions`, `createState` (concrete execution). Zero dependencies.
- `packages/cli/src/` (no `aac` bin yet; `compile.ts` and `implement.ts` are temporary entry points)
  - `loader.ts` — the single `SpecLoader`.
  - `extract.ts` — recording-Proxy abstract execution → IR. `lint.ts` — token whitelist applied to each case body first.
  - `generate.ts` — IR → test-side files. `runtime.ts` — PBT runtime (fast-check) called by the generated `verify.ts`.
  - `strategy.ts` — the swappable implementation step (an external agent command). `gates.ts` — entry gate (isolated sandbox with allowlisted inputs) and exit gate (collect allowlisted outputs, checks, PBT). `request.ts` — the agent-facing request text. `loop.ts` — entry gate → strategy → exit gate → feedback.
  - `check.ts` + `scan.ts` — mechanical checks on what the LLM wrote.
- `specs/` — the `SPEC.md` example (`order.model.ts`, `campaign.dmn.ts`, `order.spec.ts` are Layer 1; `vocabulary.ts` is Layer 2).
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
pnpm -s run ir                                        # specs/ -> IR JSON on stdout, diagnostics on stderr
pnpm --filter example-checkout-ts verify              # PBT against examples/checkout-ts (add -- --seed N --path P to replay)

# Have an agent (re)write an implementation. Any command works; it runs in an isolated temp directory.
# --fresh discards the existing src/ and adapter; --transcripts <dir> saves the agent's stdout per attempt.
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

- **Layer 1 – Spec**: pure data. A `DomainModel` value describes a component by its boundary only — `input` (action arguments), `queries` (values it asks its dependencies for), `commands` (side effects on its dependencies), plus state names — and decision tables (DMN) keyed by natural-language condition strings, declared with `as const satisfies DecisionTable<T>`; a `"default"` key is mandatory. Behaviours are declared with `defineBehaviors`: `from` lists the states an action can run in, `where` lists preconditions, and each key of `cases` is an outcome (the external result that decides how the action turns out).
- **Layer 2 – Binding**: the predicate functions for each natural-language key (`bindDecisionDetails`, `bindPreconditions`), typed from `keyof typeof <Rules>` so a missing binding is a compile error. Hit policy is Unique (multiple non-default matches throw `RuleConflictError`).
- **Universal IR**: flat, language-independent JSON extracted from Layer 1 (older docs call it "Layer 1.5" or "Layer 2.5").
- **Layer 3 – Verification**: PBT generated on the test side (fast-check for TS today; rapid/proptest planned). A trial is a sequence of actions from the initial state; failures shrink to the shortest sequence.
- **Adapter Contract**: `TargetSystemAdapter` (`setupIsolation(ports)` / `teardownIsolation` / `executeAction(action, input)` / `getCurrentState`) is the only boundary to the target system. The harness-owned `Ports` fakes answer queries and outcomes and record commands; there is deliberately no way to inject state into the system — states are reached by executing actions.

Decided but not yet implemented (`SPEC.md` §2.3, end of the exit-gate section): production code must carry zero constraints, so the adapter always adapts to the production code's seams; the token-level thin-adapter rule in `check.ts` is therefore temporary and will be replaced by a mutation gate (itself a swappable strategy, with the pass rule owned by the gate), and project-supplied design guidance will be embedded in the request.

Roadmap (`PACKAGE.md` §5): Phase 1 (core, dynamic evaluation in Node with fast-check, the LLM implementation loop) is in progress; IR extraction was pulled forward from Phase 2 because the LLM needs it as input. Multi-language generators and Mermaid/observability follow in Phases 3–4.

## LLM as the compiler

The framework generates **test-side code only**; it never places types, signatures, or files in production code. The pipeline (`SPEC.md` §2.3): specs → IR → **entry gate** (temp directory outside the repo holding only the IR, adapter contract, adapter, `REQUEST.md`, and any previous `src/`) → **strategy** (an external agent command writes `src/` and fills `aac/adapter.ts` there) → **exit gate** (audit the sandbox, copy only `src/` and the adapter to `--out`, regenerate `ir.json` / contract / `verify.ts` there, run `check.ts`, run PBT) → on any failure the violation or minimal counterexample goes into the next `REQUEST.md`.

Invariants to preserve when changing this:

- Isolation belongs to the gates, not to strategies. Nothing that points at the repo may enter the sandbox: no spec sources, no `verify.ts` (it contains the specs path), no repo paths in file contents or environment variables. A new strategy must not need to re-implement any of this.
- The agent sees the IR only. Layer 2 predicates are the oracle and must never be emitted into the IR or the request; interpreting the natural-language condition keys is the LLM's job, and PBT judges it.
- Test cases are never LLM-written. Expected values come from executing the spec concretely (`createState` + `applyDecision`).
- Generated files are a pure function of the IR (no timestamps, no versions); `check.ts` relies on byte-equality with a regeneration. The PBT seed is derived from the spec hash so verification is deterministic.
- `--out` must sit where `@aac/cli/runtime` resolves (a workspace package like `examples/*`, or under `packages/cli/` as the tests do).
- Agent-facing text (`REQUEST.md`, check violations) is English; user-facing diagnostics are Japanese.

Types vanish at runtime, so anything the IR or PBT needs must be declared as a value (`DomainModel`) with the type derived from it — never the other way round.

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
