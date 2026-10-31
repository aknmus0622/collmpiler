import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { contract8 } from "../src/v1/generate.ts";
import { compile } from "../src/v1/load.ts";
import { check8 } from "../src/v1/pbt.ts";
import type { Adapter8 } from "../src/v1/pbt.ts";
import { boundary8 } from "../src/v1/runtime.ts";

// 見出し components (DSL.md §17.3): 並べた部品は互いに外。相手の仕様が代役で、呼んだコマンドは観測される
process.env.CLP_ALLOY = "off";
const tmpRoot = mkdtempSync(join(import.meta.dirname, ".tmp-siblings-"));
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

const PARTS = `import { init, Map, Set, requires, service } from "@clp/core";
import type { Id } from "@clp/core";
export type MemberId = Id<"会員">;
export const Members = service("会員を登録する。", {
  state: { known: Set<MemberId>() },
  commands: { Register(member: MemberId) { this.known.add(member); }, Leave(member: MemberId) { this.known.delete(member); } },
  queries: { IsMember(member: MemberId): boolean { return this.known.has(member); } },
});
export const Library = service("会員にだけ貸す。", {
  state: { lent: Set<MemberId>() },
  commands: {
    Borrow(member: MemberId) {
      if (!Members.IsMember(member)) return "not-member";
      this.lent.add(member);
      return "ok";
    },
    Welcome(member: MemberId) {
      Members.Register(member);
    },
  },
  queries: { HasBorrowed(member: MemberId): boolean { return this.lent.has(member); } },
});
`;
function specs(town: string) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "town.component.ts"), PARTS + town);
  return dir;
}
const TOWN = `export const Town = service("町の図書館。", { components: { library: Library, members: Members } });\n`;

function libraryCode(options: { forgetsToAsk?: boolean; forgetsToRegister?: boolean } = {}): Adapter8 {
  let lent = new Set<string>();
  let ports: { members: { IsMember(i: { member: string }): boolean; Register(i: { member: string }): void } };
  return {
    async setupIsolation(given) {
      ports = given as typeof ports;
      lent = new Set();
    },
    async teardownIsolation() {},
    async executeCommand({ name, input }) {
      const { member } = input as { member: string };
      if (name === "Welcome") {
        if (!options.forgetsToRegister) ports.members.Register({ member });
        return;
      }
      if (!options.forgetsToAsk && !ports.members.IsMember({ member })) return "not-member";
      lent.add(member);
      return "ok";
    },
    async executeQuery({ input }) {
      return lent.has((input as { member: string }).member);
    },
  };
}

test("components: 兄弟は呼ばれても中に入らず、外のものになる。入れ物が無ければ、これまでどおり子になる", () => {
  const { ir, problems } = compile(specs(TOWN), "library");
  assert.deepEqual(problems.filter((p) => p.severity === "error"), []);
  assert.equal(ir!.components.library.contains, undefined);
  assert.deepEqual(ir!.components.library.relies, ["members"]);
  assert.equal(ir!.components.members.sibling, true);
  // Register は Library が呼ぶが、ほかの誰かも呼べる。相手の問い合わせは本番の入り口ではない
  assert.ok(ir!.entries.commands.includes("members.Register") && ir!.entries.commands.includes("members.Leave"));
  assert.deepEqual(ir!.entries.queries, ["library.HasBorrowed"]);

  const alone = compile(specs(""), "library").ir!;
  assert.deepEqual(alone.components.library.contains, ["members"]);
  assert.equal(alone.components.members.sibling, undefined);
});

test("components: 契約では相手が ports になり、相手のコマンドは本番の入り口に現れない", () => {
  const ir = compile(specs(TOWN), "library").ir!;
  const contract = contract8(ir);
  assert.match(contract, /members: \{[\s\S]*IsMember\(input: \{ member: MemberId \}\): boolean;[\s\S]*Register\(input: \{ member: MemberId \}\): void;/);
  assert.doesNotMatch(contract, /Leave: \{/);
  assert.match(contract, /Welcome/);
  assert.notEqual(boundary8(ir), boundary8(compile(specs(""), "library").ir!));
});

test("components: 相手の仕様が代役として答え、呼んだコマンドは順に比べられる。間違った本番は落ちる", async () => {
  const ir = compile(specs(TOWN), "library").ir!;
  const run = (adapter: Adapter8) => check8(ir, adapter, { seed: 1, numRuns: 300 });
  const passed = await run(libraryCode());
  assert.equal(passed.status, "pass", JSON.stringify(passed).slice(0, 500));
  // 別の誰かの登録 (代役のコマンド) を見ないと、断るべき所で貸してしまう
  assert.equal((await run(libraryCode({ forgetsToAsk: true }))).status, "fail");
  assert.equal((await run(libraryCode({ forgetsToRegister: true }))).status, "fail");
});

test("components: 親が部品を持つと、並べた部品は親の中。誤った置き方と、外からの呼び返しは誤り", () => {
  const parent = `export const Town = service("町。", {
    components: { library: Library, members: Members },
    commands: { Open(member: MemberId) { Library.Welcome(member); } },
  });\n`;
  const town = compile(specs(parent), "town").ir!;
  assert.deepEqual(town.components.town.contains, ["library", "members"]);
  assert.equal(town.components.members.sibling, undefined);

  const bad = compile(specs(`export const Clock = 1;\nexport const Town = service("町。", { components: { library: Library, clock: Clock } });\n`), "library");
  assert.ok(bad.problems.some((p) => p.code === "bad-component"), JSON.stringify(bad.problems));

  const cycle = `export const Up = service("上。", { commands: { Ping() { Down.Pong(); } } });
export const Down = service("下。", { commands: { Pong() {}, Back() { Up.Ping(); } } });
export const Pair = service("組。", { components: { up: Up, down: Down } });
`;
  assert.ok(compile(specs(cycle), "down").problems.some((p) => p.code === "cycle"));
  // 輪でなくても、外の部品が中の部品を呼ぶのは呼び返し
  const reaching = `export const Inner = service("中。", { commands: { Tick() {} } });
export const Up = service("上。", { commands: { Ping() { Inner.Tick(); Down.Pong(); } } });
export const Down = service("下。", { commands: { Pong() { Inner.Tick(); } } });
export const Pair = service("組。", { components: { up: Up, down: Down } });
`;
  assert.ok(compile(specs(reaching), "up").problems.some((p) => p.code === "calls-back"));
  // コマンドを持つ親に並べても、呼び合えない: 書く順に関わらず輪として断る
  const inParent = cycle.replace("{ components: { up: Up, down: Down } }", "{ components: { up: Up, down: Down }, commands: { Go() { Down.Back(); } } }");
  for (const [spec, root] of [[inParent, "pair"], [inParent, "up"], [inParent.replace("Pong() {}, Back() { Up.Ping(); }", "Back() { Up.Ping(); }, Pong() {}"), "pair"]] as const) {
    const problems = compile(specs(spec), root).problems;
    assert.ok(problems.some((p) => p.code === "cycle"), root);
    assert.ok(!problems.some((p) => p.code === "unknown-name"), root);
  }
  // 両方に関わることは、親のコマンドから順に呼ぶ
  const together = compile(specs(`export const Up = service("上。", { commands: { Ping() { Down.Pong(); } } });
export const Down = service("下。", { commands: { Pong() {}, Back() {} } });
export const Pair = service("組。", { components: { up: Up, down: Down }, commands: { Go() { Down.Back(); Up.Ping(); } } });
`), "pair");
  assert.deepEqual(together.problems, []);
  assert.deepEqual(together.ir!.components.pair.contains, ["down", "up"]);
});
