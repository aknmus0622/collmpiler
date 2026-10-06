import type { Feedback } from "./gates.ts";
import { FILES, SOURCE_DIR, TEST_DIR } from "./generate.ts";

// エージェントに渡す依頼文。仕様固有の内容は書かない（仕様は IR が全て）。エージェント向けなので英語。

function renderFeedback(feedback: Feedback): string {
  if (feedback.kind === "check") {
    const lines = feedback.violations.map((v) => `- \`${v.file}\` [${v.rule}] ${v.message}`);
    return `The previous attempt was rejected before testing because it broke the rules:\n\n${lines.join("\n")}`;
  }
  if (feedback.kind === "crash") {
    return `The previous attempt crashed before producing a test result:\n\n\`\`\`\n${feedback.output}\n\`\`\``;
  }
  return `The previous attempt failed the property-based test. Minimal counterexample:\n\n\`\`\`json\n${JSON.stringify(feedback.result, null, 2)}\n\`\`\``;
}

export function renderRequest(attempt: number, feedback: Feedback | undefined): string {
  return `# Implementation request (attempt ${attempt})

Implement a system that satisfies the specification in \`${TEST_DIR}/${FILES.ir}\`, then connect it to the test
harness. Your work is accepted when the rule check and the property-based test both pass.

## What to write

1. **Production code under \`${SOURCE_DIR}/\`.** Its design is entirely yours: file layout, names, classes or
   functions. It must be plain TypeScript that Node can run directly (erasable syntax only: no \`enum\`, no
   \`namespace\`, no parameter properties; relative imports need the \`.ts\` extension).
2. **\`${TEST_DIR}/${FILES.adapter}\`.** Fill in every method so the test harness can drive your production code.
   The interface is defined in \`${TEST_DIR}/${FILES.contract}\`.

## Rules (checked mechanically)

- Production code may import only other files under \`${SOURCE_DIR}/\`, by relative path. No packages, no
  \`node:\` built-ins, no \`import()\` / \`require()\`. It must not depend on the test harness or the spec.
- Work only from the files in this directory. Do not read anything outside it; the IR is the complete
  specification.
- Do not edit \`${TEST_DIR}/${FILES.ir}\` or \`${TEST_DIR}/${FILES.contract}\`, and do not create files outside
  \`${SOURCE_DIR}/\`. Only \`${SOURCE_DIR}/\` and \`${TEST_DIR}/${FILES.adapter}\` are collected from this directory.
- The adapter must stay thin. It may import only \`./${FILES.contract}\` and files under \`../${SOURCE_DIR}/\`. It
  must not contain numeric literals, must not reference state data fields or their values, and must not mention
  decision rule names. Pass the \`data\` argument of \`givenState\` to production code unchanged; all business
  logic belongs in \`${SOURCE_DIR}/\`.

## How to read the IR

- \`model.states\` / \`model.initial\`: the state names and the starting state.
- \`model.data\`: the fields of the state data. An array lists the allowed values; a string is a primitive type.
- \`model.commands\`: the side effects the system may emit, with their payload fields.
- \`decisions\`: decision tables. Each key of \`rows\` is a condition written in natural language; decide what it
  means in terms of \`model.data\`. At most one non-default row matches a given state (hit policy: unique);
  \`default\` applies when no other row matches.
- \`behaviors\`: actions. \`preconditions\` are natural-language conditions on the state; behaviour when they do
  not hold is not tested. Each key of \`transitions\` is an outcome passed to \`executeAction(action, outcome)\`.
  The transition gives the resulting \`nextState\` and the \`emittedCommands\`, in order.
- Inside a transition, \`{"$ref": "decision:<Table>.<column>"}\` means the value of that column in the row that
  matches the current state, and \`{"$spread": "decision:<Table>.<column>"}\` means all elements of that column's
  array, inserted at that position. \`payloadSchema\` is informational and is not part of the command.

## How your work is tested

The test harness is not available in this directory. When you finish, the harness collects your files and
runs, for many randomly generated states: \`setupIsolation\` → \`givenState(initial, data)\` →
\`executeAction(action, outcome)\` → \`getCurrentState\` / \`getFiredCommands\` → \`teardownIsolation\`. The
resulting state and the emitted commands (including their order) must match the specification exactly. If
they do not, you will be asked again with a minimal counterexample.
${feedback ? `\n## Feedback from the previous attempt\n\n${renderFeedback(feedback)}\n` : ""}`;
}
