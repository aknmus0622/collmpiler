import { commands, input, service } from "@clp/core";

// The verdicts of the exit gate (packages/cli/src/rules.ts): after an agent session, which files are taken from the sandbox
// and which changes are violations; whether the wiring phase is red for the right reason; whether the tests pass; which
// changed files are out of scope; and which places in production code the mutation gate breaks. Each question is asked with
// the facts about one file, one test run or one place, and answered. Collecting the facts is not this component's job.
//
// This is a grading component (SELF_HOSTING.md §10.3, R1): it is always graded by Stage 0, and in use its verdicts are
// combined with Stage 0's, the stricter way.
const Phase = ["design", "wiring", "implementation"] as const;

export const SandboxFileInput = input({
  hidden: "boolean",
  toolchain: "boolean",
  toolchainIntact: "boolean",
  regular: "boolean",
  phase: Phase,
  isAdapter: "boolean",
  isSource: "boolean",
  input: "boolean",
  inputIntact: "boolean",
});
export const RemovedInput = input({ phase: Phase, isAdapter: "boolean", isSource: "boolean" });
export const PartFileInput = input({ changed: "boolean", existedBefore: "boolean" });
export const WiringInput = input({ passed: "boolean", unimplemented: "boolean", error: ["none", "not-implemented", "other"] });
export const TestsInput = input({ passed: "boolean", purpose: ["implementation", "regression"] });
export const ChangedFileInput = input({ changed: "boolean", usedByThis: "boolean", inert: "boolean", usedByOthers: "boolean" });
export const SiteInput = input({ executedByThis: "boolean", executedByOthers: "boolean", fileUsedByThis: "boolean", fileUsedByOthers: "boolean" });

export const Command = commands({
  SandboxFile: {
    input: SandboxFileInput,
    output: ["skip", "take", "keep", "toolchain-modified", "not-regular", "unexpected", "input-modified"],
    does:
      "A file found in the sandbox after the session, judged in this order. A hidden file (or the request) is skipped. A tool's " +
      "file (type definitions) is kept if it is intact, and otherwise it was modified (toolchain-modified). A file that is not a " +
      "regular file is not-regular. A file the phase may write is taken: in the wiring phase only the adapter, in the other phases " +
      "only production code. Any other file that was not put there at the start is unexpected; one that was is kept if intact, and " +
      "otherwise it was modified (input-modified).",
  },
  Removed: {
    input: RemovedInput,
    output: ["ok", "removed"],
    does: "A file put in the sandbox at the start is missing at the end. That is fine for a file the phase may write (see SandboxFile); otherwise it was removed.",
  },
  PartFile: {
    input: PartFileInput,
    output: ["keep", "restore"],
    does: "A file of a component this one contains. If it existed before and was changed, it is restored (and the change is a violation); otherwise it is kept.",
  },
  Wiring: {
    input: WiringInput,
    output: ["ok", "passes-unimplemented", "adapter-error"],
    does:
      "The tests of the wiring phase have run. If they passed while unimplemented production code remains, they passes-unimplemented " +
      "(the adapter does the work); if they passed and nothing is unimplemented, ok. If they failed because of an error other than " +
      "the unimplemented marker, adapter-error; otherwise (failed for the right reason, or without an error), ok.",
  },
  Tests: {
    input: TestsInput,
    output: ["ok", "failed", "regression"],
    does: "Tests that must pass have run: ok if they passed. Otherwise failed, or regression when they are another component's tests run again.",
  },
  ChangedFile: {
    input: ChangedFileInput,
    output: ["keep", "out-of-scope"],
    does:
      "A production file that existed before the session, and whether the session changed it. A file that was not changed is " +
      "always kept. A changed file is out of scope when this component's tests never use it, it has behaviour (not inert), and " +
      "another component uses it; otherwise it is kept.",
  },
  Site: {
    input: SiteInput,
    output: "boolean",
    does:
      "A place in production code the mutation gate could break. It is broken (true) if this component's tests executed it. If " +
      "they did not: it is broken if no other component executed it either, and its file is used by this component or by no other.",
  },
});

export const GateRules = service({
  description: "Decides the exit gate's verdicts on files, test runs and places in production code.",
  uses: [Command],
});
