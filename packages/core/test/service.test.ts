import assert from "node:assert/strict";
import { test } from "node:test";
import {
  check, commands, conditions, data, decisions, effects, grammarOf, input, integer, interpretation, kind, layer1Of, otherwise, plain, queries, record,
  service, states, types,
} from "../index.ts";

// 0.3 の書き方 (DSL.md §16.0): 種類（席か項目）、[] と略記、service、まとまりの宣言、解釈は名前を持つノードの並び

const State = states({ OPEN: "Not done yet.", DONE: "Done." });
const If = conditions({ alreadyDone: "The item is already done" });
const Data = data({ title: "string", count: { type: integer({ min: 0 }), initially: 0, description: "How many times." } });
const Query = queries({ now: { output: "integer", increasing: true }, flag: "boolean" });
const Effect = effects({ Notify: input({ title: "string" }), Log: "Something is written to the log." });
const Decision = decisions({ fee: [If.alreadyDone.then({ amount: 0 }), otherwise({ amount: 10 })] });
const CompleteInput = input({ by: "string" });

const Command = commands({
  Complete: {
    input: CompleteInput,
    from: [State.OPEN, State.DONE],
    cases: [If.alreadyDone.then({ does: "Nothing changes." }), otherwise({ goTo: State.DONE, does: "The item is done." })],
  },
  Rename: "The title changes.",
});
const Item = service({ description: "One item.", init: State.OPEN, uses: [State, Data, Query, Effect, Decision, If, Command] });

test("service: 内部の Layer 1 の値になる（席と項目が、これまでと同じ形に変換される）", () => {
  assert.deepEqual(check(Item), []);
  assert.deepEqual(JSON.parse(JSON.stringify(layer1Of(Item))), {
    description: "One item.",
    states: { OPEN: { $description: "Not done yet." }, DONE: { $description: "Done." } },
    init: "OPEN",
    data: { title: { $fragment: { type: "string" } }, count: { $fragment: { description: "How many times.", type: { type: "integer", min: 0 }, initially: { value: 0 } } } },
    queries: { now: { $fragment: { output: "integer", promise: "increasing" } }, flag: { $fragment: { output: "boolean" } } },
    effects: { Notify: { $fragment: { input: { title: "string" } } }, Log: { $description: "Something is written to the log." } },
    decisions: { fee: { "The item is already done": { amount: 0 }, otherwise: { amount: 10 } } },
    commands: {
      Complete: {
        $fragment: {
          input: { by: "string" },
          from: ["OPEN", "DONE"],
          when: { "The item is already done": { does: "Nothing changes." }, otherwise: { goTo: "DONE", does: "The item is done." } },
        },
      },
      Rename: { $description: "The title changes." },
    },
  });
});

test("service: 決定表のまとまりは、宣言のキーが名前になり、列を取っ手で指せる", () => {
  assert.deepEqual(Decision.fee.amount, { $ref: "decision", path: ["fee", "amount"] });
});

test("席の誤り: その種類に無い席は、場所つきで報告する", () => {
  const Wrong = commands({ Go: { goto: State.DONE } as never });
  const found = check(service({ init: State.OPEN, uses: [State, Wrong], colour: "red" } as never));
  assert.deepEqual(found.map((d) => d.code).sort(), ["unknown-field", "unknown-field"]);
  assert.ok(found.some((d) => d.message.includes('"goto"') && d.at?.file.endsWith("service.test.ts")));
  assert.ok(found.some((d) => d.message.includes('"colour"')));
});

test("解釈: 名前を持つノードの並び。触れなかったコマンドと場合は、何も足さない（単一化）", () => {
  const bound = interpretation(Item, [
    Command.Complete.with({ cases: [otherwise({ emits: [Effect.Notify({ title: Data.title })] })] }),
    If.alreadyDone.means((state) => state.status === "DONE"),
  ]);
  assert.deepEqual(bound.problems, []);
  assert.deepEqual(grammarOf(bound), []);
  assert.deepEqual(Object.keys(bound.commands.Complete), ["The item is already done", "otherwise"]);
  assert.deepEqual(bound.commands.Complete.otherwise.effects, [{ Notify: { title: { $ref: "data", path: "title" } } }]);
  // Layer 1 が並べたまとまりは閉じている（足すと、これまでどおり報告される）
  const closed = interpretation(Item, [data({ renamed: "boolean" }), If.alreadyDone.means(() => false)]);
  assert.match(closed.problems.join("\n"), /data\.renamed: Layer 1 にありません/);
});

test("解釈: 部品に足す（init、まとまり）は、部品の取っ手の with で書く", () => {
  const Rough = service({ description: "Rough.", uses: [commands({ Go: { does: "It goes." } })] });
  const Mine = states(["A", "B"]);
  const bound = interpretation(Rough, [Rough.with({ init: Mine.A, uses: [Mine] })]);
  assert.deepEqual(bound.problems, []);
  assert.equal(bound.component.init, "A");
  assert.deepEqual(bound.component.states, ["A", "B"]);
});

test("副作用の修飾は続けて呼ぶ。取っ手をそのまま並びに置くと、入力のまだ無い副作用", () => {
  const Cmd = commands({ Go: { emits: [Effect.Notify({ title: "x" }).onlyWhen(If.alreadyDone), Effect.Log] } });
  const node = service({ init: State.OPEN, uses: [State, Effect, Cmd] });
  const go = node.children.find((item) => item.kind === "command")!;
  assert.deepEqual(plain(go), {
    kind: "command",
    name: "Go",
    children: [
      { kind: "emits", value: "Notify", children: [{ kind: "field", name: "title", children: [{ kind: "value", value: "x" }] }, { kind: "onlyWhen", value: "The item is already done" }] },
      { kind: "emits", value: "Log" },
    ],
  });
});

test("型のまとまり: 名前を付けて共有する", () => {
  const Type = types({ Todo: record({ id: "string" }) });
  const Q = queries({ todo: Type.Todo });
  const node = service({ uses: [Type, Q] });
  assert.deepEqual(check(node), []);
});

test("利用者の語 (L2): 種類を定義し、コアの語に展開する。展開が決定的でなければ報告する", () => {
  const toggle = kind<{ to: { $state: string } }>("toggle", {
    fields: { to: "state" },
    expand: ({ to }) => ({ goTo: to, does: "It toggles." }),
  });
  const Cmd = commands({ Flip: toggle({ to: State.DONE }) });
  const node = service({ init: State.OPEN, uses: [State, Cmd] });
  assert.deepEqual(check(node), []);
  assert.deepEqual((layer1Of(node) as any).commands.Flip.$fragment, { goTo: "DONE", does: "It toggles." });

  let n = 0;
  const unstable = kind("unstable", { fields: {}, expand: () => ({ does: `call ${n++}` }) });
  const found = check(service({ uses: [commands({ X: unstable({}) })] }));
  assert.ok(found.some((d) => d.message.includes("展開が決定的でない")));
});
