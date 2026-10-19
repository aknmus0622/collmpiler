/**
 * Vocabulary of the gate rules: what each verdict is asked about, and the verdicts it can give.
 *
 * The gate rules have no state of their own (the specification's single state `READY`) and no dependencies.
 * Each command of the specification is one pure function in `gate-rules.ts`; its input fields are the fields
 * of the matching `...Facts` record below, with the same names as in the specification.
 */

/**
 * Which phase of the session is being judged. Corresponds to the specification's `phase` values one to one:
 *
 * - `"design"`: the skeleton of the production code is written
 * - `"wiring"`: the skeleton is connected to a test harness (an adapter is written)
 * - `"implementation"`: the bodies of the production code are filled in
 */
export type Phase = "design" | "wiring" | "implementation";

/** Facts about a production file that existed before the session. Input of the specification's `ChangedFile`. */
export interface ChangedFileFacts {
  /** Whether the session changed the file. */
  changed: boolean;
  /** Whether the file has no behaviour (types or declarations only). */
  inert: boolean;
  /** Whether the tests of another component of the system use the file. */
  usedByOthers: boolean;
  /** Whether the tests of the component being worked on use the file. */
  usedByThis: boolean;
}

/**
 * Verdict on a changed production file. Corresponds to the specification's `ChangedFile` answers:
 * `"keep"` (the file is kept as it is now), `"out-of-scope"` (the change touches code that is not this
 * component's to change).
 */
export type ChangedFileVerdict = "keep" | "out-of-scope";

/** Facts about a file of a contained component (a part). Input of the specification's `PartFile`. */
export interface PartFileFacts {
  /** Whether the session changed the file. */
  changed: boolean;
  /** Whether the file existed before the session. */
  existedBefore: boolean;
}

/**
 * Verdict on a file of a contained component. Corresponds to the specification's `PartFile` answers:
 * `"keep"` (the file is kept), `"restore"` (the file is put back as it was, and the change is a violation).
 */
export type PartFileVerdict = "keep" | "restore";

/**
 * Facts about a file that was put in the sandbox at the start and is missing at the end. Input of the
 * specification's `Removed`.
 */
export interface RemovedFacts {
  /** Whether the file is the test adapter (the harness code written in the wiring phase). */
  isAdapter: boolean;
  /** Whether the file is production code (under `src/`). */
  isSource: boolean;
  /** The phase being judged. */
  phase: Phase;
}

/**
 * Verdict on a missing file. Corresponds to the specification's `Removed` answers: `"ok"` (its absence is
 * accepted), `"removed"` (the session removed a file it should not have).
 */
export type RemovedVerdict = "ok" | "removed";

/** Facts about a file found in the sandbox after the session. Input of the specification's `SandboxFile`. */
export interface SandboxFileFacts {
  /** Whether the file is hidden, or is the request itself. */
  hidden: boolean;
  /** Whether the file was put in the sandbox at the start (an input of the session). */
  input: boolean;
  /** Whether the file, if it was an input, still has its original content. */
  inputIntact: boolean;
  /** Whether the file is the test adapter (the harness code written in the wiring phase). */
  isAdapter: boolean;
  /** Whether the file is production code (under `src/`). */
  isSource: boolean;
  /** The phase being judged. */
  phase: Phase;
  /** Whether the file is a regular file (not a directory entry of another kind, such as a link). */
  regular: boolean;
  /** Whether the file belongs to a tool (for example type definitions under `node_modules`). */
  toolchain: boolean;
  /** Whether the file, if it belongs to a tool, still has its original content. */
  toolchainIntact: boolean;
}

/**
 * Verdict on a file found in the sandbox. Corresponds to the specification's `SandboxFile` answers one to one:
 *
 * - `"skip"`: the file is ignored
 * - `"take"`: the file is taken as the session's work
 * - `"keep"`: the file is kept as it is
 * - `"toolchain-modified"`: a tool's file was modified
 * - `"not-regular"`: the file is not a regular file
 * - `"unexpected"`: the file should not be there
 * - `"input-modified"`: an input of the session was modified
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
 * Facts about a place in production code that the mutation gate could break. Input of the specification's
 * `Site`.
 */
export interface SiteFacts {
  /** Whether the tests of another component executed the place. */
  executedByOthers: boolean;
  /** Whether the tests of the component being worked on executed the place. */
  executedByThis: boolean;
  /** Whether the tests of another component use the file the place is in. */
  fileUsedByOthers: boolean;
  /** Whether the tests of the component being worked on use the file the place is in. */
  fileUsedByThis: boolean;
}

/**
 * Why a test run happened. Corresponds to the specification's `purpose` values: `"implementation"` (the
 * component's own tests), `"regression"` (another component's tests run again).
 */
export type TestsPurpose = "implementation" | "regression";

/** Facts about a test run that must pass. Input of the specification's `Tests`. */
export interface TestsFacts {
  /** Whether the tests passed. */
  passed: boolean;
  /** Why the tests were run. */
  purpose: TestsPurpose;
}

/**
 * Verdict on a test run. Corresponds to the specification's `Tests` answers: `"ok"` (accepted), `"failed"`
 * (the component's tests failed), `"regression"` (another component's tests now fail).
 */
export type TestsVerdict = "ok" | "failed" | "regression";

/**
 * The error a failing wiring-phase test run ended with. Corresponds to the specification's `error` values:
 * `"none"` (no error, or the tests did not fail with one), `"not-implemented"` (the unimplemented marker
 * thrown by a skeleton body), `"other"` (any other error).
 */
export type WiringError = "none" | "not-implemented" | "other";

/** Facts about the test run of the wiring phase. Input of the specification's `Wiring`. */
export interface WiringFacts {
  /** The error the tests failed with. */
  error: WiringError;
  /** Whether the tests passed. */
  passed: boolean;
  /** Whether production code still contains unimplemented bodies. */
  unimplemented: boolean;
}

/**
 * Verdict on the wiring phase's test run. Corresponds to the specification's `Wiring` answers: `"ok"`
 * (accepted), `"passes-unimplemented"` (the adapter does the work the production code should do),
 * `"adapter-error"` (the adapter fails in a way other than reaching unimplemented code).
 */
export type WiringVerdict = "ok" | "passes-unimplemented" | "adapter-error";
