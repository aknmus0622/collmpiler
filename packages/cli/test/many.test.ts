import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import type { Ir } from "../src/generate.ts";
import { loadSpecs } from "../src/loader.ts";
import { decisionValues } from "../src/mutation.ts";
import { check, selfCheck } from "../src/runtime.ts";
import type { Adapter, Ports } from "../src/runtime.ts";

// 多数ある部品（DSL.md §6, §14.3 の 8）: todo 1件が、状態機械を持つ部品。一覧は、それをキーごとに多数含む。
// 項目の振る舞い（未完了 → 完了）は、計算の関数ではなく、項目の部品の構造として書かれる

const tmpRoot = join(import.meta.dirname, ".tmp-many");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

const TODO = `import { commands, conditions, data, interpretation, otherwise, service, states } from "@clp/core";
export const State = states(["OPEN", "DONE"]);
export const If = conditions({ alreadyDone: "The item is already done" });
export const Data = data({ title: "string" });
export const Command = commands({
  Complete: { output: ["completed", "already-done"], cases: [If.alreadyDone.then({ responds: "already-done" }), otherwise({ goTo: State.DONE, responds: "completed" })] },
});
export const Todo = service({ description: "One item of a to-do list.", init: State.OPEN, uses: [State, If, Data, Command] });
`;
const TODO_INTERPRETATION = `import { interpretation } from "@clp/core";
import { If, Todo } from "./todo.component.ts";
export const Interpretation = interpretation(Todo, [If.alreadyDone.means((state) => state.status === "DONE")]);
`;
const LIST = `import { among, by, calculations, commands, conditions, input, list, many, parts, queries, record, service, types } from "@clp/core";
import { Todo } from "./todo.component.ts";
export const Part = parts({ items: many(Todo, by("id")) });
export const Query = queries({ newId: { description: "A fresh identifier.", output: "string", fresh: true } });
export const AddInput = input({ title: "string" });
export const CompleteInput = input({ id: among(Part.items) });
export const RemoveInput = input({ id: among(Part.items) });
export const Completing = Part.items.at(CompleteInput.id).Complete();
export const Type = types({ Item: record({ id: "string", title: "string", done: "boolean" }) });
export const Command = commands({
  Add: { input: AddInput, output: ["created", "invalid"], does: "A blank title is invalid. Otherwise a new item with a fresh identifier is created." },
  Complete: { input: CompleteInput, calls: [Completing], output: ["completed", "already-done", "not-found"], does: "The item completes; an unknown identifier is not found." },
  Remove: { input: RemoveInput, output: ["removed", "not-found"], does: "The item is removed; an unknown identifier is not found." },
  List: { output: list(Type.Item), does: "The items, in the order they were added." },
});
export const TodoList = service({ description: "A to-do list.", uses: [Part, Query, Command] });
`;
const LIST_INTERPRETATION = `import { calculations, conditions, interpretation, list, otherwise } from "@clp/core";
import { AddInput, Command, Completing, Part, Query, RemoveInput, TodoList, Type } from "./todo-list.component.ts";
export const IfAdded = conditions({
  blank: "The title is blank",
  missing: "No item has the given identifier (the list answered nothing)",
  unknown: "No item has the given identifier",
});
export const Calc = calculations({ listed: { description: "Each item as a record, done when it is in DONE", output: list(Type.Item) } });
export const Interpretation = interpretation(TodoList, [
  Calc,
  Command.Add.with({ cases: [IfAdded.blank.then({ responds: "invalid" }), otherwise({ adds: [Part.items.add(Query.newId, { title: AddInput.title })], responds: "created" })] }),
  Command.Complete.with({ cases: [IfAdded.missing.then({ responds: "not-found" }), otherwise({ responds: Completing.answer })] }),
  Command.Remove.with({ cases: [IfAdded.unknown.then({ responds: "not-found" }), otherwise({ removes: [Part.items.remove(RemoveInput.id)], responds: "removed" })] }),
  Command.List.with({ responds: Calc.listed }),
  IfAdded.blank.means((state) => state.title.trim() === ""),
  IfAdded.missing.means((state) => state.items.Complete === null),
  IfAdded.unknown.means((state) => !state.items.some((item) => item.id === state.id)),
  Calc.listed.means((state) => state.items.map((item) => ({ id: item.id, title: item.title, done: item.status === "DONE" }))),
]);
`;

function specDir() {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "todo.component.ts"), TODO);
  writeFileSync(join(dir, "todo.interpretation.ts"), TODO_INTERPRETATION);
  writeFileSync(join(dir, "todo-list.component.ts"), LIST);
  writeFileSync(join(dir, "todo-list.interpretation.ts"), LIST_INTERPRETATION);
  return dir;
}

// 手で書いた本番コード（の代わり）。項目は、自分の状態を持つクラス
type Faults = { completeTwice?: boolean; keepRemoved?: boolean; trimTitle?: boolean };
class TodoItem {
  done = false;
  title: string;
  faults: Faults;
  constructor(title: string, faults: Faults) {
    this.title = title;
    this.faults = faults;
  }
  complete(): "completed" | "already-done" {
    if (this.done && !this.faults.completeTwice) return "already-done";
    this.done = true;
    return "completed";
  }
}
class TodoListCode {
  items: { id: string; item: TodoItem }[] = [];
  newId: () => string;
  faults: Faults;
  constructor(newId: () => string, faults: Faults) {
    this.newId = newId;
    this.faults = faults;
  }
  add(title: string) {
    if (title.trim() === "") return "invalid";
    this.items.push({ id: this.newId(), item: new TodoItem(this.faults.trimTitle ? title.trim() : title, this.faults) });
    return "created";
  }
  complete(id: string) {
    return this.items.find((entry) => entry.id === id)?.item.complete() ?? "not-found";
  }
  remove(id: string) {
    if (!this.items.some((entry) => entry.id === id)) return "not-found";
    if (!this.faults.keepRemoved) this.items = this.items.filter((entry) => entry.id !== id);
    return "removed";
  }
  list() {
    return this.items.map(({ id, item }) => ({ id, title: item.title, done: item.done }));
  }
}
function adapter(faults: Faults = {}): Adapter {
  let list: TodoListCode;
  return {
    async setupIsolation(ports: Ports) {
      list = new TodoListCode(() => ports.queries.newId(), faults);
    },
    async teardownIsolation() {},
    async executeCommand(command: { name: string; input: { title?: string; id?: string } }) {
      if (command.name === "Add") return list.add(command.input.title!);
      if (command.name === "Complete") return list.complete(command.input.id!);
      if (command.name === "Remove") return list.remove(command.input.id!);
      return list.list();
    },
    async getCurrentState() {
      return "READY";
    },
  };
}

test("多数ある部品: IR に、キーの名前と、キーで選んで呼ぶこと、作ること・消すことが出る", async () => {
  const dir = specDir();
  const { ir, diagnostics } = extract(await loadSpecs(dir, { component: "todo-list" }));
  assert.deepEqual(diagnostics, []);
  type Behavior = Ir["behaviors"][number] & { when: Record<string, { adds?: unknown; removes?: unknown }> };
  const typed = ir as unknown as Omit<Ir, "behaviors"> & { behaviors: Behavior[] };
  assert.equal(typed.model!.parts!.items.by, "id");
  const complete = typed.behaviors.find((behavior) => behavior.name === "Complete")!;
  assert.deepEqual(complete.calls, { "items.Complete": { part: "items", command: "Complete", at: { $ref: "input:id" }, input: {} } });
  const add = typed.behaviors.find((behavior) => behavior.name === "Add")!;
  assert.deepEqual(add.when.otherwise.adds, [{ part: "items", key: { $ref: "query:newId" }, data: { title: { $ref: "input:title" } } }]);
  const remove = typed.behaviors.find((behavior) => behavior.name === "Remove")!;
  assert.deepEqual(remove.when.otherwise.removes, [{ part: "items", key: { $ref: "input:id" } }]);
});

test("多数ある部品: 項目の部品の仕様を、キーごとに実行する。正しい実装は通り、項目と一覧の誤りは見つかる", async () => {
  const dir = specDir();
  assert.ok((await selfCheck(await loadSpecs(dir, { component: "todo-list" }), { seed: 1 })).ok);
  const run = (faults?: Faults) => check(dir, adapter(faults), { drafts: false, component: "todo-list" }, { seed: 1, numRuns: 500 });
  assert.equal((await run()).status, "pass");
  // 項目の判断の誤り（完了した項目を、もう一度完了できる）
  assert.equal((await run({ completeTwice: true })).status, "fail");
  // 一覧の誤り（消したはずの項目が残る、題名を勝手に整える）
  assert.equal((await run({ keepRemoved: true })).status, "fail");
  assert.equal((await run({ trimTitle: true })).status, "fail");
});

test("ミューテーション: 決定表を持たない部品でも、仕様がじかに決める答えの定数を壊す対象にする", async () => {
  const { ir } = extract(await loadSpecs(specDir(), { component: "todo" }));
  assert.deepEqual(decisionValues(ir as Ir).sort(), ["already-done", "completed"]);
});
