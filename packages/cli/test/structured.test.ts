import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import { generateContract } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { loadSpecs } from "../src/loader.ts";
import { check, observability, selfCheck } from "../src/runtime.ts";
import type { Adapter, Ports } from "../src/runtime.ts";
import { stage1Payloads } from "../src/stage1.ts";

// 構造を持つ値 (record / list / optional)、覚えるデータの初期値 (initially)、依存の約束 (fresh / increasing)、
// 入力の選び方 (among / examples)

const tmpRoot = join(import.meta.dirname, ".tmp-structured");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));
const specDir = (source: string) => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "x.component.ts"), source);
  return dir;
};

// todo の一覧。状態を持たず、項目の並びを覚える
const TODOS = (options: { newId?: string; id?: string } = {}) => `import { among, calculations, component, conditions, data, description, does, fresh, initially, input, interpretation, invariants, list, optional, otherwise, output, queries, record, responds, states, when } from "@clp/core";
const State = states("NONE", "ISSUED", "USED");
const If = conditions({ titleBlank: "The title is blank", noItemGivenIdentifier: "No item has the given identifier", itemAlreadyDone: "The item is already done", addressNotEMailAddress: "The address is not an e-mail address", tokenExpired: "The token has expired", textTooLong: "The text is too long" });
const Inv = invariants({ noTwoItemsHaveSame: "No two items have the same identifier" });
const Data = data({ items: "string", issuedAt: "string" });
const Query = queries({ now: "string" });
const Calc = calculations({ newItem: output("integer"), itemsWithNew: output("integer"), itemsWithDone: output("integer") });
const Todo = record({ id: "string", title: "string", done: "boolean" });
export const Todos = component({
  description: "A to-do list. Items are added, completed and listed.",
  data: { items: component(list(Todo), initially([])) },
  queries: { newId: ${options.newId ?? `component(description("A fresh identifier."), output("string"), fresh())`} },
  commands: {
    Add: component(
      input({ title: "string" }),
      output(record({ result: ["created", "invalid"], todo: optional(Todo) })),
      when(If.titleBlank, responds({ result: "invalid", todo: null })),
      otherwise(does("A new open item with a fresh identifier and the given title is added at the end. The answer is created, with the item.")),
    ),
    Complete: component(
      input({ id: ${options.id ?? `among(Data.items, "id")`} }),
      output(["completed", "not-found", "already-done"]),
      when(If.noItemGivenIdentifier, responds("not-found")),
      when(If.itemAlreadyDone, responds("already-done")),
      otherwise(does("The item becomes done."), responds("completed")),
    ),
    List: component(output(list(Todo)), does("The answer is the items, in the order they were added.")),
  },
  invariants: invariants({ noTwoItemsHaveSame: "No two items have the same identifier" }),
});
type Item = { id: string; title: string; done: boolean };
export const Interpretation = interpretation(Todos, {
  calculations: {
    newItem: component(description("an open item with the fresh identifier and the given title"), output(Todo)),
    itemsWithNew: component(description("the items, followed by the new item"), output(list(Todo))),
    itemsWithDone: component(description("the items, with the item of the given identifier done"), output(list(Todo))),
  },
  commands: {
    Add: component(when(If.titleBlank), otherwise(Data.items.set(Calc["itemsWithNew"]), responds({ result: "created", todo: Calc["newItem"] }))),
    Complete: component(when(If.noItemGivenIdentifier), when(If.itemAlreadyDone), otherwise(Data.items.set(Calc["itemsWithDone"]))),
    List: component(responds(Data.items)),
  },
  meanings: [If.titleBlank.means((state) => state.title.trim() === ""), If.noItemGivenIdentifier.means((state) => !state.items.some((item: Item) => item.id === state.id)), If.itemAlreadyDone.means((state) => state.items.some((item: Item) => item.id === state.id && item.done)), Calc["newItem"].means((state) => ({ id: state.newId, title: state.title, done: false })), Calc["itemsWithNew"].means((state) => [...state.items, { id: state.newId, title: state.title, done: false }]), Calc["itemsWithDone"].means((state) => state.items.map((item: Item) => (item.id === state.id ? { ...item, done: true } : item))), Inv.noTwoItemsHaveSame.means((state) => new Set(state.items.map((item: Item) => item.id)).size === state.items.length)],
});
`;

// 手書きの本番コードとアダプター
type Item = { id: string; title: string; done: boolean };
function adapterWith(options: { forgetDone?: boolean; reversed?: boolean } = {}): Adapter {
  let ports: Ports;
  let items: Item[] = [];
  return {
    async setupIsolation(given) {
      ports = given;
      items = [];
    },
    async teardownIsolation() {},
    async executeCommand(command: { name: string; input: { title: string; id: string } }) {
      if (command.name === "Add") {
        if (command.input.title.trim() === "") return { result: "invalid", todo: null };
        const todo = { id: ports.queries.newId() as string, title: command.input.title, done: false };
        items.push(todo);
        return { result: "created", todo: { ...todo } };
      }
      if (command.name === "Complete") {
        const found = items.find((item) => item.id === command.input.id);
        if (!found) return "not-found";
        if (found.done) return "already-done";
        if (!options.forgetDone) found.done = true;
        return "completed";
      }
      return options.reversed ? [...items].reverse() : items.map((item) => ({ ...item }));
    },
    async getCurrentState() {
      return "READY";
    },
  };
}
const verify = (dir: string, adapter: Adapter) => check(dir, adapter, { drafts: false }, { seed: 7, numRuns: 500 });

test("構造を持つ値: 並びとフィールドの組を、データ・結果・計算に使える。IR と契約に、その形が出る", async () => {
  const spec = await loadSpecs(specDir(TODOS()));
  const { ir, diagnostics } = extract(spec);
  assert.deepEqual(diagnostics, []);
  const model = (ir as Ir).model!;
  const todo = { record: { id: "string", title: "string", done: "boolean" } };
  assert.deepEqual(model.data, { items: { list: todo } });
  assert.deepEqual(model.initial, { items: [] });
  assert.deepEqual(model.outputs, { Add: { record: { result: ["created", "invalid"], todo }, optional: ["todo"] }, Complete: ["completed", "not-found", "already-done"], List: { list: todo } });
  assert.deepEqual(model.queries.newId, { input: {}, output: "string", promise: "fresh" });
  // 状態を持たない部品
  assert.deepEqual(model.states, ["READY"]);

  const contract = generateContract(ir as Ir);
  assert.match(contract, /Add: \{ result: "created" \| "invalid"; todo: \{ done: boolean; id: string; title: string \} \| null \};/);
  assert.match(contract, /List: \{ done: boolean; id: string; title: string \}\[\];/);
  assert.match(contract, /\/\*\* Never answers with the same value twice\. \*\/ newId\(\): string;/);
  // 構造を持つ値の検査は、手書きの版 (Stage 0) が行う（セルフホストした部品の仕様の範囲の外）
  assert.equal(await stage1Payloads(spec), undefined);
  assert.deepEqual(await selfCheck(spec, { seed: 1, numRuns: 300 }), { ok: true, numRuns: 300 });
});

test("検証: 並びの中身と順序を比べる。入力は、覚えている項目から選ばれる（同じ項目を2回完了する場面に届く）", async () => {
  const dir = specDir(TODOS());
  assert.equal((await verify(dir, adapterWith())).status, "pass");

  // 一覧を逆順で返す
  const reversed = await verify(dir, adapterWith({ reversed: true }));
  assert.ok(reversed.status === "fail");
  assert.equal(reversed.steps.at(-1)?.command, "List");

  // 完了を覚えない: 同じ項目をもう一度完了したときに「すでに完了」と答えられない
  const forgetful = await verify(dir, adapterWith({ forgetDone: true }));
  assert.ok(forgetful.status === "fail");
  // 反例の最後の手は、すでに完了した項目の、もう一度の完了。入力の id は、覚えている項目から選ばれている
  const last = forgetful.steps.at(-1)!;
  assert.equal(last.command, "Complete");
  assert.equal(last.case, "The item is already done");
  assert.ok((last.data.items as { id: string }[]).some((item) => item.id === last.input.id));
});

test("依存の約束 fresh: 一度返した値は、二度と返さない。約束が無ければ、同じ識別子が2回出て、不変条件が破れる", async () => {
  assert.deepEqual(await selfCheck(await loadSpecs(specDir(TODOS())), { seed: 1, numRuns: 500 }), { ok: true, numRuns: 500 });
  const repeated = await selfCheck(await loadSpecs(specDir(TODOS({ newId: `["a", "b"]` }))), { seed: 1, numRuns: 500 });
  assert.ok(!repeated.ok);
  assert.match(repeated.message, /不変条件が破れました: "No two items have the same identifier"/);
});

// 確認の期限: 発行した時刻を覚え、いまの時刻との差で、期限切れかを決める
const TOKEN = (now: string) => `import { calculations, component, conditions, data, decisionTable, does, from, goTo, increasing, input, integer, interpretation, invariants, otherwise, output, queries, responds, states, string, when } from "@clp/core";
const State = states("NONE", "ISSUED", "USED");
const If = conditions({ titleBlank: "The title is blank", noItemGivenIdentifier: "No item has the given identifier", itemAlreadyDone: "The item is already done", addressNotEMailAddress: "The address is not an e-mail address", tokenExpired: "The token has expired", textTooLong: "The text is too long" });
const Inv = invariants({ noTwoItemsHaveSame: "No two items have the same identifier" });
const Data = data({ items: "string", issuedAt: "string" });
const Query = queries({ now: "string" });
const Calc = calculations({ newItem: output("integer"), itemsWithNew: output("integer"), itemsWithDone: output("integer") });
const Policy = decisionTable(otherwise({ ttlSeconds: 3600 }));
export const Token = component({
  states: ["NONE", "ISSUED", "USED"],
  init: State.NONE,
  data: { issuedAt: "integer" },
  queries: { now: ${now} },
  decisions: { policy: Policy },
  commands: {
    Issue: component(input({ email: string({ examples: ["a@example.com", "not-an-address"] }) }), from(State.NONE), output(["issued", "invalid"]),
      when(If.addressNotEMailAddress, responds("invalid")), otherwise(goTo(State.ISSUED), responds("issued"))),
    Confirm: component(from(State.ISSUED), output(["confirmed", "expired"]), when(If.tokenExpired, responds("expired")), otherwise(goTo(State.USED), responds("confirmed"))),
  },
});
export const Interpretation = interpretation(Token, {
  commands: {
    Issue: component(when(If.addressNotEMailAddress), otherwise(Data.issuedAt.set(Query.now))),
    Confirm: component(when(If.tokenExpired), otherwise()),
  },
  meanings: [If.addressNotEMailAddress.means((state) => !/^[^@ ]+@[^@ ]+[.][a-z]+$/.test(state.email)), If.tokenExpired.means((state) => state.now - (state.issuedAt ?? 0) > Policy.of(state).ttlSeconds)],
});
`;

test("依存の約束 increasing と、文字列の例: 現実の時刻でも、覚えた値との差で決まるしきい値に届く", async () => {
  const unobservable = async (now: string) => (await observability(await loadSpecs(specDir(TOKEN(now))), { seed: 1, numRuns: 500 })).map((found) => `${found.column}:${found.verdict}`);
  // 進む時計: 増え幅を、仕様の中の数 (3600) の前後から選ぶ
  assert.deepEqual(await unobservable(`component(output(integer({ min: 1_700_000_000, max: 1_800_000_000 })), increasing())`), []);
  // 約束が無いと、いまの時刻は1手ごとに無関係な値になり、期限のしきい値は検証に現れない
  assert.deepEqual(await unobservable(`integer({ min: 1_700_000_000, max: 1_800_000_000 })`), ["ttlSeconds:unobserved"]);

  // 約束を付けられない型は、誤り
  const messages = extract(await loadSpecs(specDir(TOKEN(`component(output("boolean"), increasing())`)))).diagnostics.map((d) => d.message);
  assert.match(messages.join("\n"), /問い合わせ now の increasing\(\): boolean には付けられません/);
});

test("入力の生成: 仕様の中の数の前後の長さの文字列も試す（文字列の長さのしきい値に届く）", async () => {
  const spec = (limit: number) => specDir(`import { calculations, component, conditions, data, decisionTable, input, interpretation, invariants, otherwise, output, queries, responds, states, when } from "@clp/core";
const State = states("NONE", "ISSUED", "USED");
const If = conditions({ titleBlank: "The title is blank", noItemGivenIdentifier: "No item has the given identifier", itemAlreadyDone: "The item is already done", addressNotEMailAddress: "The address is not an e-mail address", tokenExpired: "The token has expired", textTooLong: "The text is too long" });
const Inv = invariants({ noTwoItemsHaveSame: "No two items have the same identifier" });
const Data = data({ items: "string", issuedAt: "string" });
const Query = queries({ now: "string" });
const Calc = calculations({ newItem: output("integer"), itemsWithNew: output("integer"), itemsWithDone: output("integer") });
const Limits = decisionTable(otherwise({ maxLength: ${limit} }));
export const Note = component({
  decisions: { limits: Limits },
  commands: { Write: component(input({ text: "string" }), output(["ok", "too-long"]), when(If.textTooLong, responds("too-long")), otherwise(responds("ok"))) },
});
export const Interpretation = interpretation(Note, {
  commands: { Write: component(when(If.textTooLong), otherwise()) },
  meanings: [If.textTooLong.means((state) => state.text.length > Limits.of(state).maxLength)],
});
`);
  // 乱数の文字列は短いので、以前は 100 文字のしきい値に届かず、「検証に現れない」と報告された
  assert.deepEqual(await observability(await loadSpecs(spec(100)), { seed: 1, numRuns: 500 }), []);
});

test("検査: 型に合わない値（並びの要素、フィールドの過不足、null、初期値）", async () => {
  const todos = (edit: (text: string) => string) => specDir(edit(TODOS()));
  const messages = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => d.message).join("\n");
  assert.match(await messages(todos((text) => text.replace("initially([])", `initially([{ id: "a", title: "t" }])`))), /data\.items の initially: \[\{"id":"a","title":"t"\}\] は \{ id: string, title: string, done: boolean \}\[\] に入りません/);
  assert.match(await messages(todos((text) => text.replace(`responds(Data.items)`, `responds(Calc["newItem"])`))), /responds: \{ id: string, title: string, done: boolean \} は \{ id: string, title: string, done: boolean \}\[\] に入りません/);
  assert.match(await messages(todos((text) => text.replace(`todo: Calc["newItem"] }`, `todo: Data.items }`))), /responds\.todo: .*\[\] は \{ id: string, title: string, done: boolean \} に入りません/);
  // 計算の結果が宣言した形に合わなければ、仕様を実行する検査が見つける
  const broken = todos((text) => text.replace(`Calc["newItem"].means((state) => ({ id: state.newId, title: state.title, done: false }))`, `Calc["newItem"].means((state) => ({ id: state.newId, title: state.title }))`));
  const checked = await selfCheck(await loadSpecs(broken), { seed: 1, numRuns: 300 });
  assert.ok(!checked.ok);
  assert.match(checked.message, /responds: todo = .* が宣言した型・範囲に合いません/);
});
