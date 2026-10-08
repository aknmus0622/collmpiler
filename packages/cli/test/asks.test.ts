import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import { generateContract } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { loadSpecs } from "../src/loader.ts";
import { check } from "../src/runtime.ts";
import type { Adapter, Ports } from "../src/runtime.ts";

// 引数つきの問い合わせ: 何を尋ねるかを仕様に書き (asks)、実装が尋ねた引数を照合する

const tmpRoot = join(import.meta.dirname, ".tmp-asks");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 扉: ノックした人が会員なら開く。会員かどうかは、名前を渡して尋ねる。
// Layer 1 が尋ねることを決めたコマンド (Knock) と、解釈が決めたコマンド (Ring) がある
const DOOR = (ringAsks = `asks("level", "levelOf", { person: ref.data("owner") }),`) => `import { asks, component, description, emits, from, goTo, input, interpretation, onlyWhen, otherwise, output, ref, set, when } from "@clp/core";
export const Door = component({
  states: ["CLOSED", "OPEN"],
  init: "CLOSED",
  data: { owner: "string" },
  queries: {
    isMember: component(description("Whether this person is a member."), input({ person: "string" }), output("boolean")),
    isHoliday: "boolean",
    levelOf: component(input({ person: "string" }), output(["guest", "staff"])),
  },
  effects: { Greet: input({ level: ["guest", "staff"] }) },
  commands: {
    Knock: component(
      input({ visitor: "string", friend: "string" }),
      from("CLOSED"),
      asks("member", "isMember", { person: ref.input("visitor") }),
      asks("friendIsMember", "isMember", { person: ref.input("friend") }),
      when("The visitor and the friend are both members", goTo("OPEN")),
      otherwise(),
    ),
    Ring: description("The owner rings; the door closes and greets them by their level, except on holidays."),
  },
});
export const Interpretation = interpretation(Door, {
  commands: {
    Knock: component(when("The visitor and the friend are both members", set({ owner: ref.input("visitor") })), otherwise()),
    Ring: component(from("OPEN"), goTo("CLOSED"), ${ringAsks} emits("Greet", { level: ref.query("level") }, onlyWhen("It is not a holiday"))),
  },
  meanings: {
    conditions: {
      "The visitor and the friend are both members": (state) => state.member === true && state.friendIsMember === true,
      "It is not a holiday": (state) => !state.isHoliday,
    },
  },
});
`;
function specDir(source = DOOR()) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "door.component.ts"), source);
  return dir;
}

// 手書きの本番コードとアダプター。knock が、だれについて尋ねるかを差し替えられる
type Asking = (visitor: string, friend: string) => string[];
function adapterWith(asking: Asking, options: { swallow?: boolean; greetAlways?: boolean } = {}): Adapter {
  let ports: Ports;
  let state = "CLOSED";
  let owner = "";
  return {
    async setupIsolation(given) {
      ports = given;
      state = "CLOSED";
    },
    async teardownIsolation() {},
    async executeCommand(command: { name: string; input: { visitor: string; friend: string } }) {
      if (command.name === "Knock") {
        const { visitor, friend } = command.input;
        let all = true;
        for (const person of asking(visitor, friend)) {
          try {
            // 会員でない人が見つかったら、残りは尋ねない
            if (!ports.queries.isMember({ person })) {
              all = false;
              break;
            }
          } catch (error) {
            if (!options.swallow) throw error;
            all = false;
          }
        }
        if (all) {
          state = "OPEN";
          owner = visitor;
        }
      } else {
        state = "CLOSED";
        if (options.greetAlways || !ports.queries.isHoliday()) ports.effects.Greet({ level: ports.queries.levelOf({ person: owner }) });
      }
    },
    async getCurrentState() {
      return state;
    },
  };
}
const verify = (dir: string, adapter: Adapter) => check(dir, adapter, { drafts: false }, { seed: 7, numRuns: 300 });

test("IR と契約: 問い合わせは引数と答えの型を持ち、コマンドは尋ねることを持つ", async () => {
  const { ir, diagnostics } = extract(await loadSpecs(specDir()));
  assert.deepEqual(diagnostics, []);
  const { model, behaviors, descriptions } = ir as Ir;
  assert.deepEqual(model?.queries, {
    isMember: { input: { person: "string" }, output: "boolean" },
    isHoliday: { input: {}, output: "boolean" },
    levelOf: { input: { person: "string" }, output: ["guest", "staff"] },
  });
  assert.equal(descriptions?.["queries.isMember"], "Whether this person is a member.");
  // Layer 1 が書いた asks も、解釈が書いた asks も、同じ形で出る
  assert.deepEqual(behaviors.find((b) => b.name === "Knock")?.asks, {
    member: { query: "isMember", input: { person: { $ref: "input:visitor" } } },
    friendIsMember: { query: "isMember", input: { person: { $ref: "input:friend" } } },
  });
  assert.deepEqual(behaviors.find((b) => b.name === "Ring")?.asks, { level: { query: "levelOf", input: { person: { $ref: "data:owner" } } } });
  const contract = generateContract(ir as Ir);
  assert.match(contract, /isHoliday\(\): boolean;/);
  assert.match(contract, /isMember\(input: \{ person: string \}\): boolean;/);
  assert.match(contract, /levelOf\(input: \{ person: string \}\): "guest" \| "staff";/);
});

test("検証: 仕様どおりの引数で尋ねる実装は合格する。尋ねる順序は問わず、答えで結果が決まったあとは尋ねなくてよい", async () => {
  const dir = specDir();
  assert.equal((await verify(dir, adapterWith((visitor, friend) => [visitor, friend]))).status, "pass");
  assert.equal((await verify(dir, adapterWith((visitor, friend) => [friend, visitor]))).status, "pass");
});

test("検証: 仕様に無い引数で尋ねたら不合格。何について尋ねたかを報告する", async () => {
  const dir = specDir();
  // 友人についても、訪問者の名前で尋ねている
  const result = await verify(dir, adapterWith((visitor) => [visitor, visitor.toUpperCase() + "!"]));
  assert.ok(result.status === "fail");
  assert.deepEqual(result.steps.map((step) => step.command), ["Knock"]);
  assert.ok("error" in result.actual);
  assert.match(result.actual.error, /ports\.queries\.isMember was asked with \{"person":".*!"\}, but in this command the specification asks it only with \{"person":".*"\} or \{"person":".*"\}/);
  // 反例には、そのコマンドで尋ねること（引数と答え）が載る
  assert.deepEqual(result.steps[0].asks.map((asked) => [asked.name, asked.query]), [["member", "isMember"], ["friendIsMember", "isMember"]]);
  // 本番コードが例外を握りつぶしても、不合格になる
  const swallowed = await verify(dir, adapterWith((visitor) => [visitor, "nobody"], { swallow: true }));
  assert.ok(swallowed.status === "fail" && "error" in swallowed.actual);
  assert.match(swallowed.actual.error, /was asked with \{"person":"nobody"\}/);
});

test("検証: 必要なことを尋ねない実装は、結果の食い違いとして見つかる", async () => {
  // 友人について尋ねない（訪問者が会員なら開けてしまう）
  const result = await verify(specDir(), adapterWith((visitor) => [visitor]));
  assert.ok(result.status === "fail");
  assert.deepEqual(result.expected, { state: "CLOSED", effects: [] });
  assert.deepEqual(result.actual, { state: "OPEN", effects: [] });
});

test("検証: 引数の無い問い合わせと、覚えているデータを引数にする問い合わせ", async () => {
  // 休日でも挨拶する実装
  const result = await verify(specDir(), adapterWith((visitor, friend) => [visitor, friend], { greetAlways: true }));
  assert.ok(result.status === "fail");
  assert.deepEqual(result.steps.map((step) => step.command), ["Knock", "Ring"]);
  // Ring は、覚えている持ち主について尋ねる
  const [asked] = result.steps[1].asks;
  assert.deepEqual([asked.name, asked.query, asked.input], ["level", "levelOf", { person: result.steps[0].input.visitor }]);
});

test("検査: asks の誤り (知らない問い合わせ、引数の漏れ・型違い、引数つきの問い合わせを尋ねずに読む)", async () => {
  const messages = async (ringAsks: string) => extract(await loadSpecs(specDir(DOOR(ringAsks)))).diagnostics.map((d) => d.message).join("\n");
  assert.match(await messages(`asks("level", "levelOff", { person: ref.data("owner") }),`), /asks\.level: 問い合わせ "levelOff" は queries にありません/);
  assert.match(await messages(`asks("level", "levelOf"),`), /asks\.level: 問い合わせ levelOf に、引数 "person" がありません/);
  assert.match(await messages(`asks("level", "levelOf", { person: 1 }),`), /asks\.level\.person: 1 は string に入りません/);
  assert.match(await messages(`asks("level", "levelOf", { person: ref.query("isHoliday") }),`), /asks\.level\.person: 引数に書けるのは、定数か、ref\.input \/ ref\.data です/);
  assert.match(await messages(""), /"level" は、queries にも、コマンド Ring の asks にもありません/);
  // Layer 1 が尋ねることを書いたコマンドには、解釈は asks を書けない
  const overriding = DOOR().replace("Knock: component(when(", 'Knock: component(asks("other", "isMember", { person: "x" }), when(');
  assert.notEqual(overriding, DOOR());
  assert.match(extract(await loadSpecs(specDir(overriding))).diagnostics.map((d) => d.message).join("\n"), /コマンド "Knock" の asks は Layer 1 に書かれているので、解釈では書けません/);
});

test("読み込み: 尋ねた答えに付けた名前は、data や入力と重ねられない", async () => {
  await assert.rejects(loadSpecs(specDir(DOOR(`asks("owner", "levelOf", { person: ref.data("owner") }),`))), /"owner" が重複しています \(data と asks\)/);
});
