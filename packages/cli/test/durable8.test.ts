import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { contract8 } from "../src/v1/generate.ts";
import { compile } from "../src/v1/load.ts";
import { problemText } from "../src/v1/read.ts";
import { check8, selfCheck8 } from "../src/v1/pbt.ts";
import type { Adapter8 } from "../src/v1/pbt.ts";

// 本物の web (N9。DSL.md §16.4、§17): 依存の失敗 (mayFail) と、再起動を越えて残るもの (durable)
process.env.CLP_ALLOY = "off";

const tmpRoot = join(import.meta.dirname, ".tmp-durable8");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

function specDir(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
const compiled = (dir: string, component: string) => {
  const { ir, problems } = compile(dir, component);
  assert.deepEqual(problems.filter((p) => p.severity === "error").map(problemText), []);
  return ir!;
};

// 採番が失敗することがある。タイトルが空なら、採番の成否によらず 422
const IDS = (body: string) => `import { answer, external, failed, service } from "@clp/core/v1";
export const Source = external("Issues identifiers. It can be unavailable.", {
  queries: { NewId: (): string => answer({ fresh: true, mayFail: true }), Region: (): string => answer() },
});
export const Ids = service("Adds titled items.", {
  commands: {
    Add(title: string): { status: 201 | 422 | 503; id: string | null } {
${body}
    },
  },
});
`;
const HANDLED = `      if (title.trim() === "") return { status: 422, id: null };
      const id = Source.NewId();
      if (failed(id)) return { status: 503, id: null };
      return { status: 201, id: id };`;

// 手書きの実装。order: タイトルを先に確かめるか、採番を先にするか。catches: 失敗を受け止めるか
function idsAdapter(options: { order: "title-first" | "id-first"; catches: boolean }): Adapter8 {
  let ports: { source: { NewId(): string } };
  const add = (title: string) => {
    const issue = () => {
      if (!options.catches) return { id: ports.source.NewId() };
      try {
        return { id: ports.source.NewId() };
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
      ports = given as typeof ports;
    },
    async teardownIsolation() {},
    async executeCommand(command) {
      return add(command.input.title as string);
    },
  };
}

test("依存の失敗 (mayFail): 失敗は値の1つ。代役はときどき失敗し、仕様は失敗の場合を言う。尋ねる順番も検証に現れる", async () => {
  const ir = compiled(specDir({ "ids.component.ts": IDS(HANDLED) }), "ids");
  assert.ok((await selfCheck8(ir, { seed: 1 })).ok);

  // IR と契約: 失敗することがある問い合わせ
  assert.deepEqual(ir.components.source.external!.queries.NewId, { params: {}, result: "string", promise: "fresh", mayFail: true });
  assert.match(contract8(ir), /throws when the dependency is unavailable/i);

  const verify = (adapter: Adapter8) => check8(ir, adapter, { seed: 3, numRuns: 300 });
  assert.equal((await verify(idsAdapter({ order: "title-first", catches: true }))).status, "pass");
  // 失敗を受け止めない実装は、失敗した手で落ちる
  const uncaught = await verify(idsAdapter({ order: "title-first", catches: false }));
  assert.ok(uncaught.status === "fail" && "error" in uncaught.actual && /unavailable/.test(uncaught.actual.error), JSON.stringify(uncaught));
  // 採番を先にする実装は、タイトルが空で採番も失敗した手で、422 ではなく 503 を返して落ちる
  const early = await verify(idsAdapter({ order: "id-first", catches: true }));
  assert.ok(early.status === "fail" && JSON.stringify(early.expected).includes("422") && JSON.stringify(early.actual).includes("503"), JSON.stringify(early));
});

test("依存の失敗: 失敗したときのことを書かない仕様は、エージェントを呼ぶ前に止まる。失敗しない問い合わせの failed は誤り", async () => {
  const silent = compiled(specDir({ "ids.component.ts": IDS(`      if (title.trim() === "") return { status: 422, id: null };\n      return { status: 201, id: Source.NewId() };`) }), "ids");
  const checked = await selfCheck8(silent, { seed: 1 });
  assert.ok(!checked.ok);
  assert.match(checked.message, /失敗/);

  const wrong = IDS(HANDLED.replace("const id = Source.NewId();", "const id = Source.Region();"));
  const { problems } = compile(specDir({ "ids.component.ts": wrong }), "ids");
  assert.ok(problems.some((p) => p.severity === "error" && /Region/.test(problemText(p))), problems.map(problemText).join("\n"));
});

// 再起動を越えて残る (durable): 数を数える。数は、再起動のあとも残る
const COUNTER = `import { init, service } from "@clp/core/v1";
import type { Int } from "@clp/core/v1";
export const Counter = service("Counts, up to 100.", {
  state: { count: init<Int>(0) },
  commands: { Increment() { this.count = Math.min(100, this.count + 1); } },
  queries: { Get() { return this.count; } },
  durable: true,
});
`;

// 手書きの実装。where: 数をどこに持つか
function counterAdapter(where: "storage" | "memory", restartable = true): Adapter8 {
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
  let storage: string;
  let code: Code;
  const adapter: Adapter8 = {
    async setupIsolation(given) {
      storage = (given as { storage: string }).storage;
      code = await open(storage);
    },
    async teardownIsolation() {
      code.close();
    },
    async executeCommand() {
      code.increment();
    },
    async executeQuery() {
      return code.get();
    },
  };
  if (restartable) {
    adapter.restartSystem = async () => {
      code.close();
      code = await open(storage);
    };
  }
  return adapter;
}

test("再起動 (durable): 再起動を越えて残る部品は、検証の途中で再起動される。保存先に持つ実装は通り、メモリにしか持たない実装は落ちる", async () => {
  const ir = compiled(specDir({ "counter.component.ts": COUNTER }), "counter");
  assert.equal(ir.components.counter.durable, true);
  const contract = contract8(ir);
  assert.match(contract, /storage: string;/);
  assert.match(contract, /restartSystem\(\): Promise<void>;/);

  const verify = (adapter: Adapter8) => check8(ir, adapter, { seed: 5, numRuns: 200 });
  assert.equal((await verify(counterAdapter("storage"))).status, "pass");
  const memory = await verify(counterAdapter("memory"));
  assert.ok(memory.status === "fail" && memory.steps.some((step) => step.name === "(restart)"), JSON.stringify(memory));
  const missing = await verify(counterAdapter("storage", false));
  assert.ok(missing.status === "fail" && "error" in missing.actual && /restartSystem\(\) is missing/.test(missing.actual.error));

  // 再起動を越えて残るものが無い部品の契約には、保存先も再起動も無い
  assert.doesNotMatch(contract8(compiled(specDir({ "ids.component.ts": IDS(HANDLED) }), "ids")), /restartSystem|storage/);
});
