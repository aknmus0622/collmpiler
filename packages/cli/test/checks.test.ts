import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import { loadSpecs } from "../src/loader.ts";
import { selfCheck, unreachedCases } from "../src/runtime.ts";

// 仕様の断片: table は決定表の行、conditions は意味の関数（取っ手.means(...) の並び）
// エージェントを呼ぶ前に止める、書き間違いの検査（型の誤り、決定表の列、語彙の重なり、一度も当たらない場合、条件の衝突）

const tmpRoot = join(import.meta.dirname, ".tmp-checks");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

function specDir(options: { vocabulary?: string; table?: string; command?: string; conditions?: string }) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { commands, conditions, data, decisions, input, integer, interpretation, otherwise, queries, service, states } from "@clp/core";
const State = states(["OPEN", "CLOSED"]);
const If = conditions({ amountBig: "The amount is big", amountOdd: "The amount is odd" });
const Decision = decisions({ rules: [${options.table ?? `otherwise({ fee: 1 })`}] });
const Command = commands({
  Place: { input: input({ amount: integer({ min: 0, max: 10 }) }), ${options.command ?? `output: ["ok", "big"], cases: [If.amountBig.then({ responds: "big" }), otherwise({ responds: "ok" })]`} },
  Close: { goTo: State.CLOSED },
});
export const Desk = service({ init: State.OPEN, uses: [State, ${options.vocabulary ?? ""} Decision, If, Command] });
export const Interpretation = interpretation(Desk, [${options.conditions ?? `If.amountBig.means((state) => state.amount > Decision.rules.of(state).fee)`}]);
`,
  );
  return dir;
}
const messages = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => `${d.code}: ${d.message}`);

test("型の誤り: 範囲の矛盾、空の列挙、範囲の外のしきい値。どこに書いた型でも報告する", async () => {
  const found = await messages(
    specDir({
      vocabulary: `data({ level: [], score: integer({ min: 10, max: 1 }) }), queries({ limit: integer({ min: 0, max: 5, around: [50] }) }),`,
    }),
  );
  assert.deepEqual(found.filter((line) => line.startsWith("bad-type")), [
    "bad-type: data.level: 列挙が空です。取り得る値を1つ以上書いてください",
    "bad-type: data.score: 最小値 (min: 10) が、最大値 (max: 1) より大きいので、取り得る値がありません",
    "bad-type: queries.limit.output: しきい値 (around) の 50 が、範囲の外です",
  ]);
});

test("決定表: 行によって値の種類が違う列は、誤り", async () => {
  const found = await messages(specDir({ table: `If.amountBig.then({ fee: 1, label: "x" }), otherwise({ fee: 2, label: 0 })` }));
  assert.ok(found.includes("bad-decision: 決定表 rules の列 label: 行によって値の種類が違います (string と number)。どの行も同じ種類の値にしてください"), found.join("\n"));
});

test("語彙: 初期状態が無い、決定表に otherwise が無い。読み込みを止めずに、診断として報告する", async () => {
  const dir = specDir({ table: `If.amountBig.then({ fee: 1 })` });
  assert.ok((await messages(dir)).includes("bad-decision: 決定表 \"rules\" に otherwise がありません。どの行にも当たらないときの値を、otherwise の行に書いてください"));
});

test("一度も当たらない場合: いつも偽の条件は、注意として報告する", async () => {
  // amount は 0〜10 なので、100 を超えることは無い
  const never = await loadSpecs(specDir({ conditions: `If.amountBig.means((state) => state.amount > 100)` }));
  assert.deepEqual(await unreachedCases(never, { seed: 1, numRuns: 300 }), [{ command: "Place", case: "The amount is big" }]);
  assert.deepEqual(await unreachedCases(await loadSpecs(specDir({})), { seed: 1, numRuns: 300 }), []);
});

test("条件の衝突: 衝突したコマンドと入力を、再現するコマンド列に含める", async () => {
  const dir = specDir({
    command: `output: ["ok", "big", "odd"], cases: [If.amountBig.then({ responds: "big" }), If.amountOdd.then({ responds: "odd" }), otherwise({ responds: "ok" })]`,
    conditions: `If.amountBig.means((state) => state.amount > 5), If.amountOdd.means((state) => state.amount % 2 === 1)`,
  });
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /^Place で、複数の条件が同時に成立しました .*（入力 \{"amount":\d+\}）/);
  const last = result.steps.at(-1)!;
  assert.equal(last.command, "Place");
  assert.ok((last.input.amount as number) > 5 && (last.input.amount as number) % 2 === 1);
});
