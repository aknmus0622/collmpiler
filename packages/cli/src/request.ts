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
  if (feedback.kind === "mutation") {
    const lines = feedback.violations.map((v) => `- \`${v.file}\` [${v.rule}] ${v.message}`);
    return `The previous attempt passed the property-based test, but failed the mutation check. The harness changes values in your production code one at a time and expects the test to fail each time:\n\n${lines.join("\n")}`;
  }
  return `The previous attempt failed the property-based test. Minimal counterexample:\n\n\`\`\`json\n${JSON.stringify(feedback.result, null, 2)}\n\`\`\``;
}

export function renderRequest(attempt: number, feedback: Feedback | undefined, guide: string): string {
  return `# Implementation request (attempt ${attempt})

Implement a system that satisfies the specification in \`${TEST_DIR}/${FILES.ir}\`, then connect it to the test
harness. Your work is accepted when the rule check, the property-based test, and the mutation check all pass.

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
- The adapter may import only \`./${FILES.contract}\` and files under \`../${SOURCE_DIR}/\`. Its job is to build
  your system and connect it to the \`ports\` it receives, translating between the two where needed.
- Business decisions must be made in \`${SOURCE_DIR}/\`, never in the adapter. This is verified by mutation: after
  the tests pass, the harness changes the decision values in your production code one at a time (a discount
  rate, a coupon type, ...) and expects the tests to fail each time. A value that can be changed without
  failing a test means the decision is being made somewhere else, or the code is dead.

## Design guidance

This is guidance on how to design the code, not something the harness checks.

${guide.trim()}

## How to read the IR

The IR describes one component by its boundary.

- \`model.states\` / \`model.initial\`: the state names and the starting state.
- \`model.actions\`: the actions that drive the component, each with the fields of its input.
- \`model.data\`: what the component remembers between actions. Nothing is set in the initial state; a
  transition's \`set\` says which fields it stores, and later actions can depend on them.
- \`model.queries\`: values the component asks its environment for (a clock, configuration, the response of an
  external service, ...). In the test they are answered by \`ports.queries\`, and the answers can change from
  one action to the next.
- \`model.commands\`: the side effects the component may perform on its environment, with their payload fields.
  In the test they are received by \`ports.commands\`.
- Field types: an array lists the allowed values; a string is a primitive type (\`integer\` is a whole number);
  an object such as \`{"type": "integer", "min": 0, "max": 1000000}\` is a number with constraints (\`around\`
  lists thresholds the test will probe closely, including the values just below and above them).
- \`model.formulas\`: named computations. The name is a natural-language description of how the value is
  computed, including rounding; implement exactly what it says. The value is the declared result type.
- \`model.invariants\`: natural-language properties that always hold for the state and the remembered data.
  They are not tested directly; treat them as facts you can rely on.
- **Conditions are written in natural language** everywhere they appear: as the row keys of decision tables, as
  \`preconditions\`, and as the keys of \`transitions\`. Decide what each condition means in terms of the
  remembered data, the query answers, the input of the action, and the current state. The same sentence always
  means the same thing. Among the conditions of one table (or of one action's transitions) at most one holds;
  \`default\` applies when none does.
- \`decisions\`: decision tables. \`rows\` maps each condition to the values chosen when it holds.
- \`behaviors\`: actions. \`from\` lists the states in which the action can be executed, and \`preconditions\`
  must also hold; behaviour outside them is not tested. \`transitions\` maps each condition to what happens
  when it holds: the resulting \`nextState\`, the \`emittedCommands\` in order, and optionally \`set\`.
- Inside a transition, \`{"$ref": "input:<field>"}\`, \`{"$ref": "data:<field>"}\` and \`{"$ref": "query:<field>"}\`
  mean the value of that action input, remembered field, or query answer. \`{"$ref": "formula:<name>"}\` means
  the result of that named computation. \`{"$ref": "decision:<Table>.<column>"}\` means the value of that column
  in the row that matches, and \`{"$spread": "decision:<Table>.<column>"}\` means all elements of that column's
  array, inserted at that position. \`payloadSchema\` and \`event\` are informational and are not part of the
  command.

## How your work is tested

The test harness is not available in this directory. When you finish, the harness collects your files and
runs many randomly generated trials. One trial is: \`setupIsolation(ports)\`, then a sequence of several
\`executeAction(action)\` calls on the same system, then \`teardownIsolation()\`. Before each action the
harness chooses new query answers. After each action, \`getCurrentState()\` and the commands
received by \`ports.commands\` during that action (including their order) must match the specification exactly.
If they do not, you will be asked again with a minimal counterexample: the shortest sequence of actions that
shows the difference.
${feedback ? `\n## Feedback from the previous attempt\n\n${renderFeedback(feedback)}\n` : ""}`;
}
