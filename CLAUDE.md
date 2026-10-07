# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Phase 1 spike. The design documents (written in Japanese) are still the bulk of the repo. The code:

- `packages/core/index.ts` — `decisionTable`, `component` (vocabulary, state-machine skeleton and prose, declared as a value with types derived from it), `bind` (structure as declarations + meanings as functions), the references `ref.input` / `ref.data` / `ref.query` / `ref.decision` / `ref.calculation` / `ref.was`, and `decide` / `calculate` / `matchCondition` for evaluating meanings. Bindings are registered per component in a `WeakMap` (no process-global registry). Zero dependencies. `packages/core/test/*.check.ts` are type-level checks: they are verified by `pnpm typecheck` passing (wrong usages carry `@ts-expect-error`), not by the test runner.
- `packages/cli/src/` (no `aac` bin yet; `compile.ts`, `implement.ts` and `draft-binding.ts` are temporary entry points)
  - `loader.ts` — the single `SpecLoader`. It finds the component and its binding, and normalizes them into the internal `SpecModel` + behaviours form the rest of the CLI uses (a command without `when` becomes a table with only `otherwise`; omitted declarations become empty).
  - `extract.ts` — builds the IR by rearranging the component, the decision tables and the binding's structure (all function-free data; nothing is executed), and reports what the type check let through (unknown names, references whose type does not fit) with readable Japanese messages. `schema.ts` — runtime checks on field types.
  - `target.ts` — the `Target` interface: everything that depends on the language the production system is written in. `target-typescript.ts` — the only implementation, assembled from the TypeScript-specific modules below (`generate.ts`, `check.ts` + `scan.ts`, `runtime.ts`, `mutation.ts`'s built-in strategy, `static-check.ts`'s `tsc`).
  - `layout.ts` — where production code and the test-side files go (`--out`, or `--src` / `--tests`), and the one definition of "which files are production code" (`isSource` / `sourceFiles`).
  - `generate.ts` — IR → test-side files. `runtime.ts` — PBT runtime (fast-check) called by the generated `verify.ts`, plus `selfCheck`, the spec-only simulation run before any agent.
  - `strategy.ts` — how an agent session is launched (an external command). `gates.ts` — per-phase entry gate (isolated sandbox with allowlisted inputs) and exit gate (collect allowlisted outputs, checks, PBT). `request.ts` — the three phase-specific request texts. `loop.ts` — the design → wiring → implementation pipeline with feedback and restarts.
  - `check.ts` + `scan.ts` — mechanical checks on what the LLM wrote (imports and generated files only; adapter contents are unrestricted).
  - `typecheck.ts` — runs `tsc`; `typecheckSpecs` is the fixed, always-on check of the specs. `static-check.ts` — the swappable `StaticCheckStrategy` for what the agent wrote (the TypeScript one is `tsc`; `--static-check off` disables it). `assets.ts` — resolves asset declarations (files keep their relative path under `aac/assets/`; text goes inline into the request) from the component's `assets` (relative to the component file) and from `--asset`.
  - `draft.ts` — has an agent draft the Layer 2 binding into `<name>.binding.draft.ts` (entry point `draft-binding.ts`). Separate from the implementation pipeline.
  - `mutation.ts` — the mutation gate: a swappable `MutationStrategy` (built-in literal mutation) plus `judge`, the pass rule owned by the gate. `guide.ts` — default design guidance embedded in the request.
- `specs/` — the example: `order.decisions.ts` and `order.component.ts` (Layer 1) and `order.binding.ts` (Layer 2). Only one component can be loaded at present.
- `examples/checkout-ts/` — `src/` is production code written by an LLM agent from the IR; `aac/` is the generated test side. Do not hand-edit `src/` to make verification pass; rerun the loop.
- Run tests through `pnpm test` (explicit glob). A bare `node --test` executes every file under any `test/` directory, including fixtures and temporary work directories.
- Tests: `example.test.ts` covers the example spec, IR output, and the loader / extraction / self-check diagnostics; `loop.test.ts` the loop and the checks (using `test/fixtures/scripted-agent.ts` as a stand-in LLM); `draft.test.ts` the binding draft. Update them when behaviour changes.

The repo is a colocated Jujutsu (`.jj/`) + git repository, so `git` normally shows a detached `HEAD`. Commit with `jj`.

## Commands

```bash
pnpm install
pnpm typecheck                                        # tsc over the whole repo, incl. packages/core/test/*.check.ts
pnpm test                                             # all packages/**/*.test.ts
node --test packages/cli/test/example.test.ts         # one file
node --test --test-name-pattern="事前検査" "packages/**/*.test.ts"   # tests by name
pnpm -s run ir                                        # type-check + self-check the specs, IR JSON on stdout, diagnostics on stderr
pnpm --filter example-checkout-ts verify              # PBT against examples/checkout-ts (add -- --seed N --path P to replay)

# Have an agent draft the binding (Layer 2) for names that are not bound yet. The result is
# specs/<name>.binding.draft.ts, ignored until a person reviews it and drops ".draft" from the name.
pnpm -s run draft-binding --agent 'claude -p "Read aac/REQUEST.md and carry out the request." --permission-mode acceptEdits'

# Have an agent (re)write an implementation in three sessions (design, wiring, implementation).
# Any command works; each session runs in an isolated temp directory. --from <phase> starts later in the pipeline.
# --fresh discards the existing src/ and adapter; --transcripts <dir> saves the agent's stdout per attempt;
# --asset [<phases>=]<file> attaches a file to the requests (repeatable); --drafts uses unreviewed draft bindings
# as the oracle; --mutation auto|builtin|off and --static-check auto|tsc|off select those strategies (auto = the target's own);
# --target typescript selects the target language (the only one so far).
# --out puts production code in <out>/src and the test side in <out>/aac; --src / --tests name the two places
# directly. --tests is the path put in front of the test-side file names: ending with "." makes its last part a file-name
# prefix (--tests src/order/order.aac. → src/order/order.aac.adapter.ts; required when both are the same directory).
pnpm -s run implement --out examples/checkout-ts --fresh --max-attempts 3 \
  --agent 'claude -p "Read aac/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

`typescript` (in `@aac/cli`, plus `@types/node` at the root) and `fast-check` are the only third-party dependencies; `packages/core` has none. Type checking is part of the framework, not just a dev convenience: `compile.ts` / `implement` type-check the specs, and every exit gate type-checks what the agent wrote.

## Vocabulary

"Command" means what drives a component from outside (the blue sticky note of event storming); "effect" means what the component does to its dependencies. Older commits used `actions` / `tells` in the spec and `commands` for effects in the IR and the contract — do not reintroduce that. In Japanese text: コマンド / 副作用. "コマンド" can also mean a shell command (the agent's command, `commandStrategy`); context tells.

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

- **Layer 1 – Spec**: no functions at all. `decisionTable({...})` maps natural-language conditions to rows of values (values only, `otherwise` mandatory, same columns in every row). `component({...})` describes one unit (a scenario, a domain part, a UI part all take the same shape): `states` / `init`; `data` (what it remembers between commands; unset initially); `queries` (values it asks its dependencies for, including external services' responses); `effects` (side effects on its dependencies); `decisions` (the tables it uses); `calculations` (`{ name: { is: "<sentence>", type } }`); `invariants` (sentences); `commands` (what drives it from outside; each with `input`, `from`, `onlyIf`, and either `then: { goTo, does }` or `when: { "<condition>": { goTo, does }, otherwise }` — `goTo` is structure, `does` is prose); `assets` (a list of `file(path)`, `dir(path)`, `text(content)`, each with an optional `{ phases }`, attached to the agent's requests — not part of the spec's meaning, so never emitted into the IR). Everything except `states`, `init`, `commands` is optional. Literals written inline are inferred narrowly without `as const`, but an enum array pulled out into a variable needs `as const`; a widened `string[]` is rejected by the types.
- **Layer 2 – Binding**: one `bind(Component, {...})` call with two parts of different nature. `commands` is the *structure* — what each `does` sentence means, as declarations: `effects` (in order, each optionally with `when`: a condition sentence or a boolean reference) and `set`, whose values are constants or references written as `ref.*` (one namespace, so spec files can use `data` or `input` as their own names). It contains no functions and goes into the IR. `conditions` / `calculations` / `invariants` are the *meanings* — functions, the oracle, never in the IR. The names to bind are collected in the type system (table rows, `onlyIf`, `when` keys, and `when` sentences used in the structure), so missing and unused entries, unknown names, and references of the wrong type are compile errors; type errors carry a readable message via an object-typed `Problem<...>`. Conditions are hit-policy Unique: more than one true is a `RuleConflictError`, none true means `otherwise`. Conditions and calculations see `status`, remembered data, query answers, and command input in one flat namespace, so those field names must not collide (the loader rejects it). Invariants see only `status` and data, and verify the spec, not the implementation. Whether a sentence matches its structure and meaning is checked by a person, not mechanically.
- **Universal IR**: flat, language-independent JSON built from Layer 1 plus the binding's structure (older docs call it "Layer 1.5" or "Layer 2.5"). Its keys are the same words the spec is written in (`init`, `data`, `commands`, `queries`, `effects`, `calculations`, `invariants`, `from`, `onlyIf`, `when`, `goTo`, `does`, `set`); keep it that way, so no mapping table is needed. `model` holds the vocabulary and `behaviors` what each command does.
- **Layer 3 – Verification**: PBT generated on the test side (fast-check for TS today; rapid/proptest planned). A trial is a sequence of commands from the initial state; failures shrink to the shortest sequence. The default is 1000 trials: with 200, about one seed in five never reached the example's 10,000-yen threshold in the state where it matters.
- **Adapter Contract**: `TargetSystemAdapter` (`setupIsolation(ports)` / `teardownIsolation` / `executeCommand(command)` / `getCurrentState`) is the only boundary to the target system. The harness-owned `Ports` fakes answer `queries` and record `effects`; there is deliberately no way to inject state into the system — states are reached by executing commands, and remembered data is never read back directly, only observed through later behaviour.

Roadmap (`PACKAGE.md` §5): Phase 1 (core, dynamic evaluation in Node with fast-check, the LLM implementation loop) is in progress; IR extraction was pulled forward from Phase 2 because the LLM needs it as input. Multi-language generators and Mermaid/observability follow in Phases 3–4.

## LLM as the compiler

The framework generates **test-side code only**; it never places types, signatures, or files in production code. The pipeline (`SPEC.md` §2.3): specs → spec self-check → IR → three TDD phases, each a separate agent session wrapped in an **entry gate** (temp directory outside the repo holding only that phase's allowlisted inputs) and an **exit gate** (audit the sandbox, copy only that phase's writable paths to `--out`, regenerate `ir.json` / contract / `verify.ts` there, run `check.ts`, then the phase's own check):

| Phase | Agent sees | Agent writes | Phase check |
| --- | --- | --- | --- |
| `design` | IR, guide, assets | `src/` skeleton (signatures; bodies throw `"not implemented"`) | type-checks; loads; quotes no spec sentence |
| `wiring` | adapter contract, skeleton — **not the IR** | `aac/adapter.ts` | type-checks; PBT must fail for the "not implemented" reason (red) |
| `implementation` | IR, skeleton, guide, assets — **not the adapter or contract** | `src/` bodies | type-checks together with the adapter (catches changed signatures); PBT passes (green); mutation gate |

A failed check goes into the same phase's next `REQUEST.md`; when a phase exhausts its attempts the whole pipeline restarts from `design` (the failing phase cannot be attributed mechanically). If `--out` already holds `src/` and an adapter, the run starts at `implementation`.

Invariants to preserve when changing this:

- What each phase may see is the mechanism, not a detail: the wiring phase never sees the IR (so the adapter cannot encode business decisions) and the design/implementation phases never see the adapter contract (so production code is not shaped by the harness). Do not add an input to a phase, and do not mention `ports` or the harness in the design/implementation requests or the default guide, without re-examining these two properties. The skeleton is the one channel between them; `gates.ts` rejects skeletons that quote spec sentences.
- The layout is data, not convention. Nothing outside `layout.ts` may assume `src/` or `aac/`: ask the `Workspace` for `paths.*` and use `sourceFiles` / `isSource` for production code. The sandbox mirrors the output's relative layout (so relative imports are identical in both); only `REQUEST.md` and assets always live in the sandbox's `aac/`, because agent commands point there. Production code is removed file by file, never by deleting the directory — test-side files may sit next to it — and `resolveLayout` refuses a `--src` that looks like a project root.
- Isolation belongs to the gates, not to strategies. Nothing that points at the repo may enter the sandbox: no spec sources, no `verify.ts` (it contains the specs path), no repo paths in file contents or environment variables. A new strategy must not need to re-implement any of this.
- Production code carries zero constraints: no framework imports or types, no required naming, no required DI, no shared vocabulary with the spec. The adapter always adapts to the production code, so never restrict what the adapter may contain; whether business decisions really live in `src/` is established by mutation, not by inspecting the adapter.
- Anything you want the implementer to do about design goes into the default guide (`guide.ts`) or an attached asset (the component's `assets`, or `--asset` for a single run), which is advice and never a pass/fail rule. Neither may mention business rules. Assets go to the design and implementation phases unless phases are named; sending one to the wiring phase can undo that phase's blindness to the spec.
- `loop.ts` and `gates.ts` are a language-agnostic template: they may call the target language only through `ctx.target` (`Target`). Do not import `generate.ts`, `check.ts`, `runtime.ts`, or TypeScript file names into them. Conversely, what must stay out of a target and in the gates: isolation, which phase sees what, the sandbox audit, the red/green verdicts, the quoted-spec-sentence check, and the mutation pass rule. The interface was extracted from the TypeScript code and has not been validated against a second language; expect to adjust it when one is added (the hard part is `runTests`, since the oracle always runs in TypeScript).
- Type-checking the specs and statically checking the implementation are two different things that merely share `tsc` today. The spec check is part of the framework's guarantees (specs are always TypeScript) and must stay unconditional. The implementation check depends on the target language, is only an early-feedback layer (PBT decides pass/fail, and everything must still be caught without it), and is a strategy that returns violations; which files to check per phase and how to word the feedback belong to `gates.ts`.
- The mutation pass rule lives in `judge`, not in a strategy. A strategy only breaks code and reports which mutants survived; record which strategy ran in the result.
- Anything the framework only has to *judge* (conditions, calculations, invariants) is a sentence or name in Layer 1 plus a function in the binding's meanings; anything it has to *generate* or match exactly (states, commands, inputs, queries, effects, numeric constraints, transitions) is data — in the component or in the binding's structure. Never allow functions into the component, a decision table, or `binding.commands`: the IR, and every other intermediate artifact, is derived from them without executing anything.
- Spec errors are never the implementer's problem. `selfCheck` (`runtime.ts`) simulates the spec alone before any agent runs, and a `SpecError` during PBT yields `status: "error"`, which stops the loop instead of becoming feedback.
- Money and other exact quantities are integers, with rounding spelled out in the calculation's `is` sentence; float arithmetic makes the oracle and a correct implementation disagree for no good reason.
- The binding is the oracle. `draft-binding` writes `*.draft.ts`, which `loadSpecs` ignores unless called with `{ drafts: true }`; a person reads it and renames it to put it into use. Drafts must never load by default. The one opt-in is `implement --drafts` (for unattended CI runs), which uses drafts as the oracle, logs a warning, and records `oracle: "draft"` in the result — keep all three, because in that mode the same misreading by the LLM passes undetected.
- The agent sees the IR only. The binding's meaning functions are the oracle and must never be emitted into the IR or the request; interpreting the natural-language conditions is the LLM's job, and PBT judges it.
- Test cases are never LLM-written. Expected values come from interpreting the binding's structure with its meaning functions (`runtime.ts`).
- Generated files are a pure function of the IR (no timestamps, no versions); `check.ts` relies on byte-equality with a regeneration. The PBT seed is derived from the spec hash so verification is deterministic.
- `--out` must sit where `@aac/cli/runtime` resolves (a workspace package like `examples/*`, or under `packages/cli/` as the tests do).
- Agent-facing text (`REQUEST.md`, check violations) is English; user-facing diagnostics are Japanese.

Types vanish at runtime, so anything the IR or PBT needs must be declared as a value (the component) with the type derived from it — never the other way round.

## Decision-table cells that are never used

A table cannot say "no value": a row that grants no coupon must still fill the `coupon` column. An implementation that copies such a filler faithfully holds a value whose mutation changes nothing, so the mutation gate rejects it once (the agent then drops it). This is a known cost of the spec format, not a bug in the gate; do not weaken `judge` to hide it.

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
