import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { run } from "../src/run.ts";
import type { Answer, ConfirmEvent, QuestionEvent, RunEvent, Talk } from "../src/run.ts";
import { AgentFailure } from "../src/strategy.ts";
import type { ImplementationStrategy } from "../src/strategy.ts";
import { FrameworkError } from "../src/v1/decide.ts";
import { readProgram } from "../src/v1/read.ts";
import { adapterOf } from "../src/v1/stage1.ts";
import { candidatesOf } from "../src/v1/split.ts";
import { supplementAll } from "../src/v1/supplement.ts";
import { harness, specsDir } from "./support.ts";

// clp run (DSL.md §17.19): 検査から検証までを1回で。解釈と実装は LLM の代役、人の答えは決まった答えを返す Talk
process.env.CLP_ALLOY = "off";

const { workdir, scripted } = harness("run");

const DRAFT = "order.interpretation.draft.ts";
const FINAL = "order.interpretation.ts";
const LAYER1 = "order.component.ts";
const reviewed = readFileSync(join(specsDir, FINAL), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("// Code generated") && !line.startsWith("// layer1 "))
  .join("\n");
const reopened = (...marks: string[]) =>
  marks.reduce((text, mark) => {
    assert.ok(text.includes(`// REVIEWED: ${mark}`), mark);
    return text.replace(`// REVIEWED: ${mark}`, `// REVIEW: ${mark}`);
  }, reviewed);
const LIST_PRICE = '"the order" is the list price.';
const CANCEL = "nothing is said on a cancellation but the refund.";

// 作業場所: 例の Layer 1 だけを写した仕様と、出力先
function place() {
  const root = workdir();
  const specs = join(root, "specs");
  mkdirSync(specs);
  copyFileSync(join(specsDir, LAYER1), join(specs, LAYER1));
  return { specs, out: join(root, "out") };
}

// 解釈は呼ばれた順に drafts を書き、実装の段階は例の正しいコードを書く (implementation が無ければ、エージェントが止まる)
function agent(drafts: string[], implementation = true) {
  const requests: string[] = [];
  const code = scripted({}).strategy;
  const strategy: ImplementationStrategy = {
    name: "scripted",
    run(assignment) {
      if (assignment.phase.startsWith("interpretation")) {
        requests.push(readFileSync(join(assignment.dir, "clp/REQUEST.md"), "utf8"));
        writeFileSync(join(assignment.dir, "spec", DRAFT), drafts[Math.min(requests.length, drafts.length) - 1]);
        return;
      }
      if (!implementation) throw new AgentFailure("the agent was not started (test)");
      return code.run(assignment);
    },
  };
  return { strategy, requests };
}

// 人の代役: 問いの順に answers を返し、見せられたものを記録する。answers が尽きたら入力が閉じたのと同じ
function person(answers: (Omit<Answer, "id"> | undefined)[]) {
  const events: RunEvent[] = [];
  const asked: (QuestionEvent | ConfirmEvent)[] = [];
  const talk: Talk = {
    emit: (event) => events.push(event),
    async ask(event) {
      events.push(event);
      asked.push(event);
      const answer = answers.shift();
      return answer && { id: event.id, ...answer };
    },
  };
  return { talk, events, asked };
}

test("run: 疑問点に補足で答えると、その文に書き足し、導き直してから確定し、実装して検証に通る", async () => {
  const { specs, out } = place();
  const { strategy, requests } = agent([reopened(LIST_PRICE), reviewed]);
  const { talk, events, asked } = person([{ answer: "supplement", text: "The order means its list price." }, { answer: "yes" }]);
  const result = await run({ specs, out, strategy, talk, sessions: 1, maxAttempts: 2, maxRounds: 1, runs: 300 });

  assert.equal(result, "passed", JSON.stringify(events, null, 1));
  // 問い: 疑問点と、どの部品のどこか
  const question = asked[0] as QuestionEvent;
  assert.equal(question.kind, "review");
  assert.equal(question.component, "shipping");
  assert.equal(question.text, LIST_PRICE);
  assert.deepEqual(question.choices, ["accept", "supplement", "stop"]);
  // 書き込む前に見せた差分: 疑問の項目 (goldOrLarge) の文の末尾
  const confirm = asked[1] as ConfirmEvent;
  assert.match(confirm.diff, /^-  \[is\.goldOrLarge\("The customer is a Gold member, or the order is 10,000 yen or more"\)/m);
  assert.match(confirm.diff, /^\+  \[is\.goldOrLarge\("The customer is a Gold member, or the order is 10,000 yen or more\. The order means its list price\."\)/m);
  assert.match(readFileSync(join(specs, LAYER1), "utf8"), /10,000 yen or more\. The order means its list price\."/);
  // Layer 1 が変わったので、いまの下書きから導き直させた
  assert.equal(requests.length, 2);
  assert.match(requests[1], /^# Update the interpretation/);
  assert.match(requests[1], /A `\/\/ REVIEW:` question that\nLayer 1 now answers is settled: remove it/);
  // 確定して、実装まで進んだ
  assert.ok(existsSync(join(specs, FINAL)) && !existsSync(join(specs, DRAFT)));
  assert.deepEqual(
    events.filter((e) => e.type === "step" && e.status === "start").map((e) => (e as { step: string }).step),
    ["check", "interpret", "questions", "check", "interpret", "accept", "apply"],
  );
  assert.deepEqual(events.at(-1), { type: "end", result: "passed" });
});

test("run: 認めた疑問は REVIEWED にして残し、止めたら止まる。もう一度実行すると、残った疑問から続ける", async () => {
  const { specs, out } = place();
  const first = agent([reopened(LIST_PRICE, CANCEL)], false);
  const stopped = person([{ answer: "accept" }, { answer: "stop" }]);
  assert.equal(await run({ specs, out, strategy: first.strategy, talk: stopped.talk, sessions: 1 }), "stopped");
  const draft = readFileSync(join(specs, DRAFT), "utf8");
  assert.ok(draft.includes(`// REVIEWED: ${LIST_PRICE}`) && draft.includes(`// REVIEW: ${CANCEL}`));

  // 続き: 解釈は導き直さない (下書きは新しい)。残った疑問だけを問い、認めたら確定して実装へ
  const second = agent([reviewed], false);
  const resumed = person([{ answer: "accept" }]);
  const result = await run({ specs, out, strategy: second.strategy, talk: resumed.talk, sessions: 1 });
  assert.equal(second.requests.length, 0);
  assert.deepEqual(resumed.asked.map((e) => (e as QuestionEvent).text), [CANCEL]);
  assert.ok(existsSync(join(specs, FINAL)));
  // 実装のエージェントが動かなければ、失敗で終わる
  assert.equal(result, "failed");
  assert.match((resumed.events.at(-1) as { reason?: string }).reason ?? "", /not started/);
});

test("run: 書き足しを断ると、Layer 1 は変わらずに止まる。入力が閉じても止まる", async () => {
  const { specs, out } = place();
  const before = readFileSync(join(specs, LAYER1), "utf8");
  const { strategy } = agent([reopened(LIST_PRICE)], false);
  const declined = person([{ answer: "supplement", text: "List price." }, { answer: "no" }]);
  assert.equal(await run({ specs, out, strategy, talk: declined.talk, sessions: 1 }), "stopped");
  assert.equal(readFileSync(join(specs, LAYER1), "utf8"), before);

  const closed = person([]);
  assert.equal(await run({ specs, out, strategy, talk: closed.talk, sessions: 1 }), "stopped");
  assert.equal(closed.asked.length, 1);
});

test("run: フレームワークの誤りは仕様の誤りとして案内せず、clp の不具合として終わる", async () => {
  const { specs, out } = place();
  const { strategy: interpreting } = agent([reviewed]);
  const strategy: ImplementationStrategy = {
    ...interpreting,
    run(assignment) {
      if (assignment.phase.startsWith("interpretation")) return interpreting.run(assignment);
      throw new FrameworkError("Stage 0 と Stage 1 が食い違いました");
    },
  };
  const { talk, events } = person([{ answer: "accept" }, { answer: "accept" }, { answer: "accept" }, { answer: "accept" }]);
  assert.equal(await run({ specs, out, strategy, talk, sessions: 1, maxAttempts: 2, maxRounds: 1, runs: 300 }), "failed");
  assert.ok(events.some((e) => e.type === "diagnostic" && e.code === "framework" && /食い違いました/.test(e.message)));
  const end = events.find((e) => e.type === "end");
  assert.ok(end?.type === "end" && /clp 自身の不具合/.test(end.reason ?? "") && !/Layer 1 を直/.test(end.reason ?? ""), JSON.stringify(end));
});

test("run: 仕様の誤りと確かめられないエラーでは、Layer 1 を直すよう案内しない", async () => {
  const { specs, out } = place();
  const { strategy: interpreting } = agent([reviewed]);
  const strategy: ImplementationStrategy = {
    ...interpreting,
    run(assignment) {
      if (assignment.phase.startsWith("interpretation")) return interpreting.run(assignment);
      throw new Error("本番システムが非決定的な可能性があります");
    },
  };
  const { talk, events } = person([{ answer: "accept" }, { answer: "accept" }, { answer: "accept" }, { answer: "accept" }]);
  assert.equal(await run({ specs, out, strategy, talk, sessions: 1, maxAttempts: 2, maxRounds: 1, runs: 300 }), "failed");
  assert.ok(events.some((e) => e.type === "diagnostic" && e.code === "internal" && /非決定的/.test(e.message)));
  const end = events.find((e) => e.type === "end");
  assert.ok(end?.type === "end" && /仕様の誤りとは限りません/.test(end.reason ?? ""), JSON.stringify(end));
});

test("run: Layer 1 が読めなければ、エージェントを呼ばずに止まる", async () => {
  const { specs, out } = place();
  writeFileSync(join(specs, LAYER1), readFileSync(join(specs, LAYER1), "utf8").replace("export const Order = service(", "export const Order = service(("));
  const { strategy, requests } = agent([reviewed]);
  const { talk, events } = person([]);
  assert.equal(await run({ specs, out, strategy, talk, sessions: 1 }), "stopped");
  assert.equal(requests.length, 0);
  assert.ok(events.some((e) => e.type === "diagnostic" && e.severity === "error"));
});

test("補足の書き足し: 文の引用符に合わせて書き、文の終わりを補う。コードの項目は部品の説明へ", () => {
  const { specs } = place();
  writeFileSync(
    join(specs, DRAFT),
    "// layer1 Order: sha256:0\n" +
      reviewed
        .replace(`// REVIEWED: ${CANCEL}`, `// REVIEW: ${CANCEL}`)
        .replace("export const OrderInterpretation = interpretation(Order, {", "export const OrderInterpretation = interpretation(Order, {\n  // REVIEW: about the whole order"),
  );
  const program = readProgram(specs, { drafts: true });
  assert.equal(program.reviews.length, 2);
  const { changes, unplaced } = supplementAll(program, [
    { review: program.reviews.find((r) => r.text === CANCEL)!, words: 'Say "refunded".' },
    { review: program.reviews.find((r) => r.text === "about the whole order")!, words: "注文全体について" },
  ]);
  assert.deepEqual(unplaced, []);
  const after = changes.map((c) => c.after).join("\n");
  // コマンドの文 (Cancel) に、引用符を逃がして
  assert.match(after, /Cancel: "A pending or paid order[^"]*what they paid\. Say \\"refunded\\"\.",/);
  // 項目の外の疑問は、部品の説明に
  assert.match(after, /注文全体について/);
});

const ROUGH = `import { service } from "@clp/core";

// 町の図書館
export const Library = service("図書館。本を貸し、返してもらう。延滞料は返した日数の分だけ足していく。払えば 0 になる。");
`;
const SPLIT = {
  split: true,
  arrangement: "inside",
  description: "図書館。本を貸し、返してもらう。${Fines}",
  parts: [{ name: "Fines", description: "延滞料は返した日数の分だけ足していく。払えば 0 になる。", because: "延滞料は貸出と別の状態を持つ" }],
};
// 分け方の依頼に answers を順に答える。解釈の依頼が来たら止める (ここでは分け方だけを見る)
function splitAgent(answers: unknown[]) {
  const requests: string[] = [];
  const strategy: ImplementationStrategy = {
    name: "scripted",
    run(assignment) {
      if (assignment.phase !== "split") throw new AgentFailure("reached interpretation");
      requests.push(readFileSync(join(assignment.dir, "clp/REQUEST.md"), "utf8"));
      const answer = answers[Math.min(requests.length, answers.length) - 1];
      writeFileSync(join(assignment.dir, "clp/split.json"), typeof answer === "string" ? answer : JSON.stringify(answer));
    },
  };
  return { strategy, requests };
}
function rough() {
  const root = workdir();
  const specs = join(root, "specs");
  mkdirSync(specs);
  writeFileSync(join(specs, "library.component.ts"), ROUGH);
  return { specs, out: join(root, "out"), file: join(specs, "library.component.ts") };
}

test("run: 分け方の提案を受け入れると Layer 1 に部品と ${部品} を書き、もう提案しない", async () => {
  const { specs, out, file } = rough();
  const { strategy, requests } = splitAgent([SPLIT]);
  const { talk, asked, events } = person([{ answer: "accept" }]);
  assert.equal(await run({ specs, out, strategy, talk, sessions: 1, yes: true }), "failed");
  const question = asked[0] as QuestionEvent;
  assert.equal(question.kind, "split");
  assert.deepEqual(question.choices, ["accept", "decline", "stop"]);
  assert.equal(question.parts![0].because, SPLIT.parts[0].because);
  assert.match(question.diff!, /^\+export const Fines = service\("延滞料/m);
  const text = readFileSync(file, "utf8");
  assert.ok(text.includes('export const Fines = service("延滞料は返した日数の分だけ足していく。払えば 0 になる。");\n// 町の図書館\nexport const Library = service(`図書館。本を貸し、返してもらう。${Fines}`);'), text);
  const program = readProgram(specs);
  assert.deepEqual(program.problems.filter((p) => p.code === "syntax"), []);
  assert.equal(requests.length, 1);
  assert.equal(asked.length, 1);
  assert.match((events.at(-1) as { reason?: string }).reason ?? "", /reached interpretation/);
});

test("run: separate の提案は components を足す。読めて、親は解釈が要らない", async () => {
  const { specs, out, file } = rough();
  const proposal = { split: true, arrangement: "separate", description: "図書館。", parts: [{ name: "Lending", description: "本を貸し、返してもらう。", because: "貸出" }, { name: "Fines", description: "延滞料を足していく。", because: "延滞料" }] };
  const { strategy } = splitAgent([proposal]);
  const { talk } = person([{ answer: "accept" }]);
  await run({ specs, out, strategy, talk, sessions: 1 });
  assert.match(readFileSync(file, "utf8"), /export const Library = service\("図書館。", \{ components: \{ lending: Lending, fines: Fines \} \}\);/);
  const library = readProgram(specs).units.find((u) => u.exportName === "Library")!;
  assert.equal(library.proseOnly, false);
});

test("run: 分け方を断る・提案が無いと、Layer 1 は変わらず解釈へ進む。読めない答えは差し戻し、尽きたら警告して進む", async () => {
  const declined = rough();
  const one = splitAgent([SPLIT]);
  const a = person([{ answer: "decline" }]);
  await run({ ...declined, strategy: one.strategy, talk: a.talk, sessions: 1 });
  assert.equal(readFileSync(declined.file, "utf8"), ROUGH);
  assert.equal(one.requests.length, 1);

  const none = rough();
  const two = splitAgent([{ split: false }]);
  const b = person([]);
  await run({ ...none, strategy: two.strategy, talk: b.talk, sessions: 1 });
  assert.equal(b.asked.length, 0);

  const bad = rough();
  const three = splitAgent(["not json", { ...SPLIT, description: "図書館。" }]);
  const c = person([]);
  await run({ ...bad, strategy: three.strategy, talk: c.talk, sessions: 1, maxAttempts: 3 });
  assert.equal(three.requests.length, 3);
  assert.match(three.requests[1], /not JSON/);
  assert.match(three.requests[2], /must embed \$\{Fines\} once each/);
  assert.ok(c.events.some((e) => e.type === "diagnostic" && e.code === "split-failed"));
  assert.equal(readFileSync(bad.file, "utf8"), ROUGH);
});

test("分け方の対象: 文が1つ、見出しがある、他の部品と関わるものは問わない", () => {
  const root = workdir();
  const specs = join(root, "specs");
  mkdirSync(specs);
  writeFileSync(
    join(specs, "a.component.ts"),
    `import { service } from "@clp/core";
export const One = service("文は1つ");
export const Used = service("使われる。文は2つ。");
export const User = service(\`使う。\${Used} 文は2つ。\`);
export const Alone = service("独り。文は2つ。");
export const Headed = service("見出し。文は2つ。", { commands: { Go: "進む" } });
`,
  );
  assert.deepEqual(candidatesOf(readProgram(specs, { drafts: true })).map((u) => u.exportName), ["Alone"]);
});

test("run-flow: 同じ台本で、Stage 1 は Stage 0 と同じ順に進み、同じ結果になる", async () => {
  assert.ok(await adapterOf("run-flow"), "run-flow の合格の記録が古い");
  const script = async () => {
    const { specs, out } = place();
    const { strategy } = agent([reopened(LIST_PRICE, CANCEL), reopened(CANCEL), reviewed], false);
    const { talk, events } = person([{ answer: "supplement", text: "The order means its list price." }, { answer: "accept" }, { answer: "yes" }, { answer: "accept" }]);
    const result = await run({ specs, out, strategy, talk, sessions: 1 });
    const split = rough();
    const answers = splitAgent([SPLIT]);
    const second = person([{ answer: "decline" }]);
    const declined = await run({ ...split, strategy: answers.strategy, talk: second.talk, sessions: 1 });
    return [result, events, declined, second.events.map((e) => (e.type === "question" ? { ...e, where: "" } : e))];
  };
  const stage1 = await script();
  process.env.CLP_STAGE = "0";
  try {
    const plain = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/[^"\s\\]*\/w-[A-Za-z0-9]+/g, "<work>"));
    assert.deepEqual(plain(stage1), plain(await script()));
  } finally {
    delete process.env.CLP_STAGE;
  }
});
