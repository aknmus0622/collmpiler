/**
 * The exit gate's verdicts on files, test runs and places in production code.
 * Each exported function answers one question, from facts the caller has already
 * gathered about the session; none of them looks at a file or runs anything.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling a function has no effect on
 * anything. It corresponds to the specification's component `gate-rules`, and
 * each function performs one of its queries.
 */

/**
 * The phase of work a session belonged to. Specification name: parameter `phase`;
 * the values are the specification's own.
 *
 * - `"design"`: the skeleton of the production code is written.
 * - `"wiring"`: the skeleton is connected to the test harness by an adapter.
 * - `"implementation"`: the bodies of the production code are filled in.
 */
export type SessionPhase = "design" | "wiring" | "implementation";

/**
 * Why a test run happened. Specification name: parameter `purpose`; the values
 * are the specification's own.
 *
 * - `"implementation"`: the tests of the component being worked on.
 * - `"regression"`: another component's tests, run again.
 */
export type TestPurpose = "implementation" | "regression";

/**
 * The error a wiring test run stopped on. Specification name: parameter `error`;
 * the values are the specification's own.
 *
 * - `"none"`: there was no error.
 * - `"not-implemented"`: the marker thrown by a body not yet written.
 * - `"other"`: any other error.
 */
export type WiringError = "none" | "not-implemented" | "other";

/**
 * The verdict on a production file that existed before the session.
 * Specification name: the result of the query `ChangedFile`; the values are the
 * specification's own.
 *
 * - `"keep"`: the file stays as the session left it.
 * - `"out-of-scope"`: the session had no business changing the file.
 */
export type ChangedFileVerdict = "keep" | "out-of-scope";

/**
 * The verdict on a file of a contained component. Specification name: the result
 * of the query `PartFile`; the values are the specification's own.
 *
 * - `"keep"`: the file stays as the session left it.
 * - `"restore"`: the file is put back as it was, and the change counts as a violation.
 */
export type PartFileVerdict = "keep" | "restore";

/**
 * The verdict on a file missing from the sandbox at the end. Specification name:
 * the result of the query `Removed`; the values are the specification's own.
 *
 * - `"ok"`: nothing to report.
 * - `"removed"`: the session removed a file it must not remove.
 */
export type RemovedVerdict = "ok" | "removed";

/**
 * The verdict on a file found in the sandbox after the session. Specification
 * name: the result of the query `SandboxFile`; the values are the specification's own.
 *
 * - `"skip"`: the file is ignored.
 * - `"take"`: the file is collected as the session's work.
 * - `"keep"`: the file is left alone; nothing to report.
 * - `"toolchain-modified"`: a tool's file was tampered with.
 * - `"not-regular"`: the entry is something other than a regular file.
 * - `"unexpected"`: the file should not be there.
 * - `"input-modified"`: a file given to the session was tampered with.
 */
export type SandboxFileVerdict =
  | "skip"
  | "take"
  | "keep"
  | "toolchain-modified"
  | "not-regular"
  | "unexpected"
  | "input-modified";

/**
 * The verdict on a run of tests that must pass. Specification name: the result
 * of the query `Tests`; the values are the specification's own.
 *
 * - `"ok"`: nothing to report.
 * - `"failed"`: a failure of the work under test.
 * - `"regression"`: a failure in work that was already accepted.
 */
export type TestsVerdict = "ok" | "failed" | "regression";

/**
 * The verdict on the test run of the wiring phase. Specification name: the
 * result of the query `Wiring`; the values are the specification's own.
 *
 * - `"ok"`: nothing to report.
 * - `"passes-unimplemented"`: the adapter is doing the production code's work.
 * - `"adapter-error"`: the adapter itself is at fault.
 */
export type WiringVerdict = "ok" | "passes-unimplemented" | "adapter-error";

/**
 * What is known about a production file that existed before the session. The
 * field names are the specification's parameter names.
 */
export interface ChangedFileFacts {
  /** Whether the session changed the file (specification parameter `changed`). */
  changed: boolean;
  /** Whether the file has no behaviour of its own (specification parameter `inert`). */
  inert: boolean;
  /** Whether another component uses the file (specification parameter `usedByOthers`). */
  usedByOthers: boolean;
  /** Whether this component's tests use the file (specification parameter `usedByThis`). */
  usedByThis: boolean;
}

/**
 * What is known about a file of a contained component. The field names are the
 * specification's parameter names.
 */
export interface PartFileFacts {
  /** Whether the session changed the file (specification parameter `changed`). */
  changed: boolean;
  /** Whether the file existed before the session (specification parameter `existedBefore`). */
  existedBefore: boolean;
}

/**
 * What is known about a file that was put in the sandbox at the start and is
 * missing at the end. The field names are the specification's parameter names.
 */
export interface RemovedFacts {
  /** Whether the file is the test adapter (specification parameter `isAdapter`). */
  isAdapter: boolean;
  /** Whether the file is production code (specification parameter `isSource`). */
  isSource: boolean;
  /** The phase of the session (specification parameter `phase`). */
  phase: SessionPhase;
}

/**
 * What is known about a file found in the sandbox after the session. The field
 * names are the specification's parameter names. The caller supplies all nine
 * fields; a fact that does not apply to the file is `false`.
 */
export interface SandboxFileFacts {
  /** Whether the file is hidden, or is the request itself (specification parameter `hidden`). */
  hidden: boolean;
  /** Whether the file was put in the sandbox at the start (specification parameter `input`). */
  input: boolean;
  /** Whether that input is unchanged (specification parameter `inputIntact`). */
  inputIntact: boolean;
  /** Whether the file is the test adapter (specification parameter `isAdapter`). */
  isAdapter: boolean;
  /** Whether the file is production code (specification parameter `isSource`). */
  isSource: boolean;
  /** The phase of the session (specification parameter `phase`). */
  phase: SessionPhase;
  /** Whether it is a regular file (specification parameter `regular`). */
  regular: boolean;
  /** Whether it belongs to a tool, such as type definitions (specification parameter `toolchain`). */
  toolchain: boolean;
  /** Whether that tool's file is unchanged (specification parameter `toolchainIntact`). */
  toolchainIntact: boolean;
}

/**
 * What is known about a place in production code the mutation gate could break.
 * The field names are the specification's parameter names.
 */
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

/**
 * What is known about a run of tests that must pass. The field names are the
 * specification's parameter names.
 */
export interface TestsFacts {
  /** Whether the tests passed (specification parameter `passed`). */
  passed: boolean;
  /** Why they were run (specification parameter `purpose`). */
  purpose: TestPurpose;
}

/**
 * What is known about the test run of the wiring phase. The field names are the
 * specification's parameter names.
 */
export interface WiringFacts {
  /** The error the run stopped on (specification parameter `error`). */
  error: WiringError;
  /** Whether the tests passed (specification parameter `passed`). */
  passed: boolean;
  /** Whether unimplemented production code remains (specification parameter `unimplemented`). */
  unimplemented: boolean;
}

/**
 * Whether the session's phase may write the file: in the wiring phase only the
 * adapter, in the other phases only production code.
 */
function phaseMayWrite(file: { isAdapter: boolean; isSource: boolean; phase: SessionPhase }): boolean {
  return file.phase === "wiring" ? file.isAdapter : file.isSource;
}

/**
 * Performs the specification's query `ChangedFile` (`gate-rules.ChangedFile`).
 *
 * Accepts any combination of the facts and always answers. Reads no state.
 *
 * @param facts the file's facts, one field per specification parameter.
 * @returns the verdict on the file.
 */
export function decideChangedFile(facts: ChangedFileFacts): ChangedFileVerdict {
  if (!facts.changed) {
    return "keep";
  }
  return !facts.usedByThis && !facts.inert && facts.usedByOthers ? "out-of-scope" : "keep";
}

/**
 * Performs the specification's query `PartFile` (`gate-rules.PartFile`).
 *
 * Accepts any combination of the facts and always answers. Reads no state.
 *
 * @param facts the file's facts, one field per specification parameter.
 * @returns the verdict on the file.
 */
export function decidePartFile(facts: PartFileFacts): PartFileVerdict {
  return facts.existedBefore && facts.changed ? "restore" : "keep";
}

/**
 * Performs the specification's query `Removed` (`gate-rules.Removed`).
 *
 * Accepts any combination of the facts and always answers. Reads no state.
 *
 * @param facts the missing file's facts, one field per specification parameter.
 * @returns the verdict on the missing file.
 */
export function decideRemoved(facts: RemovedFacts): RemovedVerdict {
  return phaseMayWrite(facts) ? "ok" : "removed";
}

/**
 * Performs the specification's query `SandboxFile` (`gate-rules.SandboxFile`).
 *
 * Accepts any combination of the facts and always answers. Reads no state.
 *
 * @param facts the file's facts, one field per specification parameter.
 * @returns the verdict on the file.
 */
export function decideSandboxFile(facts: SandboxFileFacts): SandboxFileVerdict {
  if (facts.hidden) {
    return "skip";
  }
  if (facts.toolchain) {
    return facts.toolchainIntact ? "keep" : "toolchain-modified";
  }
  if (!facts.regular) {
    return "not-regular";
  }
  if (phaseMayWrite(facts)) {
    return "take";
  }
  if (!facts.input) {
    return "unexpected";
  }
  return facts.inputIntact ? "keep" : "input-modified";
}

/**
 * Performs the specification's query `Site` (`gate-rules.Site`).
 *
 * Accepts any combination of the facts and always answers. Reads no state.
 *
 * @param facts the place's facts, one field per specification parameter.
 * @returns `true` if the mutation gate breaks this place, `false` if it leaves it alone.
 */
export function decideSite(facts: SiteFacts): boolean {
  if (facts.executedByThis) {
    return true;
  }
  return !facts.executedByOthers && (facts.fileUsedByThis || !facts.fileUsedByOthers);
}

/**
 * Performs the specification's query `Tests` (`gate-rules.Tests`).
 *
 * Accepts any combination of the facts and always answers. Reads no state.
 *
 * @param facts the run's facts, one field per specification parameter.
 * @returns the verdict on the run.
 */
export function decideTests(facts: TestsFacts): TestsVerdict {
  if (facts.passed) {
    return "ok";
  }
  return facts.purpose === "regression" ? "regression" : "failed";
}

/**
 * Performs the specification's query `Wiring` (`gate-rules.Wiring`).
 *
 * Accepts any combination of the facts and always answers. Reads no state.
 *
 * @param facts the run's facts, one field per specification parameter.
 * @returns the verdict on the run.
 */
export function decideWiring(facts: WiringFacts): WiringVerdict {
  if (facts.passed) {
    return facts.unimplemented ? "passes-unimplemented" : "ok";
  }
  return facts.error === "other" ? "adapter-error" : "ok";
}
