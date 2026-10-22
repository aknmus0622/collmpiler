import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { implement } from "../src/loop.ts";
import type { Assignment, ImplementationStrategy } from "../src/strategy.ts";
import { compile as compileSpec, loadProgram } from "../src/v1/load.ts";
import { write } from "./fixtures/scripted-agent8.ts";
import type { Phase, Step } from "./fixtures/scripted-agent8.ts";
import { harness, repoRoot, restamp, specsDir } from "./support8.ts";

// 複数のコンポーネント: 同じ本番コードを共有し、テスト側のファイルはコンポーネントごとに持つ

const { tmpRoot, workdir } = harness("components8");

// 2つ目のコンポーネント（ランプ）。すべてコードで書いてあり、解釈は要らない
const LAMP = `import { external, init, service } from "@clp/core/v1";
export const Panel = external("The panel that shows whether the lamp is on.", { commands: { Notify(on: boolean) {} } });
export const Lamp = service("A lamp, flipped on and off.", {
  state: { on: init<boolean>(false) },
  commands: {
    Flip() {
      Panel.Notify(!this.on);
      this.on = !this.on;
    },
  },
  queries: { IsOn() { return this.on; } },
});
`;

// 例の仕様 (注文) に、ランプを足した仕様。edit で注文の側を書き換えられる
function specs(edit: (name: string, text: string) => string = (_name, text) => text, lamp = LAMP) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  for (const name of readdirSync(specsDir)) writeFileSync(join(dir, name), edit(name, readFileSync(join(specsDir, name), "utf8")));
  writeFileSync(join(dir, "lamp.component.ts"), lamp);
  restamp(dir);
  return dir;
}

// notifiesNew: 切り替えたあとの状態を通知する（いまの仕様）。false なら、切り替える前の状態を通知する（古い仕様）
const lampSource = (implemented: boolean, notifiesNew = true) => `export class Lamp {
  on = false;
  private notify: (on: boolean) => void;

  constructor(notify: (on: boolean) => void) {
    this.notify = notify;
  }

  /** The Flip command. */
  flip(): void {
${implemented ? (notifiesNew ? "    this.on = !this.on;\n    this.notify(this.on);" : "    this.notify(this.on);\n    this.on = !this.on;") : `    throw new Error("not implemented");`}
  }
}
`;
const LAMP_ADAPTER = `import type { TargetSystemAdapter } from "./lamp.adapter.contract.ts";
import { Lamp } from "../src/lamp.ts";

let lamp: Lamp | undefined;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    lamp = new Lamp((on) => ports.panel.Notify({ on }));
  },
  async teardownIsolation() {
    lamp = undefined;
  },
  async executeCommand() {
    lamp?.flip();
  },
  async executeQuery() {
    return lamp?.on ?? false;
  },
};
`;

type Seen = { component: string; phase: Phase; files: Record<string, string> };

// LLM の代役。どのコンポーネントの依頼かを、依頼文と渡された契約から見分けて書き分ける。
// order: 注文の実装の段階で、試行ごとに書くもの。breakLamp: 注文の実装のついでに、ランプを壊す試行の番号。
// silentLamp: ランプが、切り替える前の状態を通知する実装を書く（古い仕様の実装）。touchOrder: ランプの実装のついでに、注文のコードを書き換える試行の番号
function scripted(options: { order?: Step[]; breakLamp?: number[]; silentLamp?: boolean; touchOrder?: number[] } = {}) {
  const seen: Seen[] = [];
  let orderImplementations = 0;
  let lampImplementations = 0;
  const strategy: ImplementationStrategy = {
    name: "scripted",
    run({ dir, phase: rawPhase }: Assignment) {
      const phase = rawPhase as Phase;
      const files: Record<string, string> = {};
      for (const name of readdirSync(dir, { recursive: true }) as string[]) {
        // 道具のためのファイル（型定義）は除く
        if (name.includes(".") && !name.startsWith("node_modules")) files[name] = readFileSync(join(dir, name), "utf8");
      }
      const component =
        phase === "wiring"
          ? "clp/lamp.adapter.contract.ts" in files ? "lamp" : "order"
          : /`clp\/lamp\.ir\.json`/.test(files["clp/REQUEST.md"].split("## Other components")[0]) ? "lamp" : "order";
      seen.push({ component, phase, files });

      if (component === "lamp") {
        mkdirSync(join(dir, "src"), { recursive: true });
        if (phase === "wiring") writeFileSync(join(dir, "clp/lamp.adapter.ts"), LAMP_ADAPTER);
        else writeFileSync(join(dir, "src/lamp.ts"), lampSource(phase === "implementation", !options.silentLamp));
        if (phase === "implementation" && options.touchOrder?.includes(++lampImplementations)) {
          const file = join(dir, "src/order-service.ts");
          writeFileSync(file, readFileSync(file, "utf8").replace("export class", "// tidied up while working on the lamp\nexport class"));
        }
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
    "lamp.adapter.contract.ts", "lamp.adapter.ts", "lamp.ir.json", "lamp.verified.json", "lamp.verify.ts",
    "order.adapter.contract.ts", "order.adapter.ts", "order.ir.json", "order.verified.json", "order.verify.ts",
  ]);
  assert.deepEqual(Object.keys(result.seeds).sort(), ["lamp", "order"]);

  const at = (component: string, phase: Phase) => seen.find((s) => s.component === component && s.phase === phase)!.files;
  // 設計と実装の段階には、ほかのコンポーネントの仕様と、すでにある本番コードが渡る
  const design = at("order", "design");
  assert.deepEqual(Object.keys(design).sort(), ["clp/REQUEST.md", "clp/lamp.ir.json", "clp/lamp.spec.md", "clp/order.ir.json", "clp/order.spec.md", "src/lamp.ts"]);
  assert.match(design["clp/REQUEST.md"], /## Other components of the same system[\s\S]*- `clp\/lamp\.ir\.json`/);
  assert.match(design["clp/REQUEST.md"], /Production code already exists under `src\/`/);
  // 配線の段階には、どの仕様も、ほかのコンポーネントのテスト側も渡らない
  assert.deepEqual(Object.keys(at("order", "wiring")).sort(), [
    "clp/REQUEST.md", "clp/order.adapter.contract.ts", "clp/order.adapter.ts", "src/lamp.ts", "src/order-service.ts",
  ]);
  assert.ok(!at("order", "wiring")["clp/REQUEST.md"].includes("Other components"));
  // 最初のコンポーネントは、何も無いところから作る
  assert.match(at("lamp", "design")["clp/REQUEST.md"], /^# Step 1 of 3[\s\S]*Design the production code for the component specified in `clp\/lamp\.ir\.json`/);
  assert.deepEqual(Object.keys(at("lamp", "design")).sort(), ["clp/REQUEST.md", "clp/lamp.ir.json", "clp/lamp.spec.md", "clp/order.ir.json", "clp/order.spec.md"]);
});

test("複数: あるコンポーネントのための変更が、ほかのコンポーネントを壊したら差し戻す (回帰)", async () => {
  const out = workdir();
  // 注文の仕様が、シルバー会員 50% だった版から始める
  const before = specs((name, text) => (name === "order.component.ts" ? text.replace("{ discountPercent: 5,", "{ discountPercent: 50,") : text));
  assert.equal((await implement({ specs: before, out, strategy: scripted({ order: ["buggy"] }).strategy, maxAttempts: 1 })).status, "pass");

  // 前の仕様のディレクトリは消しておく（出力先のテストの入口が古い場所を指したままでも、回帰の確認が動くこと）
  rmSync(before, { recursive: true });

  // 仕様を 5% に戻す。注文の実装を直すついでに、1回目はランプの通知を、切り替える前の状態にしてしまう
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
  assert.deepEqual(feedback.result?.status === "fail" && feedback.result.expected, { state: null, effects: [{ port: "panel.Notify", args: { on: true } }] });
  assert.match(seen[1].files["clp/REQUEST.md"], /it broke another component of the same system: `lamp`/);
});

test("範囲: ほかのコンポーネントだけが使っているコードを書き換えたら、元に戻して差し戻す。ミューテーションは、実行した範囲だけ", async () => {
  const out = workdir();
  // ランプが、切り替える前の状態を通知する仕様だった版から始める（外の世界とのつながりは同じ）
  const silent = LAMP.replace("Panel.Notify(!this.on);", "Panel.Notify(this.on);");
  assert.notEqual(silent, LAMP);
  const first = await implement({ specs: specs(undefined, silent), out, strategy: scripted({ silentLamp: true }).strategy, maxAttempts: 1 });
  assert.equal(first.status, "pass");
  const order = readFileSync(join(out, "src/order-service.ts"), "utf8");

  // ランプが、切り替えたあとの状態を通知する仕様に変える。ランプの実装を直すついでに、1回目は注文のコードにも手を入れてしまう
  const { strategy, seen } = scripted({ touchOrder: [1] });
  const result = await implement({ specs: specs(), out, strategy, maxAttempts: 2 });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.attempts.map((a) => `${a.component}:${a.phase}:${a.attempt}:${a.feedback?.kind ?? "ok"}`), [
    "lamp:implementation:0:pbt",
    "lamp:implementation:1:check",
    "lamp:implementation:2:ok",
    "order:implementation:0:ok",
  ]);
  const feedback = result.attempts[1].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => [v.file, v.rule]), [["src/order-service.ts", "out-of-scope"]]);
  // 次の試行には、元に戻した注文のコードが渡り、理由が伝わる
  assert.equal(seen[1].files["src/order-service.ts"], order);
  assert.match(seen[1].files["clp/REQUEST.md"], /the tests of this component never execute it, and another component uses it/);
  assert.equal(readFileSync(join(out, "src/order-service.ts"), "utf8"), order);

  // ミューテーション: ランプの検証では、ランプが実行したコードだけを壊す（注文のコードは対象にならない）。
  // 範囲を絞れているので、「1つも検出されなければ不合格」の基準も使える
  const lamp = result.attempts[2].mutation!;
  assert.ok(lamp.mutants > 0 && lamp.mutants < 5, `lamp mutants: ${lamp.mutants}`);
  assert.equal(lamp.killed, lamp.mutants);
  const orderRun = result.attempts[3].mutation!;
  assert.ok(orderRun.mutants > lamp.mutants);
  assert.ok(orderRun.survivors.every((survivor) => survivor.file === "src/order-service.ts"));
});

test("複数: 1つだけを選んで一致させられる。読み込みは名前で選ぶ", async () => {
  const dir = specs();
  assert.deepEqual(loadProgram(dir).components, ["lamp", "order"]);
  assert.throws(() => compileSpec(dir, undefined), /コンポーネントが複数あります \(lamp, order\)/);
  assert.throws(() => compileSpec(dir, "stock"), /コンポーネント "stock" がありません/);
  assert.deepEqual(compileSpec(dir, "lamp").ir?.components.lamp.init, { on: false });

  const out = workdir();
  const { strategy, seen } = scripted();
  const result = await implement({ specs: dir, out, strategy, component: "lamp", maxAttempts: 1 });
  assert.equal(result.status, "pass");
  assert.deepEqual([...new Set(seen.map((s) => s.component))], ["lamp"]);
  assert.deepEqual(readdirSync(join(out, "clp")).filter((name) => name.startsWith("order.")), []);
  await assert.rejects(implement({ specs: dir, out, strategy, component: "stock" }), /コンポーネント "stock" がありません/);

  // IR の出力: 複数あれば名前ごと、--component で1つ
  const compile = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [join(repoRoot, "packages/cli/bin/clp.ts"), "compile", dir, ...args], { encoding: "utf8" }));
  assert.deepEqual(Object.keys(compile()), ["lamp", "order"]);
  assert.deepEqual(compile("--component", "lamp").components.lamp.state, { on: "bool" });
});
