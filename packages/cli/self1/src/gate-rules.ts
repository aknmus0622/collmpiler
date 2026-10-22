/**
 * Gate rules: the exit gate's verdicts on files, test runs and places in
 * production code.
 *
 * Corresponds to the specification component `gate-rules`. It has no state and
 * no dependencies; each of its queries is implemented here by a pure function
 * that answers the same result for the same arguments and touches nothing:
 *
 * - `ChangedFile` → {@link changedFileVerdict}
 * - `PartFile`    → {@link partFileVerdict}
 * - `Removed`     → {@link removedVerdict}
 * - `SandboxFile` → {@link sandboxFileVerdict}
 * - `Site`        → {@link siteBroken}
 * - `Tests`       → {@link testsVerdict}
 * - `Wiring`      → {@link wiringVerdict}
 */

/**
 * The phase of the session being judged (specification parameter `phase`).
 *
 * - `"design"`: step 1, the skeleton of the production code is written.
 * - `"wiring"`: step 2, the skeleton is connected to a test harness by an adapter.
 * - `"implementation"`: step 3, the bodies of the production code are filled in.
 */
export type Phase = "design" | "wiring" | "implementation";

// ---------------------------------------------------------------------------
// ChangedFile

/**
 * Specification query `gate-rules.ChangedFile` (calculation `changedFile`).
 *
 * Judges a production file that existed before the session.
 *
 * @param file the facts about the file (the specification's parameters, as one record).
 * @returns whether the file's state after the session is kept (the specification's result).
 */
export function changedFileVerdict(file: ChangedFileFacts): ChangedFileVerdict {
  if (!file.changed) return "keep";
  return !file.usedByThis && !file.inert && file.usedByOthers ? "out-of-scope" : "keep";
}

/** The input of the `ChangedFile` query. Each field is the specification parameter of the same name. */
export interface ChangedFileFacts {
  /** Whether the session changed the file (specification parameter `changed`). */
  changed: boolean;
  /** Whether the file has no behaviour, e.g. only types (specification parameter `inert`). */
  inert: boolean;
  /** Whether another component's tests use the file (specification parameter `usedByOthers`). */
  usedByOthers: boolean;
  /** Whether this component's tests use the file (specification parameter `usedByThis`). */
  usedByThis: boolean;
}

/**
 * The verdict on an existing production file (the specification's result of `ChangedFile`).
 *
 * - `"keep"`: the file is kept as the session left it.
 * - `"out-of-scope"`: the session changed a file that is not this component's to change.
 */
export type ChangedFileVerdict = "keep" | "out-of-scope";

// ---------------------------------------------------------------------------
// PartFile

/**
 * Specification query `gate-rules.PartFile` (calculation `partFile`).
 *
 * Judges a file of a component this one contains.
 *
 * @param file the facts about the file (the specification's parameters, as one record).
 * @returns what to do with the file (the specification's result).
 */
export function partFileVerdict(file: PartFileFacts): PartFileVerdict {
  return file.existedBefore && file.changed ? "restore" : "keep";
}

/** The input of the `PartFile` query. Each field is the specification parameter of the same name. */
export interface PartFileFacts {
  /** Whether the session changed the file (specification parameter `changed`). */
  changed: boolean;
  /** Whether the file existed before the session (specification parameter `existedBefore`). */
  existedBefore: boolean;
}

/**
 * What to do with a contained component's file (the specification's result of `PartFile`).
 *
 * - `"keep"`: the file is kept as the session left it.
 * - `"restore"`: the file is put back as it was before the session; the change is a violation.
 */
export type PartFileVerdict = "keep" | "restore";

// ---------------------------------------------------------------------------
// Removed

/**
 * Specification query `gate-rules.Removed` (calculation `removed`).
 *
 * Judges a file that was put in the sandbox at the start and is missing at the end.
 *
 * @param file the facts about the missing file (the specification's parameters, as one record).
 * @returns whether its absence is acceptable (the specification's result).
 */
export function removedVerdict(file: RemovedFileFacts): RemovedVerdict {
  return phaseMayWrite(file) ? "ok" : "removed";
}

/** The input of the `Removed` query. Each field is the specification parameter of the same name. */
export interface RemovedFileFacts {
  /** Whether the file is the test adapter (specification parameter `isAdapter`). */
  isAdapter: boolean;
  /** Whether the file is production code (specification parameter `isSource`). */
  isSource: boolean;
  /** The phase of the session (specification parameter `phase`). */
  phase: Phase;
}

/**
 * The verdict on a missing file (the specification's result of `Removed`).
 *
 * - `"ok"`: its absence is acceptable.
 * - `"removed"`: the session removed a file it should not have.
 */
export type RemovedVerdict = "ok" | "removed";

// ---------------------------------------------------------------------------
// SandboxFile

/**
 * Specification query `gate-rules.SandboxFile` (calculation `sandboxFile`).
 *
 * Judges a file found in the sandbox after the session.
 *
 * @param file the facts about the file (the specification's parameters, as one record).
 * @returns what the gate does with the file (the specification's result).
 */
export function sandboxFileVerdict(file: SandboxFileFacts): SandboxFileVerdict {
  if (file.hidden) return "skip";
  if (file.toolchain) return file.toolchainIntact ? "keep" : "toolchain-modified";
  if (!file.regular) return "not-regular";
  if (phaseMayWrite(file)) return "take";
  if (!file.input) return "unexpected";
  return file.inputIntact ? "keep" : "input-modified";
}

/** The input of the `SandboxFile` query. Each field is the specification parameter of the same name. */
export interface SandboxFileFacts {
  /** Whether the file is hidden, or is the request itself (specification parameter `hidden`). */
  hidden: boolean;
  /** Whether the file was put in the sandbox at the start (specification parameter `input`). */
  input: boolean;
  /** Whether that input file is unchanged (specification parameter `inputIntact`). */
  inputIntact: boolean;
  /** Whether the file is the test adapter (specification parameter `isAdapter`). */
  isAdapter: boolean;
  /** Whether the file is production code (specification parameter `isSource`). */
  isSource: boolean;
  /** The phase of the session (specification parameter `phase`). */
  phase: Phase;
  /** Whether the file is a regular file (not a link, directory, device…) (specification parameter `regular`). */
  regular: boolean;
  /** Whether the file belongs to the toolchain, such as type definitions (specification parameter `toolchain`). */
  toolchain: boolean;
  /** Whether that toolchain file is unchanged (specification parameter `toolchainIntact`). */
  toolchainIntact: boolean;
}

/**
 * What the gate does with a file found in the sandbox (the specification's result of `SandboxFile`).
 *
 * - `"skip"`: the file is ignored.
 * - `"take"`: the file is taken as the session's output.
 * - `"keep"`: the file is fine and left as it is.
 * - `"toolchain-modified"`: a toolchain file was modified.
 * - `"not-regular"`: the file is not a regular file.
 * - `"unexpected"`: the file should not be there.
 * - `"input-modified"`: a file given at the start was modified.
 */
export type SandboxFileVerdict =
  | "skip"
  | "take"
  | "keep"
  | "toolchain-modified"
  | "not-regular"
  | "unexpected"
  | "input-modified";

// ---------------------------------------------------------------------------
// Site

/**
 * Specification query `gate-rules.Site` (calculation `site`).
 *
 * Judges a place in production code that the mutation gate could break.
 *
 * @param site the facts about the place (the specification's parameters, as one record).
 * @returns `true` if the mutation gate breaks the place, `false` if it leaves it alone
 *          (the specification's boolean result).
 */
export function siteBroken(site: SiteFacts): boolean {
  if (site.executedByThis) return true;
  return !site.executedByOthers && (site.fileUsedByThis || !site.fileUsedByOthers);
}

/** The input of the `Site` query. Each field is the specification parameter of the same name. */
export interface SiteFacts {
  /** Whether another component's tests executed the place (specification parameter `executedByOthers`). */
  executedByOthers: boolean;
  /** Whether this component's tests executed the place (specification parameter `executedByThis`). */
  executedByThis: boolean;
  /** Whether another component uses the place's file (specification parameter `fileUsedByOthers`). */
  fileUsedByOthers: boolean;
  /** Whether this component uses the place's file (specification parameter `fileUsedByThis`). */
  fileUsedByThis: boolean;
}

// ---------------------------------------------------------------------------
// Tests

/**
 * Specification query `gate-rules.Tests` (calculation `tests`).
 *
 * Judges a run of tests that must pass.
 *
 * @param run the facts about the run (the specification's parameters, as one record).
 * @returns the verdict on the run (the specification's result).
 */
export function testsVerdict(run: TestRunFacts): TestsVerdict {
  if (run.passed) return "ok";
  return run.purpose === "regression" ? "regression" : "failed";
}

/** The input of the `Tests` query. Each field is the specification parameter of the same name. */
export interface TestRunFacts {
  /** Whether the tests passed (specification parameter `passed`). */
  passed: boolean;
  /** Why the tests were run (specification parameter `purpose`). */
  purpose: TestPurpose;
}

/**
 * Why a test run happened (specification parameter `purpose`).
 *
 * - `"implementation"`: this component's own tests.
 * - `"regression"`: another component's tests, run again.
 */
export type TestPurpose = "implementation" | "regression";

/**
 * The verdict on a test run (the specification's result of `Tests`).
 *
 * - `"ok"`: the run is acceptable.
 * - `"failed"`: this component's tests failed.
 * - `"regression"`: another component's tests failed.
 */
export type TestsVerdict = "ok" | "failed" | "regression";

// ---------------------------------------------------------------------------
// Wiring

/**
 * Specification query `gate-rules.Wiring` (calculation `wiring`).
 *
 * Judges the test run of the wiring phase.
 *
 * @param run the facts about the run (the specification's parameters, as one record).
 * @returns the verdict on the run (the specification's result).
 */
export function wiringVerdict(run: WiringRunFacts): WiringVerdict {
  if (run.passed) return run.unimplemented ? "passes-unimplemented" : "ok";
  return run.error === "other" ? "adapter-error" : "ok";
}

/** The input of the `Wiring` query. Each field is the specification parameter of the same name. */
export interface WiringRunFacts {
  /** The kind of error the failing tests reported (specification parameter `error`). */
  error: WiringError;
  /** Whether the tests passed (specification parameter `passed`). */
  passed: boolean;
  /** Whether unimplemented production code remains (specification parameter `unimplemented`). */
  unimplemented: boolean;
}

/**
 * The kind of error a wiring test run reported (specification parameter `error`).
 *
 * - `"none"`: no error.
 * - `"not-implemented"`: the unimplemented marker (`new Error("not implemented")`).
 * - `"other"`: any other error.
 */
export type WiringError = "none" | "not-implemented" | "other";

/**
 * The verdict on the wiring phase's test run (the specification's result of `Wiring`).
 *
 * - `"ok"`: the run is acceptable.
 * - `"passes-unimplemented"`: the tests pass without the production code doing the work
 *   (the adapter does it).
 * - `"adapter-error"`: the run failed because of an error in the wiring.
 */
export type WiringVerdict = "ok" | "passes-unimplemented" | "adapter-error";

// ---------------------------------------------------------------------------
// Shared rules

/**
 * Whether the phase may write the file: in the wiring phase only the adapter,
 * in the other phases only production code.
 */
function phaseMayWrite(file: { isAdapter: boolean; isSource: boolean; phase: Phase }): boolean {
  return file.phase === "wiring" ? file.isAdapter : file.isSource;
}
