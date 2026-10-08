import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { listComponents, loadSpecs } from "../src/loader.ts";
import { implement } from "../src/loop.ts";
import { describeUnobservable, observability } from "../src/runtime.ts";
import type { ImplementationStrategy } from "../src/strategy.ts";
import { repoRoot, specsDir } from "./support.ts";

// 仕様のミューテーション: 決定表の値が、検証に現れるか。
// 現れない値は、正しく実装してもミューテーションのゲートが差し戻す（あるいは、確認が本番コードから消える）。
// エージェントを呼ぶ前に、仕様の側で見つける

const tmpRoot = join(import.meta.dirname, ".tmp-observe");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 上限つきの受付。table は決定表の中身、place は Place コマンドの部品、structure と conditions は解釈の中身
function specDir(options: { table: string; place: string; structure: string; conditions: string }) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "desk.component.ts"),
    `import { component, compose, decide, decisionTable, does, from, goTo, input, interpretation, onlyIf, otherwise, output, ref, typed, when } from "@clp/core";
const Rules = decisionTable({ otherwise: { ${options.table} } });
export const Desk = component({
  states: ["OPEN"],
  init: "OPEN",
  data: { held: typed({ type: "integer", min: 0, max: 20 }) },
  queries: { holding: output({ type: "integer", min: 0, max: 10 }) },
  effects: { Accept: input({ fee: "integer" }), Tag: input({ urgent: "boolean" }) },
  decisions: { rules: Rules },
  commands: { Place: compose(${options.place}) },
});
export const Interpretation = interpretation(Desk, {
  structure: { commands: { Place: ${options.structure} } } as any,
  meanings: { conditions: { ${options.conditions} } } as any,
});
`,
  );
  return dir;
}
const accept = `effects: [{ Accept: { fee: ref.decision("rules", "fee") } }]`;
// 上限を、事前条件で書いた仕様
const asPrecondition = () =>
  specDir({
    table: "limit: 3, fee: 100",
    place: `onlyIf("The holder is below the limit")`,
    structure: `{ ${accept} }`,
    conditions: `"The holder is below the limit": (state: any) => state.holding < decide(Desk, "rules", state).limit`,
  });
// 同じ上限を、断るという結果で書いた仕様
const asOutcome = () =>
  specDir({
    table: "limit: 3, fee: 100",
    place: `when("The holder is at the limit", does("It is refused.")), otherwise()`,
    structure: `{ when: { "The holder is at the limit": {}, otherwise: { ${accept} } } }`,
    conditions: `"The holder is at the limit": (state: any) => state.holding >= decide(Desk, "rules", state).limit`,
  });
const found = async (dir: string) => (await observability(await loadSpecs(dir), { seed: 1 })).map((v) => `${v.column}:${v.verdict}:${v.severity}`);

test("事前条件にしか現れない値は、エラー。断ることを結果として書けば、検証に現れる", async () => {
  assert.deepEqual(await found(asPrecondition()), ["limit:precondition:error"]);
  assert.deepEqual(await found(asOutcome()), []);
  const [limit] = await observability(await loadSpecs(asPrecondition()), { seed: 1 });
  assert.match(describeUnobservable(limit), /決定表 rules の行 "otherwise" の limit \(3\): この値を変えても、変わるのは「コマンドを実行できるかどうか」だけです[\s\S]*結果の1つ \(when/);
});

test("どこからも使われていない値は、エラー。真偽値は、警告にとどめる（ゲートが合否に使わないため）", async () => {
  const unused = specDir({ table: "fee: 100, spare: 7, label: \"x\", urgent: true", place: "goTo(\"OPEN\")", structure: `{ ${accept} }`, conditions: "" });
  assert.deepEqual(await found(unused), ["spare:unobserved:error", "label:unobserved:error", "urgent:unobserved:warning"]);
  // 使えば、現れる
  const used = specDir({ table: "fee: 100, urgent: true", place: "goTo(\"OPEN\")", structure: `{ effects: [{ Accept: { fee: ref.decision("rules", "fee") } }, { Tag: { urgent: ref.decision("rules", "urgent") } }] }`, conditions: "" });
  assert.deepEqual(await found(used), []);
});

test("生成される入力が届かないしきい値は、エラー。null のセルは、対象にしない", async () => {
  // holding は 0〜10 なので、50 以上になることは無い
  const unreachable = specDir({
    table: "limit: 50, fee: 100, gap: null",
    place: `when("The holder is at the limit", does("It is refused.")), otherwise()`,
    structure: `{ when: { "The holder is at the limit": {}, otherwise: { ${accept} } } }`,
    conditions: `"The holder is at the limit": (state: any) => state.holding >= decide(Desk, "rules", state).limit`,
  });
  assert.deepEqual(await found(unreachable), ["limit:unobserved:error"]);
});

test("例の仕様と、フレームワーク自身の仕様に、エラーになる値は無い", async () => {
  for (const dir of [specsDir, join(repoRoot, "examples/library-ts/specs"), join(repoRoot, "packages/cli/self/specs")]) {
    for (const component of await listComponents(dir)) {
      const errors = (await observability(await loadSpecs(dir, { component }), { seed: 1 })).filter((v) => v.severity === "error");
      assert.deepEqual(errors, [], `${dir} ${component}`);
    }
  }
});

test("clp compile と clp apply は、エージェントを呼ぶ前に、検証に現れない値で止まる", async () => {
  const clp = (dir: string) => spawnSync(process.execPath, [join(repoRoot, "packages/cli/bin/clp.ts"), "compile", dir], { encoding: "utf8" });
  const rejected = clp(asPrecondition());
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /error\[unobservable-value\] 決定表 rules の行 "otherwise" の limit \(3\)/);
  assert.equal(clp(asOutcome()).status, 0);

  const called: string[] = [];
  const strategy: ImplementationStrategy = { name: "nobody", run: ({ phase }) => void called.push(phase) };
  await assert.rejects(
    implement({ specs: asPrecondition(), out: mkdtempSync(join(tmpRoot, "out-")), strategy }),
    /仕様 \(desk\) に、検証に現れない値があります:[\s\S]*limit \(3\)/,
  );
  assert.deepEqual(called, []);
});
