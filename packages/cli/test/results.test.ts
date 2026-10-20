import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { boundaryOf, extract } from "../src/extract.ts";
import { generateContract } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { loadSpecs } from "../src/loader.ts";
import { check, compareSpecs, observability } from "../src/runtime.ts";
import type { Adapter, Ports } from "../src/runtime.ts";
import { observationsEqualStage0 } from "../src/observe.ts";

// コマンドの結果: 返すものの形 (output) を宣言し、場合ごとに返す値 (responds) を書く。検証は、返した値も比べる

const tmpRoot = join(import.meta.dirname, ".tmp-results");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 本棚の1冊。借りる (Borrow) は、断ることがある。返す (Return) と、のぞく (Peek) は、値1つを返す
const SHELF = (options: { borrow?: string; added?: string; peek?: string } = {}) => `import { commands, conditions, decisions, integer, interpretation, optional, otherwise, queries, record, service, states, was } from "@clp/core";
const State = states(["AVAILABLE", "ON_LOAN"]);
const If = conditions({ memberHoldsMaximumNumberBooks: "The member holds the maximum number of books" });
const Decision = decisions({ policy: [otherwise({ maxBooks: 3, loanDays: 14 })] });
const Policy = Decision.policy;
const Command = commands({
  Borrow: {
    from: State.AVAILABLE,
    ${options.borrow ?? `output: record({ result: ["lent", "refused"], dueInDays: optional("integer") }),
    cases: [If.memberHoldsMaximumNumberBooks.then({ responds: { result: "refused", dueInDays: null } }),`}
      otherwise({ goTo: State.ON_LOAN, does: "The book is lent. The answer says in how many days it is due." }),
    ],
  },
  // Layer 1 が、返す値まで書いたコマンド
  Return: { from: State.ON_LOAN, goTo: State.AVAILABLE, output: ["returned"], responds: "returned" },
  // 読み取りだけのコマンド: 状態も副作用も無く、結果だけ
  Peek: { output: "boolean", does: "Answers whether the book is on loan." },
});
export const Shelf = service({ init: State.AVAILABLE, uses: [State, queries({ booksHeld: integer({ min: 0, max: 5 }) }), Decision, If, Command] });
export const Interpretation = interpretation(Shelf, [
  ${options.added ?? `Command.Borrow.with({ cases: [otherwise({ responds: { result: "lent", dueInDays: Policy["loanDays"] } })] }),`}
  Command.Peek.with({ ${options.peek ?? `responds: was(State.ON_LOAN)`} }),
  If.memberHoldsMaximumNumberBooks.means((state) => state.booksHeld >= Policy.of(state).maxBooks),
]);
`;
function specDir(source = SHELF()) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "shelf.component.ts"), source);
  return dir;
}

// 手書きの本番コードとアダプター。断り方と、のぞいたときの答えを差し替えられる
function adapterWith(options: { refuse?: (held: number) => unknown; peek?: (onLoan: boolean) => unknown } = {}): Adapter {
  let ports: Ports;
  let state = "AVAILABLE";
  return {
    async setupIsolation(given) {
      ports = given;
      state = "AVAILABLE";
    },
    async teardownIsolation() {},
    async executeCommand(command: { name: string }) {
      if (command.name === "Borrow") {
        const held = ports.queries.booksHeld() as number;
        if (held >= 3) return options.refuse ? options.refuse(held) : { result: "refused", dueInDays: null };
        state = "ON_LOAN";
        return { result: "lent", dueInDays: 14 };
      }
      if (command.name === "Return") {
        state = "AVAILABLE";
        return "returned";
      }
      return options.peek ? options.peek(state === "ON_LOAN") : state === "ON_LOAN";
    },
    async getCurrentState() {
      return state;
    },
  };
}
const verify = (dir: string, adapter: Adapter) => check(dir, adapter, { drafts: false }, { seed: 7, numRuns: 300 });

test("結果: IR に、返すものの形と、場合ごとに返す値が出る。契約は、返す値の型を持つ", async () => {
  const { ir, diagnostics } = extract(await loadSpecs(specDir()));
  assert.deepEqual(diagnostics, []);
  const { model, behaviors } = ir as Ir;
  assert.deepEqual(model?.outputs, {
    Borrow: { record: { result: ["lent", "refused"], dueInDays: "integer" }, optional: ["dueInDays"] },
    Return: ["returned"],
    Peek: "boolean",
  });
  const borrow = behaviors.find((b) => b.name === "Borrow")!;
  // Layer 1 が書いた値と、解釈が書いた値が、同じ形で出る
  assert.deepEqual((borrow.when["The member holds the maximum number of books"] as { responds: unknown }).responds, { result: "refused", dueInDays: null });
  assert.deepEqual((borrow.when.otherwise as { responds: unknown }).responds, { result: "lent", dueInDays: { $ref: "decision:policy.loanDays" } });
  assert.deepEqual((behaviors.find((b) => b.name === "Return")!.when.otherwise as { responds: unknown }).responds, "returned");
  assert.deepEqual((behaviors.find((b) => b.name === "Peek")!.when.otherwise as { responds: unknown }).responds, { $was: ["ON_LOAN"] });

  const contract = generateContract(ir as Ir);
  assert.match(contract, /export type CommandOutput = \{\n  Borrow: \{ dueInDays: number \| null; result: "lent" \| "refused" \};\n  Peek: boolean;\n  Return: "returned";\n\};/);
  assert.match(contract, /executeCommand\(command: Command\): Promise<CommandOutput\[keyof CommandOutput\] \| void>;/);
  // 返すものの形は、境界（契約を決める部分）に入る
  assert.match(boundaryOf(ir as Ir), /"outputs"/);
});

test("結果: 返すコマンドが無い仕様の IR と契約は、以前と変わらない", async () => {
  const { ir } = extract(await loadSpecs(join(import.meta.dirname, "../../../examples/checkout-ts/specs")));
  assert.equal((ir as Ir).model?.outputs, undefined);
  assert.match(generateContract(ir as Ir), /executeCommand\(command: Command\): Promise<void>;/);
  assert.doesNotMatch(boundaryOf(ir as Ir), /outputs/);
});

test("検証: 返した値も比べる。断ったことを伝えない実装、違う値を返す実装は、不合格", async () => {
  const dir = specDir();
  assert.equal((await verify(dir, adapterWith())).status, "pass");

  // 断ったのに、何も返さない
  const silent = await verify(dir, adapterWith({ refuse: () => undefined }));
  assert.ok(silent.status === "fail");
  assert.deepEqual(silent.steps.map((step) => step.command), ["Borrow"]);
  assert.deepEqual(silent.expected, { state: "AVAILABLE", effects: [], output: { result: "refused", dueInDays: null } });
  assert.deepEqual(silent.actual, { state: "AVAILABLE", effects: [], output: null });

  // 断ったのに、貸したと答える
  const lying = await verify(dir, adapterWith({ refuse: () => ({ result: "lent", dueInDays: 14 }) }));
  assert.ok(lying.status === "fail");
  assert.deepEqual(lying.actual, { state: "AVAILABLE", effects: [], output: { result: "lent", dueInDays: 14 } });

  // 読み取りだけのコマンドも、答えで確かめられる
  const blind = await verify(dir, adapterWith({ peek: () => false }));
  assert.ok(blind.status === "fail");
  assert.deepEqual(blind.steps.at(-1)?.command, "Peek");
  assert.deepEqual(blind.expected, { state: "ON_LOAN", effects: [], output: true });
});

test("検査: 返す値の誤り（返す値が無い、形を宣言していない、null、知らないフィールド、型違い）", async () => {
  const messages = async (source: string) => extract(await loadSpecs(specDir(source))).diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n");
  const borrow = (otherwise: string) => SHELF({ added: `Command.Borrow.with({ cases: [otherwise({ ${otherwise} })] }),` });
  assert.match(await messages(borrow("")), /missing-response: コマンド Borrow は output を宣言していますが、この場合に返す値 \(responds\) がありません/);
  assert.match(await messages(borrow(`responds: { result: "lent" }`)), /missing-field: responds に、フィールド "dueInDays" がありません/);
  assert.match(await messages(borrow(`responds: { result: null, dueInDays: 1 }`)), /bad-value: responds\.result: null を返せるのは、optional\(\.\.\.\) と宣言したフィールドだけです/);
  assert.match(await messages(borrow(`responds: { result: "lost", dueInDays: 1 }`)), /bad-value: responds\.result: "lost" は "lent" \| "refused" に入りません/);
  assert.match(await messages(borrow(`responds: { result: "lent", dueInDays: 1, extra: true }`)), /bad-value: responds\.extra: "extra" は、output のフィールドにありません/);
  assert.match(await messages(borrow(`responds: "lent"`)), /bad-response: responds: 返すものはフィールドの組です/);
  assert.match(await messages(SHELF({ peek: `responds: { onLoan: true }` })), /bad-value: responds: \{"onLoan":true\} は boolean に入りません/);
  assert.match(await messages(SHELF({ peek: `responds: Policy["loanDays"]` })), /bad-value: responds: 決定表の値 14 は boolean に入りません/);
  // 形を宣言していないコマンドは、返せない
  const undeclared = SHELF({ borrow: `cases: [If.memberHoldsMaximumNumberBooks.then({ responds: "refused" }),`, added: "" });
  assert.match(await messages(undeclared), /bad-response: コマンド Borrow は、返すものの形 \(output\) を宣言していないので、responds は書けません/);
  // Layer 1 が書いた返す値を、解釈は書き換えられない
  const overriding = SHELF({ added: `Command.Borrow.with({ cases: [If.memberHoldsMaximumNumberBooks.then({ responds: { result: "lent", dueInDays: 1 } }), otherwise({ responds: { result: "lent", dueInDays: 1 } })] }),` });
  assert.match(await messages(overriding), /bad-interpretation: commands\.Borrow\.cases\.The member holds the maximum number of books\.responds: Layer 1 に書かれているので、解釈では書けません/);
});

test("結果にしか現れない決定表の値は、検証に現れる。2つの解釈の比較は、返す値の違いも報告する", async () => {
  const spec = await loadSpecs(specDir());
  assert.deepEqual(await observability(spec, { seed: 1, numRuns: 300 }), []);
  // もう一方は、期日を 1 日と読んだ
  const other = await loadSpecs(specDir(SHELF({ added: `Command.Borrow.with({ cases: [otherwise({ responds: { result: "lent", dueInDays: 1 } })] }),` })));
  const differences = await compareSpecs(spec, other, { seed: 1 });
  assert.deepEqual(differences.map((d) => `${d.command}:${d.aspect}`), ["Borrow:output"]);
  assert.deepEqual(differences[0].first, { state: "ON_LOAN", effects: [], output: { result: "lent", dueInDays: 14 } });
  assert.deepEqual(differences[0].other, { state: "ON_LOAN", effects: [], output: { result: "lent", dueInDays: 1 } });
});

test("観測値の比較 (N12b): Stage 1 の比較は Stage 0 と一致しなければならず、食い違えばフレームワークの誤りとして止める (R4)", async () => {
  const dir = specDir();
  const run = (deciders: Parameters<typeof check>[4]) => check(dir, adapterWith(), { drafts: false }, { seed: 7, numRuns: 50 }, deciders);
  // 同じ判断をする Stage 1 なら、結果は変わらない。動かなくなった Stage 1 (undefined) は、Stage 0 だけで続ける
  assert.equal((await run({ observationsEqual: async (expected, actual, answers) => observationsEqualStage0(expected, actual, answers) })).status, "pass");
  assert.equal((await run({ observationsEqual: async () => undefined })).status, "pass");
  // いつも「一致」と答える甘い Stage 1 は、正しい実装の上では Stage 0 と一致し、通る
  assert.equal((await run({ observationsEqual: async () => true })).status, "pass");
  // いつも「不一致」と答える Stage 1 は、Stage 0 と食い違うので、止まる（実装の誤りにはしない）
  const stopped = await run({ observationsEqual: async () => false });
  assert.equal(stopped.status, "error");
  assert.match((stopped as { message: string }).message, /フレームワークの誤り: 観測値の比較が、Stage 0 \(一致\) と Stage 1 \(observation-compare: 不一致\)/);
  // 甘い Stage 1 でも、誤った実装は Stage 0 との食い違いで止まり、合格にはならない
  const lenient = await check(dir, adapterWith({ peek: () => "yes" }), { drafts: false }, { seed: 7, numRuns: 50 }, { observationsEqual: async () => true });
  assert.equal(lenient.status, "error");
});
