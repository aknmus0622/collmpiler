import type {
  ChangedFileFacts,
  ChangedFileVerdict,
  PartFileFacts,
  PartFileVerdict,
  Phase,
  RemovedFacts,
  RemovedVerdict,
  SandboxFileFacts,
  SandboxFileVerdict,
  SiteFacts,
  TestsFacts,
  TestsVerdict,
  WiringFacts,
  WiringVerdict,
} from "./types.ts";

/**
 * The gate-rules component: decides the exit gate's verdicts on files, test runs and places in production
 * code. It has no state, no remembered data and no dependencies. Each function performs one command of the
 * specification: it takes that command's input fields as one record and returns the command's answer. The
 * functions read only their argument and may be called in any order.
 */

/**
 * Performs the command `ChangedFile`: judges a production file that existed before the session.
 *
 * @param facts the command's input; see `ChangedFileFacts`
 * @returns the command's answer; see `ChangedFileVerdict`
 */
export function changedFileVerdict(facts: ChangedFileFacts): ChangedFileVerdict {
  const outOfScope = facts.changed && !facts.usedByThis && !facts.inert && facts.usedByOthers;
  return outOfScope ? "out-of-scope" : "keep";
}

/**
 * Performs the command `PartFile`: judges a file of a component this one contains.
 *
 * @param facts the command's input; see `PartFileFacts`
 * @returns the command's answer; see `PartFileVerdict`
 */
export function partFileVerdict(facts: PartFileFacts): PartFileVerdict {
  return facts.existedBefore && facts.changed ? "restore" : "keep";
}

/**
 * Performs the command `Removed`: judges a file that was put in the sandbox at the start and is missing at
 * the end.
 *
 * @param facts the command's input; see `RemovedFacts`
 * @returns the command's answer; see `RemovedVerdict`
 */
export function removedVerdict(facts: RemovedFacts): RemovedVerdict {
  return phaseMayWrite(facts.phase, facts) ? "ok" : "removed";
}

/**
 * Performs the command `SandboxFile`: judges a file found in the sandbox after the session.
 *
 * @param facts the command's input; see `SandboxFileFacts`
 * @returns the command's answer; see `SandboxFileVerdict`
 */
export function sandboxFileVerdict(facts: SandboxFileFacts): SandboxFileVerdict {
  if (facts.hidden) return "skip";
  if (facts.toolchain) return facts.toolchainIntact ? "keep" : "toolchain-modified";
  if (!facts.regular) return "not-regular";
  if (phaseMayWrite(facts.phase, facts)) return "take";
  if (!facts.input) return "unexpected";
  return facts.inputIntact ? "keep" : "input-modified";
}

/**
 * Performs the command `Site`: judges a place in production code the mutation gate could break.
 *
 * @param facts the command's input; see `SiteFacts`
 * @returns the command's answer: true when the mutation gate breaks the place, false when it leaves it alone
 */
export function siteBroken(facts: SiteFacts): boolean {
  if (facts.executedByThis) return true;
  return !facts.executedByOthers && (facts.fileUsedByThis || !facts.fileUsedByOthers);
}

/**
 * Performs the command `Tests`: judges a test run that must pass.
 *
 * @param facts the command's input; see `TestsFacts`
 * @returns the command's answer; see `TestsVerdict`
 */
export function testsVerdict(facts: TestsFacts): TestsVerdict {
  if (facts.passed) return "ok";
  return facts.purpose === "regression" ? "regression" : "failed";
}

/**
 * Performs the command `Wiring`: judges the test run of the wiring phase.
 *
 * @param facts the command's input; see `WiringFacts`
 * @returns the command's answer; see `WiringVerdict`
 */
export function wiringVerdict(facts: WiringFacts): WiringVerdict {
  if (!facts.passed && facts.error === "other") return "adapter-error";
  if (facts.passed && facts.unimplemented) return "passes-unimplemented";
  return "ok";
}

/**
 * Whether the phase may write the file: in the wiring phase only the adapter, in the other phases only
 * production code.
 */
function phaseMayWrite(phase: Phase, file: { isAdapter: boolean; isSource: boolean }): boolean {
  return phase === "wiring" ? file.isAdapter : file.isSource;
}
