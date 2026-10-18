import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import { generateContract } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { loadSpecs } from "../src/loader.ts";
import { check, selfCheck } from "../src/runtime.ts";
import type { Adapter, Ports } from "../src/runtime.ts";

// 本物の web (N9。DSL.md §16.4): 依存の失敗 (mayFail、W8)

const tmpRoot = join(import.meta.dirname, ".tmp-durable");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 採番が失敗することがある。タイトルが空なら、採番の成否によらず 422
const IDS = (cases: string) => `import { all, commands, conditions, input, interpretation, not, optional, otherwise, queries, record, service } from "@clp/core";
export const Query = queries({ newId: { output: "string", fresh: true, mayFail: true }, region: "string" });
export const If = conditions({ blank: "The title is blank" });
export const When = conditions({ idFailed: all(not(If.blank), Query.newId.failed) });
export const AddInput = input({ title: "string" });
export const Command = commands({
  Add: { input: AddInput, output: record({ status: [201, 422, 503], id: optional("string") }), cases: [${cases}] },
});
export const Ids = service({ uses: [Query, If, When, Command] });
export const Interpretation = interpretation(Ids, [If.blank.means((state) => state.title.trim() === "")]);
`;
const HANDLED = `If.blank.then({ responds: { status: 422, id: null } }), When.idFailed.then({ responds: { status: 503, id: null } }), otherwise({ responds: { status: 201, id: Query.newId } })`;

function specDir(source: string) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "ids.component.ts"), source);
  return dir;
}

// 手書きの実装。order: タイトルを先に確かめるか、採番を先にするか。catches: 失敗を受け止めるか
function idsAdapter(options: { order: "title-first" | "id-first"; catches: boolean }): Adapter {
  let ports: Ports;
  const add = (title: string) => {
    const issue = () => {
      if (!options.catches) return { id: ports.queries.newId() as string };
      try {
        return { id: ports.queries.newId() as string };
      } catch {
        return { failed: true as const };
      }
    };
    // 採番を先にする実装は、失敗したら、タイトルを見ずに 503 を返す
    const issued = options.order === "id-first" ? issue() : undefined;
    if (issued && "failed" in issued) return { status: 503, id: null };
    if (title.trim() === "") return { status: 422, id: null };
    const result = issued ?? issue();
    return "failed" in result ? { status: 503, id: null } : { status: 201, id: result.id };
  };
  return {
    async setupIsolation(given) {
      ports = given;
    },
    async teardownIsolation() {},
    async executeCommand(command) {
      return add(command.input.title);
    },
    async getCurrentState() {
      return "READY";
    },
  };
}

test("依存の失敗 (W8): 失敗は条件の1つ。代役はときどき失敗し、仕様は失敗の場合を言う。尋ねる順番も検証に現れる", async () => {
  const dir = specDir(IDS(HANDLED));
  const spec = await loadSpecs(dir);
  assert.deepEqual(extract(spec).diagnostics, []);
  assert.ok((await selfCheck(spec, { seed: 1 })).ok);

  // IR と契約: 失敗することがある問い合わせと、失敗の条件の中身
  const { ir } = extract(spec);
  assert.deepEqual(((ir as Ir).model as unknown as { queries: Record<string, unknown> }).queries.newId, { input: {}, output: "string", promise: "fresh", mayFail: true });
  assert.deepEqual((ir as { conditions?: Record<string, unknown> }).conditions?.['query "newId" failed'], { failed: "newId" });
  assert.match(generateContract(ir as Ir), /May fail: throws when the dependency is unavailable/);

  const verify = (adapter: Adapter) => check(dir, adapter, { drafts: false }, { seed: 3, numRuns: 300 });
  assert.equal((await verify(idsAdapter({ order: "title-first", catches: true }))).status, "pass");
  // 失敗を受け止めない実装は、失敗した手で落ちる
  const uncaught = await verify(idsAdapter({ order: "title-first", catches: false }));
  assert.equal(uncaught.status, "fail");
  assert.ok(uncaught.status === "fail" && uncaught.steps.at(-1)?.failed?.includes("newId"));
  // 採番を先にする実装は、タイトルが空で採番も失敗した手で、422 ではなく 503 を返して落ちる
  const early = await verify(idsAdapter({ order: "id-first", catches: true }));
  assert.equal(early.status, "fail");
  assert.ok(early.status === "fail" && early.steps.at(-1)?.case === "The title is blank");
});

test("依存の失敗: 失敗したときのことを書かない仕様は、エージェントを呼ぶ前に止まる。失敗しない問い合わせの failed は誤り", async () => {
  const silent = await selfCheck(await loadSpecs(specDir(IDS(`If.blank.then({ responds: { status: 422, id: null } }), otherwise({ responds: { status: 201, id: Query.newId } })`))), { seed: 1 });
  assert.ok(!silent.ok);
  assert.match(silent.message, /問い合わせ "newId" が失敗した場面で、その答えが読まれました/);

  const wrong = IDS(HANDLED).replace(`all(not(If.blank), Query.newId.failed)`, `all(not(If.blank), Query.region.failed)`);
  const found = extract(await loadSpecs(specDir(wrong))).diagnostics.map((d) => `${d.code}: ${d.message}`);
  assert.ok(found.some((line) => /^bad-failure: query "region" failed: 問い合わせ region は失敗しません/.test(line)), found.join("\n"));
});

// 再起動を越えて残る (W7): 数を数える。数は、再起動のあとも残る
const COUNTER = `import { calculations, commands, data, integer, interpretation, service } from "@clp/core";
export const Data = data({ count: { type: integer({ min: 0, max: 100 }), initially: 0 } });
export const Calc = calculations({ next: { description: "The count plus one, at most 100.", output: "integer" } });
export const Command = commands({
  Increment: { set: [Data.count.set(Calc.next)] },
  Get: { output: "integer", responds: Data.count },
});
export const Counter = service({ description: "Counts.", durable: true, uses: [Data, Calc, Command] });
export const Interpretation = interpretation(Counter, [Calc.next.means((state) => Math.min(100, state.count + 1))]);
`;

// 手書きの実装。where: 数をどこに持つか
function counterAdapter(where: "storage" | "memory", restartable = true): Adapter {
  type Code = { get(): number; increment(): void; close(): void };
  const open = async (path: string): Promise<Code> => {
    if (where === "memory") {
      let count = 0;
      return { get: () => count, increment: () => void (count = Math.min(100, count + 1)), close: () => {} };
    }
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE IF NOT EXISTS counter (n INTEGER NOT NULL)");
    const get = () => (db.prepare("SELECT n FROM counter").get() as { n: number } | undefined)?.n ?? 0;
    return {
      get,
      increment: () => {
        const next = Math.min(100, get() + 1);
        db.exec("DELETE FROM counter");
        db.prepare("INSERT INTO counter (n) VALUES (?)").run(next);
      },
      close: () => db.close(),
    };
  };
  let ports: Ports;
  let code: Code;
  const adapter: Adapter = {
    async setupIsolation(given) {
      ports = given;
      code = await open(given.storage!);
    },
    async teardownIsolation() {
      code.close();
    },
    async executeCommand(command) {
      if (command.name === "Get") return code.get();
      code.increment();
    },
    async getCurrentState() {
      return "READY";
    },
  };
  if (restartable) {
    adapter.restartSystem = async () => {
      code.close();
      code = await open(ports.storage!);
    };
  }
  return adapter;
}

test("再起動 (W7): durable の部品は、検証の途中で再起動される。保存先に持つ実装は通り、メモリにしか持たない実装は落ちる", async () => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "counter.component.ts"), COUNTER);
  const spec = await loadSpecs(dir);
  const { ir, diagnostics } = extract(spec);
  assert.deepEqual(diagnostics, []);
  assert.equal(((ir as Ir).model as unknown as { durable?: unknown }).durable, true);
  const contract = generateContract(ir as Ir);
  assert.match(contract, /storage: string;/);
  assert.match(contract, /restartSystem\(\): Promise<void>;/);

  const verify = (adapter: Adapter) => check(dir, adapter, { drafts: false }, { seed: 5, numRuns: 200 });
  assert.equal((await verify(counterAdapter("storage"))).status, "pass");
  const memory = await verify(counterAdapter("memory"));
  assert.equal(memory.status, "fail");
  assert.ok(memory.status === "fail" && memory.steps.some((step) => step.command === "(restart)"), JSON.stringify(memory));
  const missing = await verify(counterAdapter("storage", false));
  assert.ok(missing.status === "fail" && "error" in missing.actual && /restartSystem\(\) is missing/.test(missing.actual.error));
});

test("保存先の部品 (W7): durable に部品を渡すと、IR はその名前を指す。durable でない部品の契約は変わらない", async () => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "store.component.ts"),
    `import { commands, input, service, value } from "@clp/core";
export const Command = commands({ Put: { input: input({ key: "string", value: value() }), nothing: true } });
export const Store = service({ description: "Keeps values by key.", durable: true, uses: [Command] });
`,
  );
  writeFileSync(join(dir, "store.interpretation.ts"), `import { interpretation } from "@clp/core";\nimport { Store } from "./store.component.ts";\nexport const Interpretation = interpretation(Store, []);\n`);
  writeFileSync(join(dir, "counter.component.ts"), COUNTER.replace('import { calculations,', 'import { Store } from "./store.component.ts";\nimport { calculations,').replace("durable: true", "durable: Store"));
  const spec = await loadSpecs(dir, { component: "counter" });
  const { ir, diagnostics } = extract(spec);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(((ir as Ir).model as unknown as { durable?: unknown }).durable, { store: "store" });

  const plainDir = specDir(IDS(HANDLED));
  const contract = generateContract(extract(await loadSpecs(plainDir)).ir as Ir);
  assert.doesNotMatch(contract, /restartSystem|storage/);
});

test("何でも入る値 (value) のフィールドには、null も入る（optional でなくても）", async () => {
  const { conforms } = await import("../src/schema.ts");
  assert.ok(conforms({ record: { key: "string", value: "value" } }, { key: "a", value: null }));
  assert.ok(!conforms({ record: { key: "string", value: "string" } }, { key: "a", value: null }));
});
