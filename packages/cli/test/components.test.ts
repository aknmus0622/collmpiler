import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { listComponents, loadSpecs } from "../src/loader.ts";
import { implement } from "../src/loop.ts";
import type { Assignment, ImplementationStrategy } from "../src/strategy.ts";
import { write } from "./fixtures/scripted-agent.ts";
import type { Phase, Step } from "./fixtures/scripted-agent.ts";
import { harness, repoRoot, specsDir, unstamped } from "./support.ts";

// 複数のコンポーネント: 同じ本番コードを共有し、テスト側のファイルはコンポーネントごとに持つ

const { tmpRoot, workdir } = harness("components");

// 2つ目のコンポーネント（ランプ）。解釈も同じファイルに書いてある
const LAMP = `import { component, compose, does, goTo, input, interpretation, otherwise, when } from "@clp/core";

export const Lamp = component({
  states: ["OFF", "ON"],
  init: "OFF",
  effects: { Notify: input({ on: "boolean" }) },
  commands: {
    Flip: compose(
      when("The lamp is on", goTo("OFF"), does("The lamp turns off and a notice says so.")),
      otherwise(goTo("ON"), does("The lamp turns on and a notice says so.")),
    ),
  },
});

export const LampInterpretation = interpretation(Lamp, {
  structure: {
    commands: {
      Flip: {
        when: {
          "The lamp is on": { effects: [{ Notify: { on: false } }] },
          otherwise: { effects: [{ Notify: { on: true } }] },
        },
      },
    },
  },
  meanings: { conditions: { "The lamp is on": (state) => state.status === "ON" } },
});
`;

// 例の仕様 (注文) に、ランプを足した仕様。edit で注文の側を書き換えられる
function specs(edit: (name: string, text: string) => string = (_name, text) => text) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  for (const name of readdirSync(specsDir)) writeFileSync(join(dir, name), unstamped(edit(name, readFileSync(join(specsDir, name), "utf8"))));
  writeFileSync(join(dir, "lamp.component.ts"), LAMP);
  return dir;
}

const lampSource = (implemented: boolean, notifies = true) => `export class Lamp {
  on = false;
  private notify: (on: boolean) => void;

  constructor(notify: (on: boolean) => void) {
    this.notify = notify;
  }

  /** The Flip command. */
  flip(): void {
${implemented ? `    this.on = !this.on;${notifies ? "\n    this.notify(this.on);" : ""}` : `    throw new Error("not implemented");`}
  }
}
`;
const LAMP_ADAPTER = `import type { TargetSystemAdapter } from "./lamp.adapter.contract.ts";
import { Lamp } from "../src/lamp.ts";

let lamp: Lamp | undefined;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    lamp = new Lamp((on) => ports.effects.Notify({ on }));
  },
  async teardownIsolation() {
    lamp = undefined;
  },
  async executeCommand() {
    lamp?.flip();
  },
  async getCurrentState() {
    return lamp?.on ? "ON" : "OFF";
  },
};
`;

type Seen = { component: string; phase: Phase; files: Record<string, string> };

// LLM の代役。どのコンポーネントの依頼かを、依頼文と渡された契約から見分けて書き分ける。
// order: 注文の実装の段階で、試行ごとに書くもの。breakLamp: 注文の実装のついでに、ランプを壊す試行の番号
function scripted(options: { order?: Step[]; breakLamp?: number[] } = {}) {
  const seen: Seen[] = [];
  let orderImplementations = 0;
  const strategy: ImplementationStrategy = {
    name: "scripted",
    run({ dir, phase: rawPhase }: Assignment) {
      const phase = rawPhase as Phase;
      const files: Record<string, string> = {};
      for (const name of readdirSync(dir, { recursive: true }) as string[]) {
        if (name.includes(".")) files[name] = readFileSync(join(dir, name), "utf8");
      }
      const component =
        phase === "wiring"
          ? "clp/lamp.adapter.contract.ts" in files ? "lamp" : "order"
          : /`clp\/lamp\.ir\.json`/.test(files["clp/REQUEST.md"].split("## Other components")[0]) ? "lamp" : "order";
      seen.push({ component, phase, files });

      if (component === "lamp") {
        mkdirSync(join(dir, "src"), { recursive: true });
        if (phase === "wiring") writeFileSync(join(dir, "clp/lamp.adapter.ts"), LAMP_ADAPTER);
        else writeFileSync(join(dir, "src/lamp.ts"), lampSource(phase === "implementation"));
        return;
      }
      if (phase !== "implementation") return write(phase, "correct", dir);
      const index = orderImplementations++;
      const steps = options.order ?? ["correct"];
      write(phase, steps[Math.min(index, steps.length - 1)], dir);
      // 壊す試行でなければ、ランプを正しい実装に戻す（差し戻しを受けて直した、という想定）
      if (options.breakLamp) writeFileSync(join(dir, "src/lamp.ts"), lampSource(true, !options.breakLamp.includes(index + 1)));
    },
  };
  return { strategy, seen };
}

test("複数: 仕様にあるコンポーネントを名前順に一致させる。本番コードは共有し、テスト側はコンポーネントごと", async () => {
  const out = workdir();
  const { strategy, seen } = scripted();
  const result = await implement({ specs: specs(), out, strategy, maxAttempts: 1 });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.attempts.filter((a) => a.attempt > 0).map((a) => `${a.component}:${a.phase}`), [
    "lamp:design", "lamp:wiring", "lamp:implementation",
    "order:design", "order:wiring", "order:implementation",
  ]);
  assert.deepEqual(readdirSync(join(out, "src")).sort(), ["lamp.ts", "order-service.ts"]);
  assert.deepEqual(readdirSync(join(out, "clp")).sort(), [
    "lamp.adapter.contract.ts", "lamp.adapter.ts", "lamp.ir.json", "lamp.verify.ts",
    "order.adapter.contract.ts", "order.adapter.ts", "order.ir.json", "order.verify.ts",
  ]);
  assert.deepEqual(Object.keys(result.seeds).sort(), ["lamp", "order"]);

  const at = (component: string, phase: Phase) => seen.find((s) => s.component === component && s.phase === phase)!.files;
  // 設計と実装の段階には、ほかのコンポーネントの仕様と、すでにある本番コードが渡る
  const design = at("order", "design");
  assert.deepEqual(Object.keys(design).sort(), ["clp/REQUEST.md", "clp/lamp.ir.json", "clp/order.ir.json", "src/lamp.ts"]);
  assert.match(design["clp/REQUEST.md"], /## Other components of the same system[\s\S]*- `clp\/lamp\.ir\.json`/);
  assert.match(design["clp/REQUEST.md"], /Production code already exists under `src\/`/);
  // 配線の段階には、どの仕様も、ほかのコンポーネントのテスト側も渡らない
  assert.deepEqual(Object.keys(at("order", "wiring")).sort(), [
    "clp/REQUEST.md", "clp/order.adapter.contract.ts", "clp/order.adapter.ts", "src/lamp.ts", "src/order-service.ts",
  ]);
  assert.ok(!at("order", "wiring")["clp/REQUEST.md"].includes("Other components"));
  // 最初のコンポーネントは、何も無いところから作る
  assert.match(at("lamp", "design")["clp/REQUEST.md"], /^# Step 1 of 3[\s\S]*Design the production code for the component specified in `clp\/lamp\.ir\.json`/);
  assert.deepEqual(Object.keys(at("lamp", "design")).sort(), ["clp/REQUEST.md", "clp/lamp.ir.json", "clp/order.ir.json"]);
});

test("複数: あるコンポーネントのための変更が、ほかのコンポーネントを壊したら差し戻す (回帰)", async () => {
  const out = workdir();
  // 注文の仕様が、シルバー会員 50% だった版から始める
  const before = specs((name, text) => (name === "order.decisions.ts" ? text.replace("discountPercent: 5,", "discountPercent: 50,") : text));
  assert.equal((await implement({ specs: before, out, strategy: scripted({ order: ["buggy"] }).strategy, maxAttempts: 1 })).status, "pass");

  // 前の仕様のディレクトリは消しておく（出力先のテストの入口が古い場所を指したままでも、回帰の確認が動くこと）
  rmSync(before, { recursive: true });

  // 仕様を 5% に戻す。注文の実装を直すついでに、1回目はランプの通知を消してしまう
  const { strategy, seen } = scripted({ breakLamp: [1] });
  const result = await implement({ specs: specs(), out, strategy, maxAttempts: 2 });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.attempts.map((a) => `${a.component}:${a.phase}:${a.attempt}:${a.feedback?.kind ?? "ok"}`), [
    "lamp:implementation:0:ok",        // ランプは何も変わっていない
    "order:implementation:0:pbt",      // 注文は、いまのコードが新しい仕様で落ちる
    "order:implementation:1:regression",
    "order:implementation:2:ok",
  ]);
  const feedback = result.attempts[2].feedback;
  assert.ok(feedback?.kind === "regression" && feedback.component === "lamp");
  assert.deepEqual(feedback.result?.status === "fail" && feedback.result.expected, { state: "ON", effects: [{ name: "Notify", payload: { on: true } }] });
  assert.match(seen[1].files["clp/REQUEST.md"], /it broke another component of the same system: `lamp`/);
});

test("複数: 1つだけを選んで一致させられる。読み込みは名前で選ぶ", async () => {
  const dir = specs();
  assert.deepEqual(await listComponents(dir), ["lamp", "order"]);
  await assert.rejects(loadSpecs(dir), /コンポーネントが複数あります \(lamp, order\)/);
  await assert.rejects(loadSpecs(dir, { component: "stock" }), /コンポーネント "stock" がありません/);
  assert.equal((await loadSpecs(dir, { component: "lamp" })).model?.init, "OFF");

  const out = workdir();
  const { strategy, seen } = scripted();
  const result = await implement({ specs: dir, out, strategy, component: "lamp", maxAttempts: 1 });
  assert.equal(result.status, "pass");
  assert.deepEqual([...new Set(seen.map((s) => s.component))], ["lamp"]);
  assert.deepEqual(readdirSync(join(out, "clp")).filter((name) => name.startsWith("order.")), []);
  await assert.rejects(implement({ specs: dir, out, strategy, component: "stock" }), /コンポーネント "stock" がありません/);

  // IR の出力: 複数あれば名前ごと、--component で1つ
  const compile = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [join(repoRoot, "packages/cli/src/compile.ts"), dir, ...args], { encoding: "utf8" }));
  assert.deepEqual(Object.keys(compile()), ["lamp", "order"]);
  assert.deepEqual(compile("--component", "lamp").model.states, ["OFF", "ON"]);
});
