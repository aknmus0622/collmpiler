# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

The 1.0 notation (`DSL.md` §17; `0.3.0` is still the version in the package files, `clp --version`). The 0.3
notation (`service({ uses: [...] })`, handles, `interpretation(X, [...])`, IR version 7) has been removed from the
code; it survives only in the history and in the older sections of the design documents. `REFERENCE.md` (English) is
the one page a spec author needs. The code:

- `packages/core/index.ts` — the vocabulary specs are written in, **for TypeScript's sake only**: spec files are
  never executed. It gives `this` its type inside bodies, completion, and light errors through `tsc`. Words:
  `service`, `external`, `answer({ fresh, increasing, mayFail })`, `interpretation`, `decisions`, `condition`, `calc`,
  state constructors (`init<T>(v)`, `Map<K, V>()`, `Set<T>()`, `List<T>()`), fragments (`is.x("…", expr?)`,
  `does.x("…")`, `value.x("…")`), `requires`, `failed`, `otherwise`, temporal words (`always` with `.on.Cmd`,
  `eventually`, `after`, `once`, `historically`, `until`), `example` / `expect`, assets (`file`, `dir`, `text`), and
  types (`Int`, `Id<"…">`, `Json`, `SpecMap`, `SpecSet`). Zero dependencies.
- `packages/cli/src/v1/` — everything that reads, checks, evaluates and generates (the directory name is the
  notation's version; there is no other notation left):
  - `syntax.ts` — a parser for the TypeScript subset specs use (the TS 7 API is unstable and IPC-only). Errors carry
    positions. `read.ts` — the program (modules, units: service / external / decisions / condition / calc), name
    resolution, laying interpretations over Layer 1 (`overlayStage0`), stamps (`// layer1 Name: sha256:…` per unit),
    REVIEW marks. `stamp.ts` — the Layer 1 hash (the unit, every other declaration of its file, what they reach by
    name; positions, comments and decision-table cell values left out).
  - `build.ts` — bodies to s-expressions and events: an `if` that contains `return` splits the path into cases
    (events, guards exclusive by construction); one that does not makes assigns `ite` and calls `when`. Fragments are
    filled per `fillStage0`; `this` inside decisions / conditions / calcs is the caller's state; `x !== null`
    narrowing, `x!`, `as`, number constants fitting numeric enums, folding conditions on state fixed by `requires`
    and the guard, read-after-write, one call per part per case. `types.ts` (`fits` through `fitStage0`), `ir.ts`
    (IR version 8), `ops.ts` (the operator table with ja/en read-out).
  - `eval.ts` — the oracle: evaluates the IR (`execute`, `answer`, `brokenProperties`). `pbt.ts` — the
    `Simulation`, input generation, `check8` (fixed traces first: Alloy's shortest traces and the author's examples,
    then random sequences), `selfCheck8`, `checkExamples`, coverage. `decide.ts` — the log of Stage 0 decisions and
    `agree` (R4). `compare.ts` — comparing two interpretations. `mutants.ts` + `verdict.ts` — spec mutation.
  - `supplement.ts` (what `clp run` writes into Layer 1: a person's answer to a review mark, in their own words,
    appended to the sentence the mark is about; the only place Layer 1 is written),
    `load.ts` (`compile`, `compileChecked`, interpretation problems), `prepare.ts` (`prepare`, `checkSpec`: self-check,
    examples, Alloy, spec mutation), `alloy.ts` + `traces.ts` (the Alloy 6 checker), `generate.ts` (contract, adapter
    skeleton, `verify.ts`, the English spec view `<name>.spec.md`), `runtime.ts` (`runPbt`, called by the generated
    `verify.ts`; `boundary8`), `interpret.ts` (`clp interpret` / `--accept`), `stage1.ts` (Stage 1: the self
    components, `GLUE`, `deciders8`, R1, `runCases`), `agreement.ts` (`clp __agreement`, the 1.0 R3 cases),
    `spec-adapter.ts` (an adapter backed by the spec itself), `values.ts` (`decisionValues8`: which constants the
    mutation gate may break), and the Stage 0 files of the self components (`overlay.ts`, `fills.ts`, `subset.ts`,
    `declared.ts`, `trace.ts`, `reported.ts`, `usage.ts`, `outcome.ts`).
- `packages/cli/src/` — what does not depend on the notation: `bin/clp.ts` (loads only the chosen subcommand from
  `commands/`: `run`, `compile`, `interpret`, `apply`, `verify`, internal `__compare`, `__cases`, `__agreement`; each
  exports `summary`, `usage`, `main(args)`), `run.ts` (`clp run`: check → interpret → the person's answers → accept →
  `implement`, started from the state of the specs and output, talking through `Talk`: a terminal or JSON lines),
  `loop.ts` (the pipeline), `gates.ts`, `request.ts`, `strategy.ts`, `target.ts` + `target-typescript.ts`, `layout.ts`,
  `check.ts` + `scan.ts`, `typecheck.ts`, `static-check.ts`, `mutation.ts`, `assets.ts`, `guide.ts`, `verified.ts`,
  `generate.ts` (a thin shim over `v1/generate.ts`), and the Stage 0 files shared with 0.3's self components
  (`rules.ts`, `observe.ts`, `choose.ts`, `promise.ts`, `candidates.ts`).
- `examples/` — each complete in one directory (`specs/` by a person, `src/` by agents, `clp/` generated). Do not
  hand-edit `src/` to make verification pass; rerun the loop.
  - `checkout-ts/` — an order (decision tables, outside world, an external the interpretation declared). Most
    pipeline tests use these specs (`specsDir` in `test/support.ts`).
  - `library-ts/` — the loan of one book, made from a deliberately rough spec; its `README.md` records how the spec
    became precise from what `clp interpret` reported (in 0.3, then again in 1.0). Keep it as the workflow example.
  - `lending-ts/` — a library of several components (Library contains Fines and Members; Clock is outside).
  - `todo-ts/` — a to-do API over HTTP (`routes`); `todo-db-ts/` — the same made durable (`durable: true` on a store,
    `node:sqlite`) with a failing identifier source (`mayFail`). In both, `server/main.ts` (the composition root) is
    the only code a person wrote.
- `packages/cli/self/` — the framework's own components in the 1.0 notation (19; `examples/co-llm-piler` is a
  symlink to it): `specs/`, `src/` (by agents), `clp/` (test side and pass records), `cases/` (R3).
- Tests: `packages/cli/test/` — `notation.test.ts` (reading, IR, oracle, PBT, comparison), `example.test.ts`,
  `features.test.ts`, `parts.test.ts`, `durable.test.ts`, `interpret.test.ts`, the pipeline tests (`loop`, `gates`,
  `repeat`, `layout`, `components`, split so that `node --test` runs them in parallel), `run.test.ts` (`clp run`),
  `cli.test.ts`, `stage.test.ts` (self-hosting). They share `test/support.ts` (`harness(name)` gives each file its own work directory; never share
  one, a file's `after` hook deletes it; `restamp(dir)` renews stamps after a test edits Layer 1) and use
  `test/fixtures/scripted-agent.ts` as a stand-in LLM. A test must not edit a spec file and load it again from the
  same path: write the changed copy to a new directory.

The repo is a colocated Jujutsu (`.jj/`) + git repository, so `git` normally shows a detached `HEAD`. Commit with `jj`.

## Commands

```bash
pnpm install
pnpm typecheck                                        # tsc over the whole repo and the specs
pnpm test                                             # all packages/**/*.test.ts (explicit glob; a bare `node --test` also runs fixtures)
node --test packages/cli/test/notation.test.ts        # one file
CLP_ALLOY=off node --test ...                          # without the Alloy checker (faster; deep cases may then need PBT luck)
pnpm -s clp compile examples/checkout-ts/specs         # read, type-check, check the specs; IR JSON on stdout, diagnostics on stderr
(cd examples/checkout-ts && pnpm exec clp verify --out .)   # PBT against the example (--seed N --path P to replay)

# Everything in one run: check, interpret, answer the review marks (accept / supplement Layer 1 / stop), accept,
# apply. Starts from the state of the specs and output; --json for JSON lines, --yes to write supplements unasked.
cd examples/checkout-ts && pnpm exec clp run --out . --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'

# Derive the interpretation of components whose prose has no content yet, or whose interpretation is stale.
# Writes specs/<name>.interpretation.draft.ts; --sessions 2 (default) adds an independent interpretation and reports
# where it behaves differently. Questions (// REVIEW:) and differences (// REVIEW(clp):) block --accept.
pnpm clp interpret --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
pnpm clp interpret --accept

# Bring production code and adapter into agreement with the specs (design, wiring, implementation; only what the
# state of the output calls for). Without --agent it only verifies and regenerates the test side.
cd examples/checkout-ts && pnpm exec clp apply --out . --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'

# Internal: does a self component's spec decide what its Stage 0 decides?
pnpm clp __agreement --specs packages/cli/self/specs --component gate-rules [--drafts]
```

`clp apply` options: `--out` (or `--src` / `--tests`; `--tests` ending in `.` makes its last part a file-name prefix),
`--component`, `--fresh`, `--from <phase>`, `--stop-after design`, `--max-attempts`, `--transcripts <dir>`,
`--asset [<phases>=]<file>`, `--drafts` (unreviewed drafts as the oracle: logged, recorded as `oracle: "draft"`, no
pass record), `--mutation auto|builtin|off`, `--static-check auto|tsc|off`, `--target typescript`, `--runs`,
`--agent-timeout <seconds>` (default 600).

Dependencies: `typescript` (in `@clp/cli`, plus `@types/node` at the root) and `fast-check`; `packages/core` has none.
Java is needed for the Alloy checker (`CLP_ALLOY_JAR`, or the jar is downloaded to `~/.cache/clp/` on first use;
results are cached in `~/.cache/clp/alloy-results/`; `CLP_ALLOY=off` disables it).

## Vocabulary

"Command" means what drives a component from outside; "query" what reads it; the commands of the outside world
(`external`) are its effects. In Japanese text: コマンド / 問い合わせ / 外の世界へのコマンド. "コマンド" can also mean a
shell command (the agent's command, `commandStrategy`); context tells. The command is `clp apply`, not `implement`
(the library function is still `implement()`); there is no `clp generate` or `clp test`.

## What is being built

A "Specification & Verification Engine": specs are written as TypeScript (read, never run), compiled to a
language-independent formal model (IR version 8), checked on their own (running the spec, Alloy, spec mutation),
and used to verify a production system from the outside by property-based testing. The platform owns *only*
spec/verification and places no constraints on the target system's architecture. Names: `co-llm-piler` (repo),
`clp` (CLI, `@clp/*`, the test-side directory, `CLP_*` variables); older names `aac`, "SpecForge".

## Documents and their precedence

| File | Role |
| --- | --- |
| `DSL.md` | The design of the DSL. **§17 is the current notation** (§17.18: what the implementation decided); §1–§16 are the history up to 0.3 |
| `REFERENCE.md` | One page for spec authors (English) |
| `SPEC.md` | Concept and layer design (written for 0.3; the layers and the LLM loop still hold) |
| `SELF_HOSTING.md` | Self-hosting: Stage 0 / Stage 1, the three fixed-point checks, the grading rules R1–R5 (§10) |
| `ROADMAP.md` | Completion conditions of 0.1 and 0.3 (done) and the stages towards 1.0 |
| `DISTRIBUTION.md` | How `clp` is built and shared; overrides `PACKAGE.md` where they conflict |
| `INCREMENTAL.md`, `OWNERSHIP.md` | Repeated runs; whose code is whose when components share production code |

## The notation (DSL.md §17)

- **Layer 1** is written by a person, as rough or as precise as they like: `service("sentence")` is the roughest form;
  headings (`state`, `commands`, `queries`, `rules`, `examples`, `conditions`, `calcs`, `does`) hold entries that are
  code or sentences; fragments (`is.x("…")`, `does.x("…")`, `value.x("…")`) put sentences inside code.
- **Layer 2, the interpretation**, is derived by an LLM and reviewed by a person, **never hand-written** (to change
  it, make Layer 1 more precise and run `clp interpret`). Written in the same notation: it fills, never overrides
  (`overwrite`, `wrong-heading`), may declare an `external` the prose implies, and must leave no prose
  (`prose-left`). Its meaning is expressions, so the oracle is the IR itself: there are no meaning functions and
  nothing of the spec runs as code. The one place the framework writes Layer 1 is `clp run`'s supplement: the
  person's own words, appended to a sentence after they confirm the diff; an LLM never writes Layer 1.
- **The IR (version 8)** is the formal model: components with state, events (guard, assigns, calls, output),
  queries, conditions, calcs, decisions, properties, the outside world's promises, `notes` (the prose) and `trace`.
  Strings are `["lit", …]`; the IR does not depend on where something was written.
- **Checks before any agent**: reading and typing (positions), the overlay of the interpretation, stamps and review
  marks, running the spec alone (`selfCheck8`: properties, map keys, no case applies), the author's examples, Alloy
  (properties, definedness, `requires` of called parts, a trace to every event; out-of-range components fall back to
  PBT with a warning), and spec mutation (`unobservable-value`; `rare` is a warning; the verdict uses two extra seeds).
- **Verification**: observed are answers of commands and queries and the commands to the outside world, in order;
  never state. A step that draws an entry outside its `requires` runs another entry that is in the spec. Integer
  inputs are drawn within the bounds `requires` states; strings near the spec's literals and lengths; a path segment
  of a route is never `"."` or `".."`. A query with parameters asked about something other than what the spec asks
  in that step fails (even if production code swallows the exception). `durable` components are restarted between
  steps (`ports.storage`, `restartSystem()`); `mayFail` queries throw one ask in four. Default runs 5000, 500 for a
  component that contains others or has routes.

## LLM as the compiler

The framework generates **test-side code only**; it never places types, signatures, or files in production code. The
pipeline: specs → checks → IR → three TDD phases, each a separate agent session wrapped in an **entry gate** (temp
directory outside the repo holding only that phase's allowlisted inputs) and an **exit gate** (audit, copy only
writable paths, regenerate `ir.json` / contract / `verify.ts`, `check.ts`, then the phase's check):

| Phase | Agent sees | Agent writes | Phase check |
| --- | --- | --- | --- |
| `design` | IR, spec view, guide, assets | `src/` skeleton (bodies throw `"not implemented"`) | type-checks; loads; quotes no spec sentence |
| `wiring` | adapter contract, skeleton — **not the IR** | `clp/<name>.adapter.ts` | type-checks; PBT fails for the "not implemented" reason (red), and a second run that stops at unimplemented code finds no adapter error |
| `implementation` | IR, spec view, skeleton, guide, assets — **not the adapter or contract** | `src/` bodies | type-checks with the adapter; PBT passes (green); mutation gate |

A failed check goes into the same phase's next `REQUEST.md`; when a phase exhausts its attempts the pipeline restarts
from `design`. Which phases run is decided from the state of the output (`planOf`): no production code, or a changed
boundary (`boundary8`) → all three; only the adapter missing → wiring, implementation; otherwise the existing code is
graded first (`attempt: 0`) and implementation runs only if it fails.

Invariants to preserve:

- What each phase may see is the mechanism: the wiring phase never sees the IR (so the adapter cannot encode business
  decisions); design and implementation never see the adapter contract. Do not add an input to a phase, and do not
  mention `ports` or the harness in the design/implementation requests or the default guide, without re-examining
  this. The skeleton is the one channel between them; `gates.ts` rejects skeletons that quote spec sentences.
- The layout is data: nothing outside `layout.ts` may assume `src/` or `clp/`. Production code is removed file by
  file, never by deleting the directory; `resolveLayout` refuses a `--src` that looks like a project root.
- Several components share production code; each has its own test side, named by component. Design and
  implementation see every component's IR; wiring sees none. After a component passes, the settled others are run
  again (`regression`). Whose code something is is decided by use (V8 coverage): a change to a file only other
  components use is undone (`out-of-scope`); mutation breaks what this component executed and what nobody executed
  in files it or nobody uses. A contained component's code is used, never changed or mutated, by its container.
- The adapter skeleton and unimplemented production code fail with different messages (`ADAPTER_NOT_WRITTEN` vs
  the target's `notImplemented`).
- Do not add a mode for "new" versus "changed"; express differences as state read in `planOf`.
- On repeated runs the wiring phase reads fully implemented code, so the mutation gate is the only guard against
  decisions copied into the adapter. Do not weaken it. The strings it may break are `decisionValues8`: decision-table
  cells and constants answered (commands, queries, the calcs they answer with) or sent to the outside world.
- Isolation belongs to the gates, not to strategies: no spec sources, no `verify.ts`, no repo paths in the sandbox.
- Production code carries zero constraints; the adapter adapts to it and is never restricted; whether decisions live
  in `src/` is established by mutation. Advice goes into the guide or assets, never pass/fail rules or business rules.
- `loop.ts` and `gates.ts` are language-agnostic: the target language only through `ctx.target` (`Target`).
- Type-checking the specs is unconditional; the static check of what agents wrote is a swappable strategy.
- The mutation pass rule lives in `judge` (`mutation.ts`), not in a strategy.
- `requires` puts a situation outside the spec: a rule the code must enforce is an answer, or the mutation gate
  pushes the check out of the code. Do not relax the gate for this; the interpreting request says the same.
- An agent that does not end normally (`AgentFailure`: cannot start, timeout, signal, non-zero exit) stops the run;
  nothing it left is graded. Spec errors (`status: "error"`, a `SpecError`) stop the loop instead of becoming feedback.
- The interpretation is the oracle and an LLM writes it: drafts never load by default (`--drafts` is the one opt-in,
  logged, `oracle: "draft"`, no pass record); `--accept` refuses open `// REVIEW:` / `// REVIEW(clp):` marks (a person
  changes Layer 1 or writes `REVIEWED`); a stale or unreviewed interpretation stops everything; never fix an
  interpretation by hand.
- The comparison of two interpretations is behavioural; later sessions get the first one's boundary (its commands,
  queries, answers and the outside world it declared) in their skeleton, never its draft, and are asked for a
  defensible less obvious reading. "No differences" is not a goal.
- Test cases are never LLM-written; generated files are a pure function of the IR; the PBT seed is derived from the
  spec hash. Diagnostics are `severity[code] where: message`. Agent-facing text is English; user-facing Japanese.
- Money and other exact quantities are integers, rounding spelled out. A cell a row does not use is `null`, never a
  filler.

## Self-hosting (SELF_HOSTING.md)

Nineteen of the framework's decisions are made by code generated from its own specs (`packages/cli/self/specs`, in
the 1.0 notation): the reader's judgements (`overlay-check`, `fill-check`, `syntax-check`, `type-check`, `fit-check`,
`sentence-trace`, `checker-verdict`, `usage-check`), the oracle's (`step-choice`, `outcome-apply`, `promise-keeper`,
`input-candidates`, `observation-compare`), the gate's (`gate-rules`, `mutation-judge`, `mutation-verdict`), the
contract's text (`text-plan`), and the procedures turned inside out (`pipeline`, `interpret-flow`). Keep these:

- **Stage 0 stays.** Each has a hand-written version (`R1_COMPONENTS8` and the imports of `v1/agreement.ts` name
  them). Stage 1 is used through the generated adapter (`adapterOf`), never by importing `self/src`, and only when the
  pass record (`clp/<name>.verified.json`) matches the specs and code as they are. If it cannot be used, a warning is
  printed and Stage 0 decides. `CLP_STAGE=0` forces Stage 0.
- **The reader and the oracle decide with Stage 0 and record every question** (`decide.ts`); the questions are then
  put to Stage 1 and must agree (`agree`, R4): a disagreement is a `FrameworkError`, never feedback. Procedures (the
  pipeline, `clp interpret`, spec mutation, the contract's text) are driven by Stage 1 when usable; anything outside
  the spec's domain (`--from`, limits outside 1..3, a question its `requires` excludes: `OUT` in `GLUE`) goes to
  Stage 0.
- **Grading components (R1–R5)**: a `clp apply` that reconciles one grades everything with Stage 0
  (`setGradingByStage0`, `CLP_GRADING_BY_STAGE0`); its record says `gradedBy: "stage0"` and carries the hash of its
  Stage 0 files; before the record is written, the human-kept cases (`self/cases/<name>.json`: `{ irVersion: 8,
  cases: [{ variant?, input }] }`) run through the new code and Stage 0 (`clp __cases`); any disagreement and no
  record. Never let a grading component grade itself.
- **Compare against Stage 0 before generating code**: `clp __agreement` runs a self component's *spec* (through
  `spec-adapter.ts`) against Stage 0 on many generated questions. A REVIEW question or a difference between two
  interpretations of a self spec is settled by which reading agrees with Stage 0 — but agreement only covers the
  questions generated: the agent's questions are worth reading (text-plan once truncated lists at eight entries,
  and the generator only made three).
- Pass records are per component but hash all production code: a run with `--component` leaves the others stale; a
  plain `clp apply` (no agent) re-grades and re-stamps. After changing `self/specs`, `self/src`, or a Stage 0 file of
  a grading component, run `clp apply --specs packages/cli/self/specs --out packages/cli/self` before committing.
- `stage.test.ts` holds the three fixed-point checks: Stage 1 agrees with Stage 0 on the cases and generated
  questions, and the pipeline and the interpret flow run the same under both; `clp compile` prints the same under
  both; the framework re-grades a copy of its own components on Stage 1 and reproduces the test side.

## Decided constraints for implementation

From `DISTRIBUTION.md`; settled decisions:

- **Node is the only runtime dependency**, with one exception: Java, for the Alloy checker, called as an external
  command. No Bun, Deno, single binaries, or Docker. No npm publishing; the git repo is the distribution channel.
- **No build step.** `.ts` runs directly via Node type stripping (Node >= 22.18; `.node-version` is 24). No `enum`,
  no `namespace`, no parameter properties; relative imports include `.ts`. Node refuses to strip `.ts` inside
  `node_modules`, which is why specs live in this repo.
- Keep third-party dependencies minimal. Use `util.parseArgs`. Resolve paths against `process.cwd()`.
- **Output must be deterministic**: sorted JSON keys, fixed indentation. Generated file headers carry only
  `ir-version` and `spec-hash`. The IR version is the sole compatibility contract.
- `--out` must sit where `@clp/cli/runtime` resolves (a workspace package like `examples/*`, or under
  `packages/cli/` as the tests do).
