import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { RuleConflictError, activate, commands, conditions, interpretation, matchCondition, service, states } from "@clp/core";
import { Interpretation } from "../../../examples/checkout-ts/specs/order.interpretation.ts";
import { Calc, Order } from "../../../examples/checkout-ts/specs/order.component.ts";
import { Decision } from "../../../examples/checkout-ts/specs/order.decisions.ts";
import { extract } from "../src/extract.ts";
import type { Ir } from "../src/generate.ts";
import { layer1Hash, loadSpecs } from "../src/loader.ts";
import { selfCheck } from "../src/runtime.ts";

// 例の仕様 (specs/) と、仕様の読み込み・検査

const paid = { status: "PENDING", rank: "Gold", price: 1999, isMonthEnd: true, paymentModuleActive: true, paymentResult: "succeeded" } as const;

test("意味: 決定表は、成り立つ条件の行を返す。どれも成り立たなければ otherwise", () => {
  activate(Interpretation);
  assert.deepEqual(Decision.campaign.of(paid), { discountPercent: 20, grantsCoupon: true, coupon: "Premium" });
  assert.deepEqual(Decision.campaign.of({ ...paid, rank: "Bronze" }), { discountPercent: 0, grantsCoupon: false, coupon: null });
});

test("意味: 計算は決定表の結果を使える (1999円の20%引きは、1599.2 を切り捨てて 1599)", () => {
  activate(Interpretation);
  assert.equal(Calc.amountCharged.of(paid), 1599);
});

test("同時に成り立つ条件は1つまで: 複数成立すると RuleConflictError", () => {
  const State = states(["A"]);
  const If = conditions({ first: "First", second: "Second" });
  const Tiny = service({ init: State.A, uses: [State, commands({ Go: { onlyIf: [If.first, If.second] } })] });
  const binding = interpretation(Tiny, [If.first.means(() => true), If.second.means(() => true)]);
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
  const compile = () => execFileSync(process.execPath, ["packages/cli/bin/clp.ts", "compile", "examples/checkout-ts/specs"], { encoding: "utf8" });
  const first = compile();
  assert.equal(first, compile());
  const ir = JSON.parse(first);
  const find = (name: string) => ir.behaviors.find((b: { name: string }) => b.name === name);

  // Layer 1 の骨組みと文に、解釈の構造が重なる。意味の関数は出ない
  const succeeded = find("Checkout").when["The payment succeeded"];
  assert.equal(succeeded.goTo, "PAID");
  assert.match(succeeded.does, /A receipt is sent/);
  // IR の語は、仕様を書くときの語と同じ (emits / effect / input / onlyWhen)
  assert.deepEqual(succeeded.emits, [
    {
      effect: "SendReceipt",
      input: { discountPercent: { $ref: "decision:campaign.discountPercent" }, amount: { $ref: "calculation:amountCharged" } },
    },
    { effect: "IssueCoupon", input: { type: { $ref: "decision:campaign.coupon" } }, onlyWhen: { $ref: "decision:campaign.grantsCoupon" } },
  ]);
  assert.deepEqual(find("PlaceOrder").when.otherwise.set, {
    rank: { $ref: "input:customerRank" },
    price: { $ref: "input:listPrice" },
  });
  // 文だけのコマンド (Cancel): 文は description として出て、構造はすべて解釈から来る
  assert.match(find("Cancel").description, /A pending or paid order can be cancelled/);
  assert.deepEqual(find("Cancel").from, ["PENDING", "PAID"]);
  assert.deepEqual(find("Cancel").when.otherwise, { goTo: "CANCELLED", emits: [{ effect: "Refund", input: {}, onlyWhen: { $was: ["PAID"] } }] });
  // 遷移先を書かなかった結果 (支払いの失敗) には goTo が無い。状態は変わらない
  assert.ok(!("goTo" in find("Checkout").when.otherwise));
  assert.match(ir.descriptions.component, /^An order:/);
  assert.deepEqual(ir.model.calculations.amountCharged, {
    description: "price × (100 − discount percent) ÷ 100, rounded down to a whole yen",
    output: "integer",
  });
  // 値の無いセル (null) は、そのまま IR に出る
  assert.deepEqual(ir.decisions.campaign.rows.otherwise, { discountPercent: 0, grantsCoupon: false, coupon: null });
  assert.ok(!first.includes("=>"));
});

test("specs/ は仕様の事前検査に合格する", async () => {
  assert.deepEqual(await selfCheck(await loadSpecs("examples/checkout-ts/specs"), { seed: 1, numRuns: 300 }), { ok: true, numRuns: 300 });
});

// --- 仕様の誤りの検出 (loader / extract / selfCheck) ---
// ここの仕様は型チェックを通さずに読み込む。型をすり抜けた誤りが、分かる文面で報告されることを確かめる

const tmpRoot = join(import.meta.dirname, ".tmp-specs");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 仕様ファイルを一時ディレクトリに書き出す。spec.uses は部品に並べるまとまり、spec.commands はコマンドのまとまりの中身、
// spec.service は部品のほかの席。interpretation は解釈に並べるもの（undefined なら解釈を書かない）、meanings は意味の関数。
// 参照のための取っ手（State, If, Inv, Data, Query, Effect, Calc, In）は、宣言していない名前も含む。宣言は uses に並べたもの
function specDir(spec: { uses?: string; commands: string; service?: string }, interpretation?: string, meanings = "") {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  const items = [interpretation, meanings].filter((item) => item !== undefined && item !== "").join(", ");
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { calculations, commands, conditions, data, decisions, dir, effects, file, input, interpretation, invariants, otherwise, queries, service, states, text, was } from "@clp/core";
const State = states(["A", "B", "OPEN", "CLOSED", "Z", "Y"]);
const If = conditions({ big: "It is big", flagOn: "Flag is on", odd: "It is odd", firstCase: "First case", secondCase: "Second case" });
const Inv = invariants({ fine: "It is fine", noteRememberedB: "A note is remembered in B" });
const Data = data({ total: "string", memo: "string", nickname: "string" });
const Query = queries({ mode: "string" });
const Effect = effects({ ReportTotal: input({}), Notify: input({}), Refund: input({}), Grade: input({}), Tag: input({}), Bill: input({}) });
const Calc = calculations({ raised: "integer", title: "integer", half: "integer" });
const In = input({ note: "string", nota: "string" });
const Decision = decisions({ size: [If.big.then({ count: 10, urgent: true }), otherwise({ count: 1, urgent: false })] });
const Size = Decision.size;
const Unused = decisions({ unused: [otherwise({ count: 1 })] }).unused;
const Command = commands({ ${spec.commands} });
export const Thing = service({ init: State.A, ${spec.service ?? ""} uses: [states(["A", "B"]), ${spec.uses ?? ""} Command] });
${interpretation === undefined ? "" : `export const Interpretation = interpretation(Thing, [${items}]);`}
`,
  );
  return dir;
}
const go = `goTo: State.B, does: "It moves on."`;
const codes = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => d.code).sort();
const messages = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => d.message);

test("読み込み: data・queries・入力の名前が重なるとエラー (条件から区別できないため)", async () => {
  const dir = specDir({ uses: `data({ rank: "string" }),`, commands: `Place: { input: input({ rank: "string" }), ${go} }` }, "");
  // 読み込みは止めず、ほかの診断と一緒に報告する
  assert.match((await messages(dir)).join("\n"), /"rank" が重複しています \(data と input\)。条件と計算からは同じ名前に見えるので/);
});

test("部品: 説明と、起きることの文が、そのまま振る舞いに出る（席は1つずつなので、2つ書くことはできない）", async () => {
  const spec = await loadSpecs(specDir({ commands: `Place: { description: "First.", does: "It moves." }` }, ""));
  assert.deepEqual(spec.behaviors.Place, { description: "First.", from: undefined, onlyIf: undefined, when: { otherwise: { does: "It moves.", effects: [], set: {} } } });
});

test("解釈: Layer 1 が構造として書いたものは、書き換えられない", async () => {
  const layer1 = {
    uses: `effects({ Notify: input({}), Ping: "A ping is sent." }),`,
    commands: `Place: { input: input({ note: "string" }), from: State.A, onlyIf: If.flagOn, cases: [If.big.then({ goTo: State.B }), otherwise] }, Back: { goTo: State.A }`,
  };
  const report = async (items: string) => (await messages(specDir(layer1, items))).join("\n");

  assert.doesNotMatch(await report(""), /Layer 1/);
  assert.match(await report(`Thing.with({ uses: [states(["A", "B", "C"])] })`), /states は Layer 1 に構造として書かれているので、解釈では書けません/);
  assert.match(await report(`Thing.with({ init: State.B })`), /init は Layer 1 に書かれているので、解釈では書けません/);
  // 項目を並べたまとまりには、項目を足せない。項目の、書かれていない部品だけを足せる
  assert.match(await report(`effects({ Extra: {} })`), /effects の "Extra" は Layer 1 にありません/);
  assert.match(await report(`effects({ Notify: input({ text: "string" }) })`), /effects\.Notify の input は Layer 1 に書かれているので、解釈では書けません/);
  assert.doesNotMatch(await report(`effects({ Ping: input({ text: "string" }) })`), /Layer 1/);
  assert.match(await report(`Command.Place.with({ input: input({ other: "string" }) })`), /コマンド "Place" の input は Layer 1 に書かれているので/);
  assert.match(await report(`Command.Place.with({ from: State.B })`), /コマンド "Place" の from は Layer 1 に書かれているので/);
  assert.match(await report(`Command.Place.with({ cases: [If.big.then({ goTo: State.A })] })`), /コマンド "Place" の条件 "It is big" の goTo は Layer 1 に書かれているので/);
  assert.match(await report(`Command.Place.with({ cases: [If.odd.then({})] })`), /条件 "It is odd" は Layer 1 にありません/);
  assert.match(await report(`Command.Place.with({ goTo: State.B })`), /コマンド "Place" は条件で分かれるので、goTo は when の下に/);
  assert.match(await report(`commands({ Jump: {} })`), /コマンド "Jump" は Layer 1 にありません/);
  // Layer 1 が遷移先を1つに決めたコマンドを、解釈が場合分けすることもできない
  assert.match(await report(`Command.Back.with({ cases: [If.big.then({}), otherwise] })`), /コマンド "Back": Layer 1 が遷移先を1つに決めているので、解釈では場合分けできません/);
});

test("解釈: 触れなかったコマンドと場合には、何も足さない（単一化）。when には otherwise が要る", async () => {
  const layer1 = { commands: `Place: { cases: [If.big.then({ goTo: State.B }), otherwise] }, Back: { goTo: State.A }, Split: { cases: [If.big.then({ goTo: State.B })] }` };
  const meaning = `If.big.means(() => true)`;
  // Layer 1 が otherwise を書いていなければ、解釈が足す
  assert.match((await messages(specDir(layer1, "", meaning))).join("\n"), /コマンド "Split" に otherwise がありません/);
  assert.equal((await codes(specDir(layer1, `Command.Split.with({ cases: [otherwise] })`, meaning))).join(), "");
});

test("読み込み: 省略した宣言は空として扱い、分かれないコマンドは otherwise だけの表になる", async () => {
  const spec = await loadSpecs(specDir({ commands: `Place: { from: State.A, ${go} }` }, ""));
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
    `import { calculations, commands, data, effects, input, integer, interpretation, service, states } from "@clp/core";
export const Counter = service({ description: "A counter that can be raised by a step. It reports each new total. It can be closed." });
export const State = states(["OPEN", "CLOSED"]);
export const Data = data({ total: "integer" });
export const Effect = effects({ ReportTotal: input({ total: "integer" }) });
export const Calc = calculations({ raised: { description: "the total so far (0 if none) plus the step", output: "integer" } });
export const Command = commands({
  Raise: {
    input: input({ step: integer({ min: 0, max: 10 }) }),
    from: State.OPEN,
    does: "The total goes up by the step and is reported.",
    set: [Data.total.set(Calc["raised"])],
    emits: [Effect.ReportTotal({ total: Calc["raised"] })],
  },
  Close: { from: State.OPEN, goTo: State.CLOSED },
});
export const Interpretation = interpretation(Counter, [
  Counter.with({ init: State.OPEN }),
  State,
  Data,
  Effect,
  Calc,
  Command,
  Calc["raised"].means((state) => (state.total ?? 0) + (state.step ?? 0)),
]);
`,
  );
  const spec = await loadSpecs(dir);
  const { ir: extracted, diagnostics } = extract(spec);
  const ir = extracted as Ir;
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(ir.descriptions, { component: "A counter that can be raised by a step. It reports each new total. It can be closed." });
  assert.deepEqual(ir.model?.states, ["OPEN", "CLOSED"]);
  const raise = ir.behaviors.find((b) => b.name === "Raise")!;
  assert.deepEqual(Object.keys(raise.when.otherwise as object).sort(), ["does", "emits", "set"]);
  assert.deepEqual(await selfCheck(spec, { seed: 1, numRuns: 100 }), { ok: true, numRuns: 100 });
  // 解釈が無ければ、語彙が定まらない
  const bare = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(bare, "counter.component.ts"), readFileSync(join(dir, "counter.component.ts"), "utf8").split("export const Interpretation")[0]);
  assert.deepEqual(extract(await loadSpecs(bare)).diagnostics.map((d) => d.code), ["unbound-specification"]);
});

test("解釈: 足りない構造 (init / 項目の型) を報告する。状態も初期状態も無ければ、状態を持たない部品", async () => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { calculations, commands, data, interpretation, queries, service, states } from "@clp/core";
export const Thing = service({
  uses: [
    states(["A", "B"]),
    data({ memo: { description: "A note." } }),
    queries({ ready: { description: "Whether it is ready." } }),
    calculations({ total: { description: "the sum" } }),
    commands("It can be started."),
  ],
});
export const Interpretation = interpretation(Thing, [commands({ Start: {} })]);
`,
  );
  assert.deepEqual((await messages(dir)).sort(), [
    "calculations.total の 型 (output) が、Layer 1 にも解釈にもありません",
    "data.memo の 型 (type) が、Layer 1 にも解釈にもありません",
    "init が、Layer 1 にも解釈にもありません",
    "queries.ready の 型 (output) が、Layer 1 にも解釈にもありません",
  ]);
  // 状態を持たない部品: states も init も書かない。内部では、1つだけの状態 (READY) を持つ
  const stateless = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(stateless, "x.component.ts"),
    `import { commands, interpretation, service } from "@clp/core";
export const Thing = service({ uses: [commands({ Ping: { does: "Nothing happens." } })] });
export const Interpretation = interpretation(Thing, []);
`,
  );
  const spec = await loadSpecs(stateless);
  assert.deepEqual(extract(spec).diagnostics, []);
  assert.deepEqual([spec.model?.states, spec.model?.init], [["READY"], "READY"]);
});

test("検査: 解釈が無い、名前の意味が書かれていない", async () => {
  const declaration = {
    uses: `Decision, calculations({ total: { description: "count times two", output: "integer" } }), invariants({ fine: "It is fine" }),`,
    commands: `Place: { onlyIf: If.flagOn, ${go} }`,
  };
  assert.deepEqual(await codes(specDir(declaration)), ["unbound-specification"]);
  assert.deepEqual(await codes(specDir(declaration, "")), [
    "unbound-calculation",
    "unbound-condition", // 決定表の行
    "unbound-condition", // onlyIf
    "unbound-invariant",
  ]);
});

test("検査: 構造の誤りを、場所と理由が分かる文面で報告する", async () => {
  const declaration = {
    uses: `data({ memo: "string", level: ["low", "high"] }), queries({ flag: "boolean", mode: ["x", "y"] }),
    effects({ Notify: input({ text: "string", count: "integer" }), Grade: input({ level: ["low", "high"] }) }),
    Decision, calculations({ title: { description: "the memo, upper-cased", output: "string" } }),`,
    commands: `Place: { input: input({ note: "string" }), ${go} }`,
  };
  const meanings = `If.big.means(() => true), Calc["title"].means(() => "t")`;
  const report = async (structure: string) => (await messages(specDir(declaration, `Command.Place.with({ ${structure} })`, meanings))).join("\n");

  assert.equal(await report(`emits: [Effect.Notify({ text: In.note, count: Size["count"] })], set: [Data.memo.set(Calc["title"])]`), "");
  assert.match(await report(`emits: [Effect.Refund()]`), /副作用 "Refund" は effects にありません/);
  assert.match(await report(`emits: [Effect.Notify({ text: "x" })]`), /副作用 Notify に、フィールド "count" がありません/);
  assert.match(await report(`emits: [Effect.Notify({ text: "x", count: 1.5 })]`), /Notify\.count: 1\.5 は integer に入りません/);
  assert.match(await report(`emits: [Effect.Notify({ text: "x", count: Size["urgent"] })]`), /Notify\.count: 決定表の値 true は integer に入りません/);
  // 部品に置いていない決定表の列（宣言はあるが、部品の uses に無い）
  assert.match(await report(`emits: [Effect.Notify({ text: "x", count: Unused["count"] })]`), /決定表 "unused" は、コンポーネントの decisions にありません/);
  assert.match(await report(`emits: [Effect.Notify({ text: "x", count: Calc["title"] })]`), /Notify\.count: string は integer に入りません/);
  assert.match(await report(`emits: [Effect.Grade({ level: Query.mode })]`), /Grade\.level: "x" \| "y" は "low" \| "high" に入りません/);
  assert.match(await report(`emits: [Effect.Grade({ level: "low" }).onlyWhen(Size["count"])]`), /Grade の onlyWhen: 決定表の値 10 は boolean に入りません/);
  assert.match(await report(`emits: [Effect.Grade({ level: "low" }).onlyWhen(was(State.Z))]`), /was: "Z" は states にありません/);
  assert.match(await report(`emits: [Effect.Grade({ level: "low" }).onlyWhen(If.odd)]`), /条件 "It is odd" の意味が、解釈の conditions に書かれていません/);
  assert.match(await report(`set: [Data.nickname.set("x")]`), /set\.nickname: "nickname" は data にありません/);
  assert.match(await report(`set: [Data.memo.set(In.nota)]`), /"nota" は、コマンド Place の input にありません/);
});

test("検査: 存在しない状態への遷移", async () => {
  const dir = specDir({ commands: `Place: { from: State.Z, goTo: State.Y }` }, "");
  assert.deepEqual((await messages(dir)).sort(), ['from の "Z" は states にありません', 'goTo の "Y" は states にありません']);
});

test("解釈が古い: 導いたあとで Layer 1 が変わっていたら、使わない。決定表の値だけの変更は、古くしない", async () => {
  const stamped = (declaration: { uses?: string; commands: string }, hash: string) => {
    const dir = specDir(declaration, "", `If.big.means(() => true)`);
    const file = join(dir, "x.component.ts");
    writeFileSync(file, `// layer1: ${hash}\n${readFileSync(file, "utf8")}`);
    return dir;
  };
  const declaration = (prose: string) => ({ uses: "Decision,", commands: `Place: { goTo: State.B, does: "${prose}" }` });
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
    {
      service: `assets: [file("docs/architecture.md"), dir("docs/conventions", { phases: ["design"] }), text("Adapters are named *Gateway.", { phases: ["wiring"] })],`,
      commands: `Place: { ${go} }`,
    },
    "",
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
    const dir = specDir({ service: `assets: [${assets}],`, commands: `Place: { ${go} }` });
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
    { commands: `Place: { cases: [If.firstCase.then({ goTo: State.B }), If.secondCase.then({ goTo: State.B }), otherwise({ goTo: State.A })] }` },
    "",
    `If.firstCase.means(() => true), If.secondCase.means(() => true)`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /複数の条件が同時に成立しました/);
});

test("事前検査: 不変条件が破れるコマンド列を、最短で報告する", async () => {
  const dir = specDir(
    {
      uses: `data({ note: "string" }), invariants({ noteRememberedB: "A note is remembered in B" }),`,
      commands: `Place: { from: State.A, ${go} }, Back: { from: State.B, goTo: State.A, does: "It goes back." }`,
    },
    // Place がメモを覚え忘れている
    "",
    `Inv.noteRememberedB.means((state) => state.status !== "B" || state.note !== undefined)`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /不変条件が破れました: "A note is remembered in B"/);
  assert.deepEqual(result.steps.map((step) => step.command), ["Place"]);
});

test("決定表: 値の無いセル (null) を書ける。その値が実際に使われる仕様は、事前検査が見つける", async () => {
  const declaration = (when: string) => [
    { uses: `effects({ Tag: input({ label: ["big", "small"] }) }), queries({ flag: "boolean" }), KindTable,`, commands: `Place: { ${go} }` },
    `Command.Place.with({ emits: [Effect.Tag({ label: Kind["label"] })${when}] })`,
    `If.big.means((state) => state.flag)`,
  ] as const;
  const withTable = (dir: string) => {
    const file = join(dir, "x.component.ts");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "const Command",
        'const KindTable = decisions({ kind: [If.big.then({ label: "big", tagged: true }), otherwise({ label: null, tagged: false })] });\nconst Kind = KindTable.kind;\nconst Command',
      ),
    );
    return dir;
  };
  // 値のある行でだけ使う（onlyWhen で守る）なら、正しい仕様
  const guarded = withTable(specDir(...declaration(`.onlyWhen(Kind["tagged"])`)));
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
    { uses: `effects({ Bill: input({ amount: "integer" }) }), calculations({ half: { description: "half of it, no rounding", output: "integer" } }),`, commands: `Place: { ${go} }` },
    `Command.Place.with({ emits: [Effect.Bill({ amount: Calc["half"] })] })`,
    `Calc["half"].means(() => 1.5)`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /Bill\.amount = 1\.5 が宣言した型・範囲に合いません/);
});
