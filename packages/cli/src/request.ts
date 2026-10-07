import type { Asset } from "./assets.ts";
import type { Feedback } from "./gates.ts";
import { FILES, TEST_DIR } from "./generate.ts";
import { label } from "./layout.ts";
import type { Workspace } from "./layout.ts";
import type { Target } from "./target.ts";

// エージェントに渡す依頼文。実装は TDD の流れに沿って3つの段階に分かれ、段階ごとに別の依頼になる。
// 段階ごとに見せる情報が違うので、依頼文もその段階で見えるものだけに触れる。
// 仕様固有の内容は書かない（仕様は IR が全て）。エージェント向けなので英語。

//   design         … 本番コードの骨組み（型とシグネチャ。中身は未実装）を書く。IR を見る。テストの口は見ない
//   wiring         … アダプターを書く。テストの口の契約と骨組みを見る。IR は見ない
//   implementation … 本番コードの中身を書く。IR と骨組みを見る。アダプターとテストの口は見ない
export type Phase = "design" | "wiring" | "implementation";
export const PHASES: readonly Phase[] = ["design", "wiring", "implementation"];

function renderFeedback(feedback: Feedback): string {
  if (feedback.kind === "check") {
    const lines = feedback.violations.map((v) => `- \`${v.file}\` [${v.rule}] ${v.message}`);
    return `The previous attempt was rejected before testing because it broke the rules:\n\n${lines.join("\n")}`;
  }
  if (feedback.kind === "crash") {
    return `The previous attempt crashed before producing a test result:\n\n\`\`\`\n${feedback.output}\n\`\`\``;
  }
  if (feedback.kind === "red") return feedback.message;
  if (feedback.kind === "mutation") {
    const lines = feedback.violations.map((v) => `- \`${v.file}\` [${v.rule}] ${v.message}`);
    return `The previous attempt passed the property-based test, but failed the mutation check. The harness changes values in your production code one at a time and expects the test to fail each time:\n\n${lines.join("\n")}`;
  }
  return `The previous attempt failed the property-based test. Minimal counterexample:\n\n\`\`\`json\n${JSON.stringify(feedback.result, null, 2)}\n\`\`\``;
}

const IR_GUIDE = `## How to read the IR

The IR describes one component by its boundary.

- \`model.states\` / \`model.init\`: the state names and the starting state.
- \`model.commands\`: the commands that drive the component from outside, each with the fields of its input.
- \`model.data\`: what the component remembers between commands. Nothing is set in the initial state; an
  outcome's \`set\` says which fields it stores, and later commands can depend on them.
- \`model.queries\`: values the component asks its environment for (a clock, configuration, the response of an
  external service, ...). The answers can change from one command to the next, so ask when the value is needed
  and do not cache it.
- \`model.effects\`: the side effects the component may perform on its environment, with their payload fields.
- Field types: an array lists the allowed values; a string is a primitive type (\`integer\` is a whole number);
  an object such as \`{"type": "integer", "min": 0, "max": 1000000}\` is a number with constraints (\`around\`
  lists thresholds the test will probe closely, including the values just below and above them).
- \`model.calculations\`: named computations. \`is\` describes in natural language how the value is computed,
  including rounding; implement exactly what it says. \`type\` is the type of the result.
- \`model.invariants\`: natural-language properties that always hold for the state and the remembered data.
  They are not tested directly; treat them as facts you can rely on.
- **Conditions are written in natural language** everywhere they appear: as the row keys of decision tables, in
  \`onlyIf\`, as the keys of \`when\`, and as the \`when\` of an effect. Decide what each condition means in
  terms of the remembered data, the query answers, the input of the command, and the current state. The same
  sentence always means the same thing. Among the conditions of one table (or of one command's \`when\`) at
  most one holds; \`otherwise\` applies when none does.
- \`decisions\`: decision tables. \`rows\` maps each condition to the values chosen when it holds.
- \`behaviors\`: what each command does. \`from\` lists the states in which the command can be executed, and
  the conditions in \`onlyIf\` must also hold; behaviour outside them is not tested. \`when\` maps each
  condition to what happens when it holds:
  - \`goTo\`: the resulting state.
  - \`does\`: what happens, in prose. It explains the intent; the fields below are the precise form.
  - \`effects\`: the effects to perform, in this order, each with its \`name\` and \`payload\`. An effect with
    \`when\` is performed only if that holds; \`when\` is either a condition sentence or a reference to a
    boolean value.
  - \`set\`: the data to remember.
- Values inside an outcome are constants or references:
  - \`{"$ref": "input:<field>"}\`, \`{"$ref": "data:<field>"}\`, \`{"$ref": "query:<field>"}\`: that command
    input, remembered field, or query answer.
  - \`{"$ref": "calculation:<name>"}\`: the result of that computation.
  - \`{"$ref": "decision:<table>.<column>"}\`: the value of that column in the row whose condition holds.
  - \`{"$was": [<states>]}\`: true if the state before the command was one of those listed.`;

// 本番コードと同じ場所にテスト側のファイルが並ぶとき、その名前を本番コードに使わせない
const reserved = (ws: Workspace) =>
  ws.prefix === "" ? "" : `\n- File names starting with \`${ws.prefix}\` are reserved for the test harness. Do not create, edit, or import such files.`;

const design = (target: Target, ws: Workspace, guide: string) => `Design the production code for the component specified in \`${ws.paths.ir}\`, and write it as a
**skeleton** under \`${label(ws.src)}\`: every type, every interface, and every exported class and function with its
full signature, but no behaviour yet.

This is the first of three steps, each done by a different engineer who sees different things:

1. You design the code and write the skeleton. You see the specification.
2. Someone connects your skeleton to a test harness. They see your skeleton but **not** the specification.
3. Someone fills in the bodies. They see the specification and your skeleton, but not the test harness.

## What to write

- The complete public shape of the production code: file layout, types, interfaces for dependencies, classes
  and functions with parameter and return types.
- The body of every function and method that would contain behaviour must be exactly
  \`${target.request(ws).skeletonBody}\`. Constructors may store what they receive. Write no decisions, no
  calculations, and no values taken from the specification.
- **Doc comments that let step 2 succeed without the specification.** For every exported member say what it is
  for: which command it performs and what its arguments are, how the current state is read and what each state
  value means, what each dependency is asked or told and when. If a state or value is named differently from
  the specification, say which specification name it corresponds to.
- **Do not restate business rules in the skeleton.** Comments explain how to use each member, not what the
  rules are: no conditions, no decision-table values, no formulas. Step 2 must not learn them, and step 3
  reads them from the specification. Quoting a condition, formula, or invariant from the specification
  verbatim is rejected.

## Rules (checked mechanically)

${target.request(ws).sourceRules}
- Work only from the files in this directory. Do not read anything outside it.
- Write only under \`${label(ws.src)}\`. Do not edit \`${ws.paths.ir}\`.${reserved(ws)}
- Every file must load without error (it is loaded once to check).

## Design guidance

This is guidance on how to design the code, not something the harness checks.

${guide.trim()}

${IR_GUIDE}
`;

const wiring = (target: Target, ws: Workspace) => `Connect the production code under \`${label(ws.src)}\` to the test harness by filling in
\`${ws.paths.adapter}\`. The interface to implement, and the stand-ins the harness provides for
everything the system depends on, are defined in \`${ws.paths.contract}\`.

The production code is a skeleton: its signatures and doc comments are final, but its bodies fail with
\`"${target.notImplemented}"\`. Someone else will fill them in later. You do not have the specification and do not need
it: your job is only to connect the two sides.

## What to write

${target.request(ws).adapterGuide}

## Rules (checked mechanically)

- Write only \`${ws.paths.adapter}\`. Do not change the production code or any other file.
- ${target.request(ws).adapterImports}
- Do not implement any behaviour in the adapter and do not work around the unimplemented bodies. After you
  finish, the harness runs its tests and they **must fail** because the production code is not implemented. If
  they pass, or if they fail because of an error in the adapter itself, your work is rejected.
- Work only from the files in this directory. Do not read anything outside it.
`;

const implementation = (target: Target, ws: Workspace, guide: string) => `Implement the production code under \`${label(ws.src)}\` so that it satisfies the specification in
\`${ws.paths.ir}\`. The code is currently a skeleton: its design, signatures, and doc comments are in
place, and its bodies fail with \`"${target.notImplemented}"\`. Fill in the bodies.

A test harness is already connected to the skeleton's exported signatures. You cannot see it. Your work is
accepted when the harness's property-based test and mutation check both pass.

## What to write

- The bodies of the functions and methods under \`${label(ws.src)}\`. You may add private helpers and new files.
- **Keep every exported name and signature exactly as it is**, and keep the documented meaning of each member.
  The harness calls them as documented; an error such as ${target.request(ws).signatureErrorExample} in the feedback
  means a signature was changed.

## Rules (checked mechanically)

${target.request(ws).sourceRules}
- Work only from the files in this directory. Do not read anything outside it.
- Write only under \`${label(ws.src)}\`. Do not edit \`${ws.paths.ir}\`.${reserved(ws)}
- All business decisions must be made by this code. This is verified by mutation: after the tests pass, the
  harness changes the decision values in your code one at a time (a discount rate, a coupon type, ...) and
  expects the tests to fail each time. A value that can be changed without failing a test is dead code.

## Design guidance

This is guidance on how to design the code, not something the harness checks.

${guide.trim()}

${IR_GUIDE}

## How your work is tested

The harness runs many randomly generated trials. One trial builds a fresh system and executes a sequence of
several commands on it. Before each command the harness chooses new query answers. After each command, the
current state and the effects the system performed during that command (including their order) must match the
specification exactly. If they do not, you will be asked again with a minimal counterexample: the shortest
sequence of commands that shows the difference. In a counterexample, \`data\` is what the component should be
remembering before that command, and \`case\` is the condition that holds.
`;

const TITLES: Record<Phase, string> = {
  design: "Step 1 of 3: design the production code",
  wiring: "Step 2 of 3: connect the production code to the test harness",
  implementation: "Step 3 of 3: implement the production code",
};

// 添付資料の置き場所（作業場所の中）
export const ASSETS_DIR = `${TEST_DIR}/assets`;

// プロジェクトが添付した資料。文言は依頼文に直接載せ、ファイルは置き場所を案内する
export function renderAssets(assets: Asset[]): string {
  const notes = assets.flatMap((asset) => (asset.kind === "text" ? [asset.text] : []));
  const files = assets.flatMap((asset) => (asset.kind === "file" ? [asset.name] : []));
  if (notes.length + files.length === 0) return "";
  const parts = ["\n## Project conventions\n\nThe project supplied the following. Where it disagrees with the general guidance in this request, it takes precedence. It does not change the rules that are checked mechanically.\n"];
  if (notes.length > 0) parts.push(notes.map((note) => `- ${note}`).join("\n") + "\n");
  if (files.length > 0) {
    parts.push(`Read these files before you start:\n\n${files.map((name) => `- \`${ASSETS_DIR}/${name}\``).join("\n")}\n`);
  }
  return parts.join("\n");
}

export function renderRequest(
  target: Target,
  ws: Workspace,
  phase: Phase,
  attempt: number,
  feedback: Feedback | undefined,
  guide: string,
  assets: Asset[] = [],
): string {
  const body = phase === "design" ? design(target, ws, guide) : phase === "wiring" ? wiring(target, ws) : implementation(target, ws, guide);
  const previous = feedback ? `\n## Feedback from the previous attempt\n\n${renderFeedback(feedback)}\n` : "";
  return `# ${TITLES[phase]} (attempt ${attempt})\n\n${body}${renderAssets(assets)}${previous}`;
}
