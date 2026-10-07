import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { RuleConflictError, calculate, component, compose, decide, interpretation, matchCondition, onlyIf } from "@clp/core";
import { Interpretation } from "../../../specs/order.interpretation.ts";
import { Order } from "../../../specs/order.component.ts";
import { extract } from "../src/extract.ts";
import type { Ir } from "../src/generate.ts";
import { layer1Hash, loadSpecs } from "../src/loader.ts";
import { selfCheck } from "../src/runtime.ts";

// 例の仕様 (specs/) と、仕様の読み込み・検査

const paid = { status: "PENDING", rank: "Gold", price: 1999, isMonthEnd: true, paymentModuleActive: true, paymentResult: "succeeded" } as const;

test("意味: 決定表は、成り立つ条件の行を返す。どれも成り立たなければ otherwise", () => {
  assert.deepEqual(decide(Order, "campaign", paid), { discountPercent: 20, grantsCoupon: true, coupon: "Premium" });
  assert.deepEqual(decide(Order, "campaign", { ...paid, rank: "Bronze" }), { discountPercent: 0, grantsCoupon: false, coupon: null });
});

test("意味: 計算は決定表の結果を使える (1999円の20%引きは、1599.2 を切り捨てて 1599)", () => {
  assert.equal(calculate(Order, "amountCharged", paid), 1599);
});

test("同時に成り立つ条件は1つまで: 複数成立すると RuleConflictError", () => {
  const Tiny = component({ states: ["A"], init: "A", commands: { Go: compose(onlyIf("First", "Second")) } });
  const binding = interpretation(Tiny, { structure: { commands: { Go: {} } }, meanings: { conditions: { First: () => true, Second: () => true } } });
  assert.throws(() => matchCondition(binding, ["First", "Second", "otherwise"], {}), RuleConflictError);
  assert.equal(matchCondition(binding, ["otherwise"], {}), "otherwise");
});

test("Layer 1 と解釈の構造には関数が無い (そのまま IR にできる)", () => {
  const hasFunction = (value: unknown): boolean =>
    typeof value === "function" || (typeof value === "object" && value !== null && Object.values(value).some(hasFunction));
  assert.equal(hasFunction(Order), false);
  assert.equal(hasFunction(Interpretation.component), false);
  assert.equal(hasFunction(Interpretation.commands), false);
  assert.equal(hasFunction(Interpretation.conditions), true);
});

test("specs/ の IR 出力は実行ごとにバイト一致する", () => {
  const compile = () => execFileSync(process.execPath, ["packages/cli/src/compile.ts", "specs"], { encoding: "utf8" });
  const first = compile();
  assert.equal(first, compile());
  const ir = JSON.parse(first);
  const find = (name: string) => ir.behaviors.find((b: { name: string }) => b.name === name);

  // Layer 1 の骨組みと文に、解釈の構造が重なる。意味の関数は出ない
  const succeeded = find("Checkout").when["The payment succeeded"];
  assert.equal(succeeded.goTo, "PAID");
  assert.match(succeeded.does, /A receipt is sent/);
  assert.deepEqual(succeeded.effects, [
    {
      name: "SendReceipt",
      payload: { discountPercent: { $ref: "decision:campaign.discountPercent" }, amount: { $ref: "calculation:amountCharged" } },
    },
    { name: "IssueCoupon", payload: { type: { $ref: "decision:campaign.coupon" } }, when: { $ref: "decision:campaign.grantsCoupon" } },
  ]);
  assert.deepEqual(find("PlaceOrder").when.otherwise.set, {
    rank: { $ref: "input:customerRank" },
    price: { $ref: "input:listPrice" },
  });
  // 文だけのコマンド (Cancel): 文は description として出て、構造はすべて解釈から来る
  assert.match(find("Cancel").description, /A pending or paid order can be cancelled/);
  assert.deepEqual(find("Cancel").from, ["PENDING", "PAID"]);
  assert.deepEqual(find("Cancel").when.otherwise, { goTo: "CANCELLED", effects: [{ name: "Refund", payload: {}, when: { $was: ["PAID"] } }] });
  // 遷移先を書かなかった結果 (支払いの失敗) には goTo が無い。状態は変わらない
  assert.ok(!("goTo" in find("Checkout").when.otherwise));
  assert.match(ir.descriptions.component, /^An order:/);
  assert.deepEqual(ir.model.calculations.amountCharged, {
    is: "price × (100 − discount percent) ÷ 100, rounded down to a whole yen",
    type: "integer",
  });
  // 値の無いセル (null) は、そのまま IR に出る
  assert.deepEqual(ir.decisions.campaign.rows.otherwise, { discountPercent: 0, grantsCoupon: false, coupon: null });
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

// 仕様ファイルを一時ディレクトリに書き出す。declaration は component の中身、structure と meanings は解釈の中身
function specDir(declaration: string, structure?: string, meanings = "conditions: {}") {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { component, compose, decisionTable, description, dir, does, file, from, goTo, input, interpretation, onlyIf, otherwise, ref, text, when } from "@clp/core";
const Size = decisionTable({ "It is big": { count: 10, urgent: true }, otherwise: { count: 1, urgent: false } });
export const Thing = component({ states: ["A", "B"], init: "A", ${declaration} });
${structure === undefined ? "" : `export const Interpretation = interpretation(Thing, { structure: { ${structure} }, meanings: { ${meanings} } });`}
`,
  );
  return dir;
}
const go = `goTo("B"), does("It moves on.")`;
const codes = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => d.code).sort();
const messages = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => d.message);

test("読み込み: data・queries・入力の名前が重なるとエラー (条件から区別できないため)", async () => {
  const dir = specDir(`data: { rank: "string" }, commands: { Place: compose(input({ rank: "string" }), ${go}) }`, `commands: { Place: {} }`);
  await assert.rejects(loadSpecs(dir), /"rank" が重複しています \(data と input\)/);
});

test("部品: 遷移先が2つ書かれていたらエラー。文は、つなげて1つになる", async () => {
  await assert.rejects(loadSpecs(specDir(`commands: { Place: compose(goTo("A"), goTo("B")) }`)), /遷移先 \(goTo\) が2つ書かれています: "A" と "B"/);
  const spec = await loadSpecs(specDir(`commands: { Place: compose(description("First."), does("It moves."), description("Second."), does("It stops.")) }`, `commands: { Place: {} }`));
  assert.deepEqual(spec.behaviors.Place, { description: "First. Second.", from: undefined, onlyIf: undefined, when: { otherwise: { does: "It moves. It stops.", effects: [], set: {} } } });
});

test("解釈: Layer 1 が構造として書いたものは、書き換えられない", async () => {
  const declaration = `effects: { Notify: {} }, commands: { Place: compose(input({ note: "string" }), from("A"), onlyIf("Flag is on"), when("It is big", goTo("B")), otherwise()), Back: compose(goTo("A")) }`;
  const report = async (structure: string) => (await messages(specDir(declaration, structure))).join("\n");
  const fine = `Place: { when: { "It is big": {}, otherwise: {} } }, Back: {}`;

  assert.doesNotMatch(await report(`commands: { ${fine} }`), /Layer 1/);
  assert.match(await report(`states: ["A", "B", "C"], commands: { ${fine} }`), /states は Layer 1 に構造として書かれているので、解釈では書けません/);
  assert.match(await report(`init: "B", commands: { ${fine} }`), /init は Layer 1 に書かれているので、解釈では書けません/);
  assert.match(await report(`effects: { Notify: {}, Extra: {} }, commands: { ${fine} }`), /effects は Layer 1 に構造として書かれているので/);
  assert.match(await report(`commands: { Place: { input: { other: "string" }, when: { "It is big": {}, otherwise: {} } }, Back: {} }`), /コマンド "Place" の input は Layer 1 に書かれているので/);
  assert.match(await report(`commands: { Place: { from: ["B"], when: { "It is big": {}, otherwise: {} } }, Back: {} }`), /コマンド "Place" の from は Layer 1 に書かれているので/);
  assert.match(await report(`commands: { Place: { when: { "It is big": { goTo: "A" }, otherwise: {} } }, Back: {} }`), /コマンド "Place" の条件 "It is big" の goTo は Layer 1 に書かれているので/);
  assert.match(await report(`commands: { Place: { when: { "It is big": {}, "It is odd": {}, otherwise: {} } }, Back: {} }`), /条件 "It is odd" は Layer 1 にありません/);
  assert.match(await report(`commands: { Place: { goTo: "B" }, Back: {} }`), /コマンド "Place" は条件で分かれるので、goTo は when の下に/);
  assert.match(await report(`commands: { ${fine}, Jump: {} }`), /コマンド "Jump" は Layer 1 にありません/);
  // Layer 1 が遷移先を1つに決めたコマンドを、解釈が場合分けすることもできない
  assert.match(await report(`commands: { Place: { when: { "It is big": {}, otherwise: {} } }, Back: { when: { "It is big": {}, otherwise: {} } } }`), /コマンド "Back": Layer 1 が遷移先を1つに決めているので、解釈では場合分けできません/);
});

test("解釈: すべてのコマンドと場合に、構造が要る (足すものが無ければ {})。when には otherwise が要る", async () => {
  const declaration = `commands: { Place: compose(when("It is big", goTo("B")), otherwise()), Back: compose(goTo("A")), Split: compose(when("It is big", goTo("B"))) }`;
  const report = async (commands: string) => (await messages(specDir(declaration, `commands: { ${commands} }`))).join("\n");
  const split = `Split: { when: { "It is big": {}, otherwise: {} } }`;
  assert.match(await report(`Place: { when: { "It is big": {}, otherwise: {} } }, ${split}`), /コマンド "Back" の構造が、解釈にありません/);
  assert.match(await report(`Place: { when: { "It is big": {} } }, Back: {}, ${split}`), /コマンド "Place" の条件 "otherwise" の構造が、解釈にありません/);
  // Layer 1 が otherwise を書いていなければ、解釈が足す
  assert.match(await report(`Place: { when: { "It is big": {}, otherwise: {} } }, Back: {}, Split: { when: { "It is big": {} } }`), /コマンド "Split" に otherwise がありません/);
  assert.equal((await codes(specDir(declaration, `commands: { Place: { when: { "It is big": {}, otherwise: {} } }, Back: {}, ${split} }`, `conditions: { "It is big": () => true }`))).join(), "");
});

test("読み込み: 省略した宣言は空として扱い、分かれないコマンドは otherwise だけの表になる", async () => {
  const spec = await loadSpecs(specDir(`commands: { Place: compose(from("A"), ${go}) }`, `commands: { Place: {} }`));
  assert.deepEqual(spec.model, { init: "A", states: ["A", "B"], data: {}, commands: { Place: {} }, queries: {}, effects: {} });
  assert.deepEqual(spec.behaviors.Place, {
    from: ["A"],
    onlyIf: undefined,
    when: { otherwise: { goTo: "B", does: "It moves on.", effects: [], set: {} } },
  });
});

test("文だけのコンポーネント: 構造は、すべて解釈が持つ。遷移先を書かなければ、状態は変わらない", async () => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "counter.component.ts"),
    `import { component, description, interpretation, ref } from "@clp/core";
export const Counter = component(description("A counter that can be raised by a step. It reports each new total. It can be closed."));
export const Interpretation = interpretation(Counter, {
  structure: {
    states: ["OPEN", "CLOSED"],
    init: "OPEN",
    data: { total: "integer" },
    effects: { ReportTotal: { total: "integer" } },
    calculations: { raised: { is: "the total so far (0 if none) plus the step", type: "integer" } },
    commands: {
      Raise: {
        input: { step: { type: "integer", min: 0, max: 10 } },
        from: ["OPEN"],
        does: "The total goes up by the step and is reported.",
        set: { total: ref.calculation("raised") },
        effects: [{ ReportTotal: { total: ref.calculation("raised") } }],
      },
      Close: { from: ["OPEN"], goTo: "CLOSED" },
    },
  },
  meanings: { conditions: {}, calculations: { raised: (state) => (state.total ?? 0) + (state.step ?? 0) } },
});
`,
  );
  const spec = await loadSpecs(dir);
  const { ir: extracted, diagnostics } = extract(spec);
  const ir = extracted as Ir;
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(ir.descriptions, { component: "A counter that can be raised by a step. It reports each new total. It can be closed." });
  assert.deepEqual(ir.model?.states, ["OPEN", "CLOSED"]);
  const raise = ir.behaviors.find((b) => b.name === "Raise")!;
  assert.deepEqual(Object.keys(raise.when.otherwise as object).sort(), ["does", "effects", "set"]);
  assert.deepEqual(await selfCheck(spec, { seed: 1, numRuns: 100 }), { ok: true, numRuns: 100 });
  // 解釈が無ければ、語彙が定まらない
  writeFileSync(join(dir, "counter.component.ts"), readFileSync(join(dir, "counter.component.ts"), "utf8").split("export const Interpretation")[0]);
  const bare = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(bare, "counter.component.ts"), readFileSync(join(dir, "counter.component.ts"), "utf8"));
  assert.deepEqual(extract(await loadSpecs(bare)).diagnostics.map((d) => d.code), ["unbound-specification"]);
});

test("解釈: 足りない構造 (states / init / 計算の型) を報告する", async () => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { component, description, interpretation } from "@clp/core";
export const Thing = component({ calculations: { total: description("the sum") }, commands: description("It can be started.") });
export const Interpretation = interpretation(Thing, { structure: { commands: { Start: {} } } as any, meanings: { conditions: {} } as any });
`,
  );
  assert.deepEqual((await messages(dir)).sort(), ['init が、Layer 1 にも解釈にもありません', 'states が、Layer 1 にも解釈にもありません', '計算 "total" の型 (type) が、解釈にありません']);
});

test("検査: 解釈が無い、名前の意味が書かれていない", async () => {
  const declaration = `decisions: { size: Size }, calculations: { total: { is: "count times two", type: "integer" } }, invariants: ["It is fine"], commands: { Place: compose(onlyIf("Flag is on"), ${go}) }`;
  assert.deepEqual(await codes(specDir(declaration)), ["unbound-specification"]);
  assert.deepEqual(await codes(specDir(declaration, `commands: { Place: { effects: [] } }`)), [
    "unbound-calculation",
    "unbound-condition", // 決定表の行
    "unbound-condition", // onlyIf
    "unbound-invariant",
  ]);
});

test("検査: 構造の誤りを、場所と理由が分かる文面で報告する", async () => {
  const declaration = `data: { memo: "string", level: ["low", "high"] }, queries: { flag: "boolean", mode: ["x", "y"] },
    effects: { Notify: { text: "string", count: "integer" }, Grade: { level: ["low", "high"] } },
    decisions: { size: Size }, calculations: { title: { is: "the memo, upper-cased", type: "string" } },
    commands: { Place: compose(input({ note: "string" }), ${go}) }`;
  const meanings = `conditions: { "It is big": () => true }, calculations: { title: () => "t" }`;
  const report = async (structure: string) => (await messages(specDir(declaration, `commands: { Place: { ${structure} } }`, meanings))).join("\n");

  assert.equal(await report(`effects: [{ Notify: { text: ref.input("note"), count: ref.decision("size", "count") } }], set: { memo: ref.calculation("title") }`), "");
  assert.match(await report(`effects: [{ Refund: {} }]`), /副作用 "Refund" は effects にありません/);
  assert.match(await report(`effects: [{ Notify: { text: "x" } }]`), /副作用 Notify に、フィールド "count" がありません/);
  assert.match(await report(`effects: [{ Notify: { text: "x", count: 1.5 } }]`), /Notify\.count: 1\.5 は integer に入りません/);
  assert.match(await report(`effects: [{ Notify: { text: "x", count: ref.decision("size", "urgent") } }]`), /Notify\.count: 決定表の値 true は integer に入りません/);
  assert.match(await report(`effects: [{ Notify: { text: "x", count: ref.decision("weight", "count") } }]`), /決定表 "weight" は、コンポーネントの decisions にありません/);
  assert.match(await report(`effects: [{ Notify: { text: "x", count: ref.calculation("title") } }]`), /Notify\.count: string は integer に入りません/);
  assert.match(await report(`effects: [{ Grade: { level: ref.query("mode") } }]`), /Grade\.level: "x" \| "y" は "low" \| "high" に入りません/);
  assert.match(await report(`effects: [{ Grade: { level: "low" }, when: ref.decision("size", "count") }]`), /Grade の when: 決定表の値 10 は boolean に入りません/);
  assert.match(await report(`effects: [{ Grade: { level: "low" }, when: ref.was("Z") }]`), /was: "Z" は states にありません/);
  assert.match(await report(`effects: [{ Grade: { level: "low" }, when: "It is odd" }]`), /条件 "It is odd" の意味が、解釈の conditions に書かれていません/);
  assert.match(await report(`set: { nickname: "x" }`), /set\.nickname: "nickname" は data にありません/);
  assert.match(await report(`set: { memo: ref.input("nota") }`), /"nota" は、コマンド Place の input にありません/);
});

test("検査: 存在しない状態への遷移", async () => {
  const dir = specDir(`commands: { Place: compose(from("Z"), goTo("Y")) }`, `commands: { Place: {} }`);
  assert.deepEqual((await messages(dir)).sort(), ['from の "Z" は states にありません', 'goTo の "Y" は states にありません']);
});

test("解釈が古い: 導いたあとで Layer 1 が変わっていたら、使わない。決定表の値だけの変更は、古くしない", async () => {
  const stamped = (declaration: string, hash: string) => {
    const dir = specDir(declaration, `commands: { Place: {} }`, `conditions: { "It is big": () => true }`);
    const file = join(dir, "x.component.ts");
    writeFileSync(file, `// layer1: ${hash}\n${readFileSync(file, "utf8")}`);
    return dir;
  };
  const declaration = (prose: string) => `decisions: { size: Size }, commands: { Place: compose(goTo("B"), does("${prose}")) }`;
  const hash = layer1Hash((await loadSpecs(stamped(declaration("It moves on."), "sha256:0"), { bindings: false })).layer1!);
  assert.deepEqual(await codes(stamped(declaration("It moves on."), hash)), []);
  // 文が変わった
  const changed = stamped(declaration("It moves on, quickly."), hash);
  assert.deepEqual(await codes(changed), ["stale-interpretation"]);
  const result = await selfCheck(await loadSpecs(changed), { seed: 1, numRuns: 10 });
  assert.ok(result.ok, "事前検査そのものは、解釈の中身を確かめる");
  // 決定表の値だけが変わった
  const dir = stamped(declaration("It moves on."), hash);
  const file = join(dir, "x.component.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace("count: 10", "count: 99"));
  assert.deepEqual(await codes(dir), []);
});

test("添付資料: file / dir / text で宣言でき、パスはコンポーネントのファイルからの相対で読む", async () => {
  const dir = specDir(
    `assets: [file("docs/architecture.md"), dir("docs/conventions", { phases: ["design"] }), text("Adapters are named *Gateway.", { phases: ["wiring"] })], commands: { Place: compose(${go}) }`,
    `commands: { Place: {} }`,
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
    const dir = specDir(`assets: [${assets}], commands: { Place: compose(${go}) }`);
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
    `commands: { Place: compose(when("First case", goTo("B")), when("Second case", goTo("B")), otherwise(goTo("A"))) }`,
    `commands: { Place: { when: { "First case": {}, "Second case": {}, otherwise: {} } } }`,
    `conditions: { "First case": () => true, "Second case": () => true }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /複数の条件が同時に成立しました/);
});

test("事前検査: 不変条件が破れるコマンド列を、最短で報告する", async () => {
  const dir = specDir(
    `data: { note: "string" }, invariants: ["A note is remembered in B"],
     commands: { Place: compose(from("A"), ${go}), Back: compose(from("B"), goTo("A"), does("It goes back.")) }`,
    // Place がメモを覚え忘れている
    `commands: { Place: {}, Back: {} }`,
    `conditions: {}, invariants: { "A note is remembered in B": (state) => state.status !== "B" || state.note !== undefined }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /不変条件が破れました: "A note is remembered in B"/);
  assert.deepEqual(result.steps.map((step) => step.command), ["Place"]);
});

test("決定表: 値の無いセル (null) を書ける。その値が実際に使われる仕様は、事前検査が見つける", async () => {
  const declaration = (when: string) => [
    `effects: { Tag: { label: ["big", "small"] } }, queries: { flag: "boolean" }, decisions: { kind: Kind }, commands: { Place: compose(${go}) }`,
    `commands: { Place: { effects: [{ Tag: { label: ref.decision("kind", "label") }${when} }] } }`,
    `conditions: { "It is big": (state) => state.flag }`,
  ] as const;
  const withTable = (dir: string) => {
    const file = join(dir, "x.component.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("export const Thing", 'const Kind = decisionTable({ "It is big": { label: "big", tagged: true }, otherwise: { label: null, tagged: false } });\nexport const Thing'));
    return dir;
  };
  // 値のある行でだけ使う（when で守る）なら、正しい仕様
  const guarded = withTable(specDir(...declaration(`, when: ref.decision("kind", "tagged")`)));
  assert.deepEqual(await codes(guarded), []);
  assert.deepEqual(await selfCheck(await loadSpecs(guarded), { seed: 1, numRuns: 100 }), { ok: true, numRuns: 100 });
  // 守らずに使うと、値の無い行に当たったときに誤りとして報告する
  const unguarded = withTable(specDir(...declaration("")));
  assert.deepEqual(await codes(unguarded), []);
  const result = await selfCheck(await loadSpecs(unguarded), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /決定表 "kind" の行 "otherwise" には、列 "label" の値がありません \(null\) が、その値が使われました/);
});

test("事前検査: 計算の結果が宣言した型に合わなければ報告する", async () => {
  const dir = specDir(
    `effects: { Bill: { amount: "integer" } }, calculations: { half: { is: "half of it, no rounding", type: "integer" } }, commands: { Place: compose(${go}) }`,
    `commands: { Place: { effects: [{ Bill: { amount: ref.calculation("half") } }] } }`,
    `conditions: {}, calculations: { half: () => 1.5 }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /Bill\.amount = 1\.5 が宣言した型・範囲に合いません/);
});
