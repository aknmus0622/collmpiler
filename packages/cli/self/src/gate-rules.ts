/**
 * Verdicts of the exit gate about the files found after an agent session,
 * about test runs, and about places in production code that the mutation
 * gate may mutate.
 *
 * Corresponds to the specification component "gate-rules". The component has
 * no state of its own (it is always in the specification state `READY`) and
 * keeps no data between calls: each specification command is one pure
 * function below. The function takes the command's input fields as a single
 * object (field names identical to the specification's) and returns the
 * command's answer (answer values identical to the specification's).
 *
 * Command -> function:
 *   `ChangedFile` -> `changedFileVerdict`
 *   `PartFile`    -> `partFileVerdict`
 *   `Removed`     -> `removedVerdict`
 *   `SandboxFile` -> `sandboxFileVerdict`
 *   `Site`        -> `siteIsBroken`
 *   `Tests`       -> `testsVerdict`
 *   `Wiring`      -> `wiringVerdict`
 */

/** Pipeline phase whose session is being checked (spec field `phase`). */
export type Phase = "design" | "wiring" | "implementation";

/** Kind of error reported by the wiring phase's test run (spec field `error` of `Wiring`). */
export type WiringError =
  /** No error was reported. */
  | "none"
  /** The error was the "not implemented" marker thrown by skeleton bodies. */
  | "not-implemented"
  /** Any other error. */
  | "other";

/** Whose test suite was run (spec field `purpose` of `Tests`). */
export type TestPurpose =
  /** The suite of the component currently being worked on. */
  | "implementation"
  /** The suite of a different component, re-executed to detect breakage. */
  | "regression";

// ---------------------------------------------------------------------------
// ChangedFile
// ---------------------------------------------------------------------------

/** Input of `ChangedFile`: facts about one production file present before the session. */
export interface ChangedFileFacts {
  /** Whether its content differs after the session. */
  changed: boolean;
  /** Whether it contains only declarations without runtime behaviour (types, interfaces). */
  inert: boolean;
  /** Whether some different component depends on it. */
  usedByOthers: boolean;
  /** Whether the current component's test suite depends on it. */
  usedByThis: boolean;
}

/** Answer of `ChangedFile`; values as in the specification (`"keep"`, `"out-of-scope"`). */
export type ChangedFileVerdict = "keep" | "out-of-scope";

/** Performs `ChangedFile` on the given facts and returns the gate's verdict for that file. */
export function changedFileVerdict(facts: ChangedFileFacts): ChangedFileVerdict {
  return facts.changed && !facts.usedByThis && !facts.inert && facts.usedByOthers ? "out-of-scope" : "keep";
}

// ---------------------------------------------------------------------------
// PartFile
// ---------------------------------------------------------------------------

/** Input of `PartFile`: facts about one file of a contained component. */
export interface PartFileFacts {
  /** Whether its content differs after the session. */
  changed: boolean;
  /** Whether it was present when the session began. */
  existedBefore: boolean;
}

/**
 * Answer of `PartFile`; values as in the specification. `"restore"` asks the
 * caller to put the original content back and record a violation.
 */
export type PartFileVerdict = "keep" | "restore";

/** Performs `PartFile` on the given facts and returns the gate's verdict for that file. */
export function partFileVerdict(facts: PartFileFacts): PartFileVerdict {
  return facts.existedBefore && facts.changed ? "restore" : "keep";
}

// ---------------------------------------------------------------------------
// Removed
// ---------------------------------------------------------------------------

/** Input of `Removed`: facts about one initial sandbox file absent at the end. */
export interface RemovedFacts {
  /** Whether that path is the test adapter. */
  isAdapter: boolean;
  /** Whether that path is production code (under `src/`). */
  isSource: boolean;
  /** Phase whose session ran. */
  phase: Phase;
}

/** Answer of `Removed`; values as in the specification (`"ok"`, `"removed"`). */
export type RemovedVerdict = "ok" | "removed";

/** Performs `Removed` on the given facts and returns the gate's verdict for the absent file. */
export function removedVerdict(facts: RemovedFacts): RemovedVerdict {
  return phaseMayWrite(facts.phase, facts) ? "ok" : "removed";
}

/** Whether a session of the given phase may write the path: the adapter in the wiring phase, production code otherwise. */
function phaseMayWrite(phase: Phase, path: { isAdapter: boolean; isSource: boolean }): boolean {
  return phase === "wiring" ? path.isAdapter : path.isSource;
}

// ---------------------------------------------------------------------------
// SandboxFile
// ---------------------------------------------------------------------------

/** Input of `SandboxFile`: facts about one path found in the sandbox after the session. */
export interface SandboxFileFacts {
  /** Whether it is a dot-file / dot-directory entry, or the request document itself. */
  hidden: boolean;
  /** Whether it was among the files placed in the sandbox at the start. */
  input: boolean;
  /** For such an initial file: whether its content is unchanged. */
  inputIntact: boolean;
  /** Whether it is the test adapter. */
  isAdapter: boolean;
  /** Whether it is production code (under `src/`). */
  isSource: boolean;
  /** Phase whose session ran. */
  phase: Phase;
  /** Whether it is an ordinary file (as opposed to a directory, symlink, device, ...). */
  regular: boolean;
  /** Whether it belongs to the toolchain (for example the type definitions in `node_modules`). */
  toolchain: boolean;
  /** For such a toolchain file: whether its content is unchanged. */
  toolchainIntact: boolean;
}

/**
 * Answer of `SandboxFile`; values as in the specification. `"take"` means the
 * caller accepts the file as output of the session, `"skip"` that it ignores
 * it, `"keep"` that it leaves it in place; the remaining values are
 * violations named after their kind.
 */
export type SandboxFileVerdict =
  | "skip"
  | "take"
  | "keep"
  | "toolchain-modified"
  | "not-regular"
  | "unexpected"
  | "input-modified";

/** Performs `SandboxFile` on the given facts and returns the gate's verdict for that path. */
export function sandboxFileVerdict(facts: SandboxFileFacts): SandboxFileVerdict {
  if (facts.hidden) return "skip";
  if (facts.toolchain) return facts.toolchainIntact ? "keep" : "toolchain-modified";
  if (!facts.regular) return "not-regular";
  if (phaseMayWrite(facts.phase, facts)) return "take";
  if (!facts.input) return "unexpected";
  return facts.inputIntact ? "keep" : "input-modified";
}

// ---------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------

/** Input of `Site`: facts about one mutable place in production code. */
export interface SiteFacts {
  /** Whether some different component's suite ran through it. */
  executedByOthers: boolean;
  /** Whether the current component's suite ran through it. */
  executedByThis: boolean;
  /** Whether some different component depends on the file containing it. */
  fileUsedByOthers: boolean;
  /** Whether the current component depends on the file containing it. */
  fileUsedByThis: boolean;
}

/**
 * Performs `Site` on the given facts. Returns the specification's boolean
 * answer: `true` means the mutation gate mutates this place, `false` that it
 * leaves it alone.
 */
export function siteIsBroken(facts: SiteFacts): boolean {
  if (facts.executedByThis) return true;
  return !facts.executedByOthers && (facts.fileUsedByThis || !facts.fileUsedByOthers);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Input of `Tests`: the outcome of one required test-suite run. */
export interface TestsFacts {
  /** Whether every test of the run succeeded. */
  passed: boolean;
  /** Whose suite it was. */
  purpose: TestPurpose;
}

/** Answer of `Tests`; values as in the specification (`"ok"`, `"failed"`, `"regression"`). */
export type TestsVerdict = "ok" | "failed" | "regression";

/** Performs `Tests` on the given facts and returns the gate's verdict for the run. */
export function testsVerdict(facts: TestsFacts): TestsVerdict {
  if (facts.passed) return "ok";
  return facts.purpose === "regression" ? "regression" : "failed";
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/** Input of `Wiring`: the outcome of the test run at the end of the wiring phase. */
export interface WiringFacts {
  /** Kind of error reported by the run. */
  error: WiringError;
  /** Whether every test of the run succeeded. */
  passed: boolean;
  /** Whether production code still contains skeleton bodies. */
  unimplemented: boolean;
}

/**
 * Answer of `Wiring`; values as in the specification (`"ok"`,
 * `"passes-unimplemented"`, `"adapter-error"`).
 */
export type WiringVerdict = "ok" | "passes-unimplemented" | "adapter-error";

/** Performs `Wiring` on the given facts and returns the gate's verdict for the run. */
export function wiringVerdict(facts: WiringFacts): WiringVerdict {
  if (!facts.passed && facts.error === "other") return "adapter-error";
  if (facts.passed && facts.unimplemented) return "passes-unimplemented";
  return "ok";
}
