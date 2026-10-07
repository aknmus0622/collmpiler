import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { RuleConflictError, bind, calculate, component, decide, matchCondition } from "@aac/core";
import { Binding } from "../../../specs/order.binding.ts";
import { Order } from "../../../specs/order.component.ts";
import { extract } from "../src/extract.ts";
import { loadSpecs } from "../src/loader.ts";
import { selfCheck } from "../src/runtime.ts";

// 例の仕様 (specs/) と、仕様の読み込み・検査

const paid = { status: "PENDING", rank: "Gold", price: 1999, isMonthEnd: true, paymentModuleActive: true, paymentResult: "succeeded" } as const;

test("意味: 決定表は、成り立つ条件の行を返す。どれも成り立たなければ otherwise", () => {
  assert.deepEqual(decide(Order, "campaign", paid), { discountPercent: 20, grantsCoupon: true, coupon: "Premium" });
  assert.deepEqual(decide(Order, "campaign", { ...paid, rank: "Bronze" }), { discountPercent: 0, grantsCoupon: false, coupon: "Standard" });
});

test("意味: 計算は決定表の結果を使える (1999円の20%引きは、1599.2 を切り捨てて 1599)", () => {
  assert.equal(calculate(Order, "amountCharged", paid), 1599);
});

test("同時に成り立つ条件は1つまで: 複数成立すると RuleConflictError", () => {
  const Tiny = component({ states: ["A"], startsIn: "A", actions: { Go: { onlyIf: ["First", "Second"], then: { goTo: "A", does: "Nothing." } } } });
  const binding = bind(Tiny, { actions: { Go: {} }, conditions: { First: () => true, Second: () => true } });
  assert.throws(() => matchCondition(binding, ["First", "Second", "otherwise"], {}), RuleConflictError);
  assert.equal(matchCondition(binding, ["otherwise"], {}), "otherwise");
});

test("結び付けの構造には関数が無い (そのまま IR にできる)", () => {
  const hasFunction = (value: unknown): boolean =>
    typeof value === "function" || (typeof value === "object" && value !== null && Object.values(value).some(hasFunction));
  assert.equal(hasFunction(Order), false);
  assert.equal(hasFunction(Binding.actions), false);
  assert.equal(hasFunction(Binding.conditions), true);
});

test("specs/ の IR 出力は実行ごとにバイト一致する", () => {
  const compile = () => execFileSync(process.execPath, ["packages/cli/src/compile.ts", "specs"], { encoding: "utf8" });
  const first = compile();
  assert.equal(first, compile());
  const ir = JSON.parse(first);
  const find = (name: string) => ir.behaviors.find((b: { name: string }) => b.name === name);

  // コンポーネントの骨組みと文に、結び付けの構造が重なる。意味の関数は出ない
  const succeeded = find("Checkout").transitions["The payment succeeded"];
  assert.equal(succeeded.nextState, "PAID");
  assert.match(succeeded.description, /A receipt is sent/);
  assert.deepEqual(succeeded.emittedCommands, [
    {
      action: "SendReceipt",
      payload: { discountPercent: { $ref: "decision:campaign.discountPercent" }, amount: { $ref: "formula:amountCharged" } },
    },
    { action: "IssueCoupon", payload: { type: { $ref: "decision:campaign.coupon" } }, when: { $ref: "decision:campaign.grantsCoupon" } },
  ]);
  assert.deepEqual(find("PlaceOrder").transitions.otherwise.set, {
    rank: { $ref: "input:customerRank" },
    price: { $ref: "input:listPrice" },
  });
  assert.deepEqual(find("Cancel").transitions.otherwise.emittedCommands, [{ action: "Refund", payload: {}, when: { $was: ["PAID"] } }]);
  assert.deepEqual(ir.model.formulas.amountCharged, {
    is: "price × (100 − discount percent) ÷ 100, rounded down to a whole yen",
    type: "integer",
  });
  assert.deepEqual(ir.decisions.campaign.rows.otherwise, { discountPercent: 0, grantsCoupon: false, coupon: "Standard" });
  assert.ok(!first.includes("=>"));
});

test("specs/ は仕様の事前検査に合格する", async () => {
  assert.deepEqual(await selfCheck(await loadSpecs("specs"), { seed: 1, numRuns: 300 }), { ok: true, numRuns: 300 });
});

// --- 仕様の誤りの検出 (loader / extract / selfCheck) ---
// ここの仕様は型チェックを通さずに読み込む。型をすり抜けた誤りが、分かる文面で報告されることを確かめる

const tmpRoot = join(import.meta.dirname, ".tmp-specs");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 仕様ファイルを一時ディレクトリに書き出す。declaration は component の中身、bindings は bind の中身
function specDir(declaration: string, bindings?: string) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { asked, bind, calculated, component, decided, decisionTable, dir, file, given, remembered, text, was } from "@aac/core";
const Size = decisionTable({ "It is big": { count: 10, urgent: true }, otherwise: { count: 1, urgent: false } });
export const Thing = component({ states: ["A", "B"], startsIn: "A", ${declaration} });
${bindings === undefined ? "" : `export const Binding = bind(Thing, { ${bindings} });`}
`,
  );
  return dir;
}
const go = `then: { goTo: "B", does: "It moves on." }`;
const codes = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => d.code).sort();
const messages = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => d.message);

test("読み込み: remembers・asks・入力の名前が重なるとエラー (条件から区別できないため)", async () => {
  const dir = specDir(`remembers: { rank: "string" }, actions: { Place: { takes: { rank: "string" }, ${go} } }`);
  await assert.rejects(loadSpecs(dir), /"rank" が重複しています \(remembers と takes\)/);
});

test("読み込み: then と when は、どちらか一方。when には otherwise が要る", async () => {
  await assert.rejects(loadSpecs(specDir(`actions: { Place: {} }`)), /then か when の、どちらか一方/);
  await assert.rejects(
    loadSpecs(specDir(`actions: { Place: { when: { "It is big": { goTo: "B", does: "x" } } } }`)),
    /when に otherwise がありません/,
  );
});

test("読み込み: 結び付けの構造が、コンポーネントのアクションと条件に対応していなければエラー", async () => {
  const declaration = `actions: { Place: { when: { "It is big": { goTo: "B", does: "x" }, otherwise: { goTo: "A", does: "y" } } }, Back: { ${go} } }`;
  await assert.rejects(loadSpecs(specDir(declaration, `actions: { Place: { "It is big": {}, otherwise: {} } }, conditions: {}`)), /アクション "Back" の構造がありません/);
  await assert.rejects(loadSpecs(specDir(declaration, `actions: { Place: { "It is big": {} }, Back: {} }, conditions: {}`)), /条件 "otherwise" の構造がありません/);
  await assert.rejects(
    loadSpecs(specDir(declaration, `actions: { Place: { "It is big": {}, otherwise: {} }, Back: {}, Jump: {} }, conditions: {}`)),
    /"Jump" に対応するアクションが、コンポーネントにありません/,
  );
});

test("読み込み: 省略した宣言は空として扱い、分かれないアクションは otherwise だけの表になる", async () => {
  const spec = await loadSpecs(specDir(`actions: { Place: { allowedIn: ["A"], ${go} } }`, `actions: { Place: {} }, conditions: {}`));
  assert.deepEqual(spec.model, { initial: "A", states: ["A", "B"], data: {}, actions: { Place: {} }, queries: {}, commands: {} });
  assert.deepEqual(spec.behaviors.Place, {
    from: ["A"],
    where: undefined,
    cases: { otherwise: { nextState: "B", does: "It moves on.", tell: [], set: {} } },
  });
});

test("検査: 結び付けが無い、名前の意味が書かれていない", async () => {
  const declaration = `decisions: { size: Size }, calculations: { total: { is: "count times two", type: "integer" } }, alwaysTrue: ["It is fine"], actions: { Place: { onlyIf: ["Flag is on"], ${go} } }`;
  assert.deepEqual(await codes(specDir(declaration)), ["unbound-specification"]);
  assert.deepEqual(await codes(specDir(declaration, `actions: { Place: { tell: [] } }, conditions: {}`)), [
    "unbound-condition", // 決定表の行
    "unbound-condition", // onlyIf
    "unbound-formula",
    "unbound-invariant",
  ]);
});

test("検査: 構造の誤りを、場所と理由が分かる文面で報告する", async () => {
  const declaration = `remembers: { memo: "string", level: ["low", "high"] }, asks: { flag: "boolean", mode: ["x", "y"] },
    tells: { Notify: { text: "string", count: "integer" }, Grade: { level: ["low", "high"] } },
    decisions: { size: Size }, calculations: { title: { is: "the memo, upper-cased", type: "string" } },
    actions: { Place: { takes: { note: "string" }, ${go} } }`;
  const meanings = `conditions: { "It is big": () => true }, calculations: { title: () => "t" }`;
  const report = async (structure: string) => (await messages(specDir(declaration, `actions: { Place: { ${structure} } }, ${meanings}`))).join("\n");

  assert.equal(await report(`tell: [{ Notify: { text: given("note"), count: decided("size", "count") } }], remember: { memo: calculated("title") }`), "");
  assert.match(await report(`tell: [{ Refund: {} }]`), /指示 "Refund" は tells にありません/);
  assert.match(await report(`tell: [{ Notify: { text: "x" } }]`), /指示 Notify に、フィールド "count" がありません/);
  assert.match(await report(`tell: [{ Notify: { text: "x", count: 1.5 } }]`), /Notify\.count: 1\.5 は integer に入りません/);
  assert.match(await report(`tell: [{ Notify: { text: "x", count: decided("size", "urgent") } }]`), /Notify\.count: 決定表の値 true は integer に入りません/);
  assert.match(await report(`tell: [{ Notify: { text: "x", count: decided("weight", "count") } }]`), /決定表 "weight" は、コンポーネントの decisions にありません/);
  assert.match(await report(`tell: [{ Notify: { text: "x", count: calculated("title") } }]`), /Notify\.count: string は integer に入りません/);
  assert.match(await report(`tell: [{ Grade: { level: asked("mode") } }]`), /Grade\.level: "x" \| "y" は "low" \| "high" に入りません/);
  assert.match(await report(`tell: [{ Grade: { level: "low" }, when: decided("size", "count") }]`), /Grade の when: 決定表の値 10 は boolean に入りません/);
  assert.match(await report(`tell: [{ Grade: { level: "low" }, when: was("Z") }]`), /was: "Z" は states にありません/);
  assert.match(await report(`tell: [{ Grade: { level: "low" }, when: "It is odd" }]`), /条件 "It is odd" の意味が、結び付けの conditions に書かれていません/);
  assert.match(await report(`remember: { nickname: "x" }`), /remember\.nickname: "nickname" は remembers にありません/);
  assert.match(await report(`remember: { memo: given("nota") }`), /"nota" は、アクション Place の takes にありません/);
});

test("検査: 存在しない状態への遷移", async () => {
  const dir = specDir(`actions: { Place: { allowedIn: ["Z"], then: { goTo: "Y", does: "x" } } }`, `actions: { Place: {} }, conditions: {}`);
  assert.deepEqual((await messages(dir)).sort(), ['allowedIn の "Z" は states にありません', 'goTo の "Y" は states にありません']);
});

test("添付資料: file / dir / text で宣言でき、パスはコンポーネントのファイルからの相対で読む", async () => {
  const dir = specDir(
    `assets: [file("docs/architecture.md"), dir("docs/conventions", { phases: ["design"] }), text("Adapters are named *Gateway.", { phases: ["wiring"] })], actions: { Place: { ${go} } }`,
    `actions: { Place: {} }, conditions: {}`,
  );
  mkdirSync(join(dir, "docs/conventions/naming"), { recursive: true });
  writeFileSync(join(dir, "docs/architecture.md"), "- Use the repository pattern.");
  writeFileSync(join(dir, "docs/conventions/errors.md"), "- Never swallow errors.");
  writeFileSync(join(dir, "docs/conventions/naming/files.md"), "- kebab-case.");
  writeFileSync(join(dir, "docs/conventions/.hidden"), "ignored");
  const spec = await loadSpecs(dir);
  assert.deepEqual(spec.assets, [
    { kind: "file", name: "docs/architecture.md", content: "- Use the repository pattern." },
    // ディレクトリは中のファイルすべて。相対パスの構造を保つ。ドットファイルは対象外
    { kind: "file", name: "docs/conventions/errors.md", content: "- Never swallow errors.", phases: ["design"] },
    { kind: "file", name: "docs/conventions/naming/files.md", content: "- kebab-case.", phases: ["design"] },
    { kind: "text", text: "Adapters are named *Gateway.", phases: ["wiring"] },
  ]);
  // 添付資料は仕様の意味ではないので、IR には出ない（内容を変えても検証のシードは変わらない）
  assert.ok(!JSON.stringify(extract(spec).ir).includes("architecture"));
});

test("添付資料: 無いパス、file と dir の取り違え、名前の重なりはエラー", async () => {
  const load = async (assets: string) => {
    const dir = specDir(`assets: [${assets}], actions: { Place: { ${go} } }`);
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs/a.md"), "a");
    return loadSpecs(dir);
  };
  await assert.rejects(load(`file("docs/missing.md")`), /添付資料がありません: docs\/missing\.md/);
  await assert.rejects(load(`file("docs")`), /はディレクトリです。dir\(\) で指定してください/);
  await assert.rejects(load(`dir("docs/a.md")`), /はファイルです。file\(\) で指定してください/);
  await assert.rejects(load(`file("docs/a.md"), dir("docs")`), /添付資料の名前が重なっています: docs\/a\.md/);
});

test("事前検査: 2つの条件が同時に成り立つ仕様を、実装なしで見つける", async () => {
  const dir = specDir(
    `actions: { Place: { when: { "First case": { goTo: "B", does: "x" }, "Second case": { goTo: "B", does: "y" }, otherwise: { goTo: "A", does: "z" } } } }`,
    `actions: { Place: { "First case": {}, "Second case": {}, otherwise: {} } }, conditions: { "First case": () => true, "Second case": () => true }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /複数の条件が同時に成立しました/);
});

test("事前検査: 不変条件が破れるアクション列を、最短で報告する", async () => {
  const dir = specDir(
    `remembers: { note: "string" }, alwaysTrue: ["A note is remembered in B"],
     actions: { Place: { allowedIn: ["A"], ${go} }, Back: { allowedIn: ["B"], then: { goTo: "A", does: "It goes back." } } }`,
    // Place がメモを覚え忘れている
    `actions: { Place: {}, Back: {} }, conditions: {}, alwaysTrue: { "A note is remembered in B": (state) => state.status !== "B" || state.note !== undefined }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /不変条件が破れました: "A note is remembered in B"/);
  assert.deepEqual(result.steps.map((step) => step.action), ["Place"]);
});

test("事前検査: 計算の結果が宣言した型に合わなければ報告する", async () => {
  const dir = specDir(
    `tells: { Bill: { amount: "integer" } }, calculations: { half: { is: "half of it, no rounding", type: "integer" } }, actions: { Place: { ${go} } }`,
    `actions: { Place: { tell: [{ Bill: { amount: calculated("half") } }] } }, conditions: {}, calculations: { half: () => 1.5 }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /Bill\.amount = 1\.5 が宣言した型・範囲に合いません/);
});
