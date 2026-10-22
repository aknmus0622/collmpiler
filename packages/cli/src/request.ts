import type { Asset } from "./assets.ts";
import type { Feedback } from "./gates.ts";
import { FILES, TEST_DIR } from "./generate.ts";
import { label } from "./layout.ts";
import type { Workspace } from "./layout.ts";
import type { Target } from "./target.ts";
import { OPS } from "./v1/ops.ts";

// エージェントに渡す依頼文。実装は TDD の流れに沿って3つの段階に分かれ、段階ごとに別の依頼になる。
// 段階ごとに見せる情報が違うので、依頼文もその段階で見えるものだけに触れる。
// 仕様固有の内容は書かない（仕様は IR が全て）。エージェント向けなので英語。

//   design         … 本番コードの骨組み（型とシグネチャ。中身は未実装）を書く。IR を見る。テストの口は見ない
//   wiring         … アダプターを書く。テストの口の契約と骨組みを見る。IR は見ない
//   implementation … 本番コードの中身を書く。IR と骨組みを見る。アダプターとテストの口は見ない
export type Phase = "design" | "wiring" | "implementation";
export const PHASES: readonly Phase[] = ["design", "wiring", "implementation"];

// current: 前回の試行ではなく、いまのコードをそのまま採点した結果として述べる
function renderFeedback(feedback: Feedback, current = false): string {
  if (current) return renderFeedback(feedback).replaceAll("The previous attempt", "The current code");
  if (feedback.kind === "check") {
    const lines = feedback.violations.map((v) => `- \`${v.file}\` [${v.rule}] ${v.message}`);
    return `The previous attempt was rejected before testing because it broke the rules:\n\n${lines.join("\n")}`;
  }
  if (feedback.kind === "crash") {
    return `The previous attempt crashed before producing a test result:\n\n\`\`\`\n${feedback.output}\n\`\`\``;
  }
  if (feedback.kind === "red") return feedback.message;
  if (feedback.kind === "regression") {
    const detail = feedback.result ? JSON.stringify(feedback.result, null, 2) : (feedback.crash ?? "");
    return `The previous attempt satisfies the specification it was written for, but it broke another component of the same system: \`${feedback.component}\`. That component's tests passed before and fail now. The production code must satisfy every specification.\n\n\`\`\`\n${detail}\n\`\`\``;
  }
  if (feedback.kind === "mutation") {
    const lines = feedback.violations.map((v) => `- \`${v.file}\` [${v.rule}] ${v.message}`);
    return `The previous attempt passed the property-based test, but failed the mutation check. The harness changes values in your production code one at a time and expects the test to fail each time:\n\n${lines.join("\n")}`;
  }
  return `The previous attempt failed the property-based test. Minimal counterexample:\n\n\`\`\`json\n${JSON.stringify(feedback.result, null, 2)}\n\`\`\``;
}

// The IR (version 8) is the formal model itself, and the implementer reads its expressions.
const IR_GUIDE_8 = (ws: Workspace) => `## How to read the IR

\`${ws.paths.ir}\` is the specification itself, as a formal model; \`${ws.paths.ir.replace(/ir\.json$/, "spec.md")}\` is the same
model read aloud, with the author's prose next to it. Where they seem to disagree, the IR is right.

- \`root\` is the component to implement. \`components\` holds it and every component it contains (\`contains\`:
  their state is part of this system, and their production code may already exist — see below) or relies on
  (\`relies\`: the outside world, \`external\`, reached through dependencies you are given).
- \`entries\` lists what drives the system from outside: \`commands\` change it, \`queries\` only answer.
- A component's \`state\` is what it remembers, with the types below, starting from \`init\`. Nothing else is remembered.
- \`commands.<name>\`: \`params\` (the input), \`output\` (what it answers, if it answers), \`requires\` (if present:
  inputs for which it is not specified; they are never sent), and \`events\`, one per case.
- \`events.<name>\`: when \`guard\` holds (exactly one event of a command holds at a time), the state fields in
  \`assign\` take their new values, the commands in \`calls\` are called in order (each only if its \`when\` holds) and
  the command answers \`output\`. Every expression is computed from the values **before** the command: an
  assignment never sees another one. A call of a component inside this system happens in the same step; a call of
  an \`external\` component is an effect on the outside world.
- \`queries.<name>\`: answers \`is\`, computed from the state.
- \`conditions\`, \`calcs\`, \`decisions\`: named expressions used by the others. A decision table answers the
  \`then\` of the first row whose \`when\` holds.
- \`external.queries\`: what the outside world answers; \`promise\` (\`fresh\`: never the same value twice;
  \`increasing\`: never less than before) is guaranteed by it — rely on it, do not implement it. \`mayFail\`: asking
  can fail (the dependency throws); what happens then is the events whose guard has \`["failed", …]\`.
  \`external.commands\`: what the system does to the outside world.
- \`properties\`: what always holds in the specification. They are facts you can rely on, not something to check.
- \`durable\` (if present): what the component keeps survives a restart of the system, as after a crash. Keep it in
  storage (Node's \`node:sqlite\`), at the location the production code is given when started; a component without
  it starts over.
- \`routes\` (if present): how each command reaches the system over HTTP (\`"POST /todos/:id"\`). The production
  code serves them itself with Node's \`node:http\`: it can be started with its dependencies on a given port (0 for
  any free one), tells the port it listens on, and can be stopped. \`:name\` is the input field \`name\`, the field
  \`body\` is the JSON request body, other fields are query-string parameters; an answer with \`status\` (and
  \`body\`) is that response.
- \`notes\` is prose, for intent only; \`trace\` says which elements each sentence of the author became.

Types: \`"int"\` (an integer — every number is one), \`"string"\`, \`"bool"\`, \`"json"\` (any JSON value),
\`{"enum": [...]}\`, \`{"atom": "MemberId"}\` (an identifier: an opaque string, compared only for equality),
\`{"record": {...}}\`, \`{"list": T}\` (ordered), \`{"set": T}\` (no order, no duplicates), \`{"map": [K, V]}\` (each key
has one value), \`{"optional": T}\` (a T or \`null\`).

Expressions are s-expressions: numbers, booleans and \`null\` are themselves; everything else is
\`[operator, ...arguments]\`. The operators:

${OPS.map((op) => `- \`${op.name}\`: ${op.meaning}`).join("\n")}`;

// 本番コードと同じ場所にテスト側のファイルが並ぶとき、その名前を本番コードに使わせない
const reserved = (ws: Workspace) =>
  ws.prefix === "" ? "" : `\n- File names starting with \`${ws.prefix}\` are reserved for the test harness. Do not create, edit, or import such files.`;

const design = (target: Target, ws: Workspace, guide: string, incremental: boolean) => `${
  incremental
    ? `Production code already exists under \`${label(ws.src)}\`, but it does not yet fit the specification in
\`${ws.paths.ir}\`: it was written for an earlier version of that specification, or for other components of the
same system. Update the **public shape** of the code to fit the specification as it is now: types,
interfaces, and the signatures of exported classes and functions. Do not implement new behaviour yet.`
    : `Design the production code for the component specified in \`${ws.paths.ir}\`, and write it as a
**skeleton** under \`${label(ws.src)}\`: every type, every interface, and every exported class and function with its
full signature, but no behaviour yet.`
}

This is the first of three steps, each done by a different engineer who sees different things:

1. You design the code and write the skeleton. You see the specification.
2. Someone connects your skeleton to a test harness. They see your skeleton but **not** the specification.
3. Someone fills in the bodies. They see the specification and your skeleton, but not the test harness.
${
  incremental
    ? `
## What is already there

- **Keep what exists.** Change only what the specification now requires. Leave every existing body exactly as
  it is, even where its behaviour no longer matches the specification: step 3 corrects behaviour, with tests.
  Do not rename, move, or restructure code that does not need it.
- A member that is new, or whose signature changed so that its old body no longer fits, gets the body
  described below. Remove a member only if the specification no longer has what it was for.
- If the public shape already fits the specification, change nothing.
`
    : ""
}

## What to write

- The complete public shape of the production code: file layout, types, interfaces for dependencies, classes
  and functions with parameter and return types.
- The body of every ${incremental ? "new " : ""}function and method that would contain behaviour must be exactly
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

${IR_GUIDE_8(ws)}
`;

const wiring = (target: Target, ws: Workspace, incremental: boolean) => `Connect the production code under \`${label(ws.src)}\` to the test harness by filling in
\`${ws.paths.adapter}\`. The interface to implement, and the stand-ins the harness provides for
everything the system depends on, are defined in \`${ws.paths.contract}\`.

${
  incremental
    ? `The production code already existed before the interface took its current form, and so may the adapter.
The signatures and doc comments of the production code are now final for the current version; members that
are not implemented yet fail with \`"${target.notImplemented}"\`, and someone else will fill them in later. Update the adapter so
that it fits the current interface and the current production code; keep what still fits.`
    : `The production code is a skeleton: its signatures and doc comments are final, but its bodies fail with
\`"${target.notImplemented}"\`. Someone else will fill them in later.`
} You do not have the specification and do not need
it: your job is only to connect the two sides.

## What to write

${target.request(ws).adapterGuide}

## Rules (checked mechanically)

- Write only \`${ws.paths.adapter}\`. Do not change the production code or any other file.
- ${target.request(ws).adapterImports}
- Do not implement any behaviour in the adapter and do not work around the unimplemented bodies. After you
  finish, the harness runs its tests. While any production code is unimplemented they **must fail** for that
  reason. If they pass in spite of it, or if they fail because of an error in the adapter itself, your work is
  rejected.
- Work only from the files in this directory. Do not read anything outside it.
`;

const implementation = (target: Target, ws: Workspace, guide: string, incremental: boolean) => `${
  incremental
    ? `Change the production code under \`${label(ws.src)}\` so that it satisfies the specification in
\`${ws.paths.ir}\`. The code was written before the specification took its current form. Its design and signatures
already fit the current version; members that are not implemented yet fail with
\`"${target.notImplemented}"\`. Change what the specification now requires and leave the rest as it is.`
    : `Implement the production code under \`${label(ws.src)}\` so that it satisfies the specification in
\`${ws.paths.ir}\`. The code is currently a skeleton: its design, signatures, and doc comments are in
place, and its bodies fail with \`"${target.notImplemented}"\`. Fill in the bodies.`
}

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

${IR_GUIDE_8(ws)}

## How your work is tested

The harness runs many randomly generated trials. One trial builds a fresh system and executes a sequence of
commands and queries on it. During each one the outside world answers with values the harness chooses. After
each one, what the system answered and what it did to the outside world (in order) must match the specification
exactly. If they do not, you will be asked again with a minimal counterexample: the shortest sequence that shows
the difference, each step with the answers the outside world gave and the events of the specification that
happened.
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

// 依頼文にどの節を入れるか (N10h)。判断は Stage 0 (requestSectionsStage0) か、生成した部品 (Stage 1、self/specs/text-plan.*)
export type RequestFacts = { phase: Phase; attempt: number; hasFeedback: boolean; others: number; partFiles: number };
export type RequestSections = { feedback: "none" | "current-code" | "previous-attempt"; others: boolean; contained: boolean };
export const requestSectionsStage0 = (facts: RequestFacts): RequestSections => ({
  feedback: !facts.hasFeedback ? "none" : facts.attempt === 1 ? "current-code" : "previous-attempt",
  others: facts.phase !== "wiring" && facts.others > 0,
  contained: facts.phase !== "wiring" && facts.partFiles > 0,
});

export function renderRequest(
  target: Target,
  ws: Workspace,
  phase: Phase,
  attempt: number,
  feedback: Feedback | undefined,
  guide: string,
  assets: Asset[] = [],
  // incremental: すでにある本番コードを、仕様の変更に合わせて直す。
  // others: 同じ本番コードを共有する、ほかのコンポーネントの IR の場所
  // partFiles: 含む部品のコード（使うだけで、書き換えない）
  options: { incremental?: boolean; others?: string[]; partFiles?: string[] } = {},
  // Stage 1 が下した、節の判断（無ければ Stage 0）
  decided?: RequestSections,
): string {
  const incremental = options.incremental ?? false;
  const sections = decided ?? requestSectionsStage0({ phase, attempt, hasFeedback: feedback !== undefined, others: (options.others ?? []).length, partFiles: (options.partFiles ?? []).length });
  const body =
    phase === "design"
      ? design(target, ws, guide, incremental)
      : phase === "wiring"
        ? wiring(target, ws, incremental)
        : implementation(target, ws, guide, incremental);
  // 1回目の依頼に載るのは、エージェントを呼ぶ前に、いまのコードを採点した結果
  const previous =
    sections.feedback === "none" || !feedback
    ? ""
    : sections.feedback === "current-code"
      ? `\n## Where the current code falls short\n\nThe harness checked the code as it is now, before any change:\n\n${renderFeedback(feedback, true)}\n`
      : `\n## Feedback from the previous attempt\n\n${renderFeedback(feedback)}\n`;
  // ほかのコンポーネントの仕様は、設計と実装の段階にだけ見せる
  const others = options.others ?? [];
  const system =
    !sections.others
      ? ""
      : `\n## Other components of the same system\n\nThe production code is shared with other components. Their specifications are here, in the same format:\n\n${others.map((path) => `- \`${path}\``).join("\n")}\n\nYour task is the specification named at the top. The code must keep satisfying the others too: their tests are run again after yours pass. Do not change exported names or signatures that already exist unless your specification requires it. Reuse what fits; do not edit those files.\n\nYou may change code that your component uses, including code it shares with the others. Code that only other components use is not yours to change: such a change is undone and the attempt is rejected. New files are always fine.\n`;
  // 含む部品のコード: 設計と実装の段階は、それを使う。中身を変えてはならない
  const partFiles = options.partFiles ?? [];
  const contained =
    !sections.contained
      ? ""
      : `\n## Components this one contains\n\nThe specification lists in \`contains\` the components this one contains. Their production code already exists and has been verified on its own. Use it as it is, through its exported API; read it to learn that API:\n\n${partFiles.map((path) => `- \`${path}\``).join("\n")}\n\nDo not change these files: a change is undone and the attempt is rejected. Your code is what connects the outside (\`routes\`, if present) to them.\n`;
  return `# ${TITLES[phase]} (attempt ${attempt})\n\n${body}${system}${contained}${renderAssets(assets)}${previous}`;
}
