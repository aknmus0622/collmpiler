# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Early Phase 1 spike. The design documents (written in Japanese) are still the bulk of the repo; the code so far is:

- `packages/core/index.ts` — multiplicity types, `DecisionTable`, `defineBehaviors`, `applyDecision`, `bindDecisionDetails`, `createState` (concrete execution).
- `packages/cli/src/` — `loader.ts` (the single `SpecLoader`), `extract.ts` (recording-Proxy abstract execution → IR), `compile.ts` (temporary entry point; there is no `aac` bin yet).
- `packages/cli/src/lint.ts` — token whitelist applied to each case body before extraction (see below).
- `specs/` — the `SPEC.md` example.
- `packages/cli/test/extract.test.ts` — pins down what the recording Proxy can and cannot capture, including known blind spots. Update it when extraction behaviour changes.

The repo is a colocated Jujutsu (`.jj/`) + git repository, so `git` normally shows a detached `HEAD`.

## Commands

```bash
pnpm install
pnpm test                                             # node --test, all *.test.ts
node --test packages/cli/test/extract.test.ts         # one file
node --test --test-name-pattern="スプレッド"           # one test by name
pnpm -s run ir                                        # specs/ -> IR JSON on stdout, diagnostics on stderr
```

`typescript` is deliberately not a dependency, so there is no type-check script; `tsconfig.json` exists for editors and for an externally installed `tsc -p .`.

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

`DISTRIBUTION.md` is the newest and **overrides the others where they conflict**:

- Near-term layout is its §6 (`packages/core`, `packages/cli`, `specs/`), not the full `PACKAGE.md` tree. `plugins/` and `packages/compiler` are not to be created yet; generators live as functions in `packages/cli/src/emit.ts`.
- Spec extraction is planned as a recording `Proxy` (abstract execution) in `packages/cli/src/extract.ts`, rather than the TypeScript Compiler API walk described in `PACKAGE.md`. Whether this holds up for real specs is the open question of Phase 1 (§9).
- The self-hosting fixed-point check compares **IR and generated sources** (§8), not `stage1.js` vs `stage2.js` as in `SELF_HOSTING.md`, because no `.js` is built.

## Architecture (planned)

Layers, from `SPEC.md`:

- **Layer 1 – Spec**: pure data, no functions. Decision tables (DMN) keyed by natural-language condition strings, declared with `as const satisfies DecisionTable<T>`; a `"default"` key is mandatory. Behaviours are declared with `defineBehaviors`.
- **Layer 2 – Binding**: the predicate functions for each natural-language key, typed from `keyof typeof <Rules>` so a missing binding is a compile error. Hit policy is Unique (multiple matches throw `RuleConflictError`).
- **Universal IR**: flat, language-independent JSON compiled from Layers 1 and 2. The docs call it both "Layer 1.5" and "Layer 2.5" — same thing.
- **Layer 3 – Verification**: state-driven PBT generated from the IR per target language (fast-check for TS; rapid/gopter for Go; proptest for Rust), with shrinking, state diff, and deterministic replay.
- **Adapter Contract**: `TargetSystemAdapter` (`setupIsolation` / `teardownIsolation` / `executeAction` / `getCurrentState` / `getFiredCommands`) is the only boundary to the target system; per-run isolation is what makes replay deterministic.

Roadmap (`PACKAGE.md` §5): Phase 1 is `packages/core` plus dynamic evaluation in Node with fast-check, no compiler package and no other languages. IR extraction, multi-language generators, and Mermaid/observability follow in Phases 2–4.

## Case bodies: no branching, no operators

The recording Proxy cannot observe `===`, truthiness, `??`, `||`, or destructuring defaults, so a case that branches yields a silently wrong IR (only one path recorded). The decision is to keep the Proxy approach and forbid such syntax: `lint.ts` allows only `const`, `return`, literals, property access, calls, spread, and destructuring, and anything else is a `forbidden-syntax` error. All branching and arithmetic belongs in the DecisionTable rows/columns — when a spec seems to need an `if`, add a row or column instead of relaxing the lint. The lint works on `fn.toString()` with a hand-written tokenizer to stay dependency-free; it does not see into helper functions called from a case.

## Decided constraints for implementation

From `DISTRIBUTION.md`; these are settled decisions, not suggestions:

- **Node is the only allowed runtime dependency.** No Bun, Deno, single binaries, or Docker. No npm publishing for now — the git repo is the distribution channel.
- **No build step.** `.ts` files run directly via Node type stripping; `packages/cli/package.json` `bin` points straight at `./bin/aac.ts`, shared through a pnpm workspace (`"@aac/cli": "workspace:*"`).
- **Node >= 22.18** (`.node-version` is to be `24`), enforced via `engines`, `engine-strict=true` in `.npmrc`, and a version guard at the top of `bin/aac.ts`.
- Because of type stripping: no `enum`, no `namespace`, and relative imports must include the `.ts` extension. Use `as const` + unions instead of `enum`.
- Node refuses to type-strip `.ts` whose real path is inside `node_modules`. A workspace link is fine; a git dependency or tarball install is not. This is why specs live in this repo (`specs/`) for now, and it — not npm publishing — is the trigger for ever adding a build.
- **Keep third-party dependencies at zero for as long as possible** (`packages/core` must stay pure TS with none). Use `util.parseArgs` for CLI arguments.
- Resolve paths against `process.cwd()`, never the script location (the `.bin` shim runs with the caller's cwd).
- Keep all spec loading behind a single `SpecLoader` (`packages/cli/src/loader.ts`).
- **Output must be deterministic**: sorted JSON keys, fixed indentation and line endings. Generated file headers carry only `ir-version` and `spec-hash` — never timestamps or the CLI version. The integer, monotonically increasing IR version is the sole compatibility contract.

## Planned CLI (not yet available)

`pnpm aac compile <specs>` (TS -> IR), `pnpm aac generate` (IR -> code), `pnpm aac test --seed 123` (PBT / deterministic replay), per `DISTRIBUTION.md` §6.
