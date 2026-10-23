import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { run } from "../src/run.ts";
import type { Answer, ConfirmEvent, QuestionEvent, RunEvent, Talk } from "../src/run.ts";
import { AgentFailure } from "../src/strategy.ts";
import type { ImplementationStrategy } from "../src/strategy.ts";
import { readProgram } from "../src/v1/read.ts";
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
