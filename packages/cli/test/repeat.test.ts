import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkWorkspace } from "../src/check.ts";
import { extract, stableStringify } from "../src/extract.ts";
import { scrubEnv } from "../src/gates.ts";
import { generateAdapterSkeleton, generateContract, generateVerify } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { DEFAULT_GUIDE } from "../src/guide.ts";
import { resolveLayout, workspaceOf } from "../src/layout.ts";
import { loadSpecs } from "../src/loader.ts";
import { implement } from "../src/loop.ts";
import type { ImplementOptions } from "../src/loop.ts";
import { judge } from "../src/mutation.ts";
import type { MutationStrategy } from "../src/mutation.ts";
import type { StaticCheckStrategy } from "../src/static-check.ts";
import { commandStrategy } from "../src/strategy.ts";
import { typescriptTarget } from "../src/target-typescript.ts";
import type { Target } from "../src/target.ts";
import type { Assignment, ImplementationStrategy } from "../src/strategy.ts";
import { write } from "./fixtures/scripted-agent.ts";
import type { Phase, Place, Step } from "./fixtures/scripted-agent.ts";
import { defaultWorkspace, harness, of, repoRoot, specsDir, unstamped } from "./support.ts";

const { tmpRoot, workdir, scripted, run } = harness("repeat");

test("繰り返し: 何も変わっていなければ、採点だけして終わる。fresh なら設計からやり直す", async () => {
  const first = await run({}, { mutation: null });
  const again = scripted({});
  const result = await implement({ specs: specsDir, out: first.out, strategy: again.strategy, mutation: null });
  // エージェントは呼ばれない。attempt 0 は、呼ぶ前の採点
  assert.equal(result.status, "pass");
  assert.deepEqual(again.seen, []);
  assert.deepEqual(result.attempts.map((a) => [a.phase, a.attempt, a.ok]), [["implementation", 0, true]]);

  const fresh = scripted({});
  await implement({ specs: specsDir, out: first.out, strategy: fresh.strategy, mutation: null, fresh: true });
  assert.deepEqual(fresh.seen.map((s) => s.phase), ["design", "wiring", "implementation"]);
  assert.ok(!("src/order-service.ts" in fresh.seen[0].files));
  assert.equal(fresh.seen[1].files["clp/order.adapter.ts"], generateAdapterSkeleton(defaultWorkspace(first.out)));
});

// 例の仕様を写して、一部を書き換えた仕様（仕様が変わる前の版として使う）
function specVariant(file: string, from: string, to: string) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  for (const name of readdirSync(specsDir)) {
    const text = readFileSync(join(specsDir, name), "utf8");
    if (name === file) assert.ok(text.includes(from), from);
    writeFileSync(join(dir, name), unstamped(name === file ? text.replace(from, to) : text));
  }
  return dir;
}
// シルバー会員の割引が 50% だった版（fixture の "buggy" は、この版の正しい実装）
const silverFifty = () => specVariant("order.decisions.ts", '"The customer is a Silver member": { discountPercent: 5,', '"The customer is a Silver member": { discountPercent: 50,');
// 使われていない副作用が1つ多かった版（契約が違う）
const extraEffect = () => specVariant("order.component.ts", "    Refund: {},", "    Refund: {},\n    Audit: {},");

test("繰り返し: 仕様の値だけが変わったら、実装の段階だけが動く。最初の依頼に、いまのコードの不一致が載る", async () => {
  const out = workdir();
  const before = await implement({ specs: silverFifty(), out, strategy: scripted({ implementation: ["buggy"] }).strategy, maxAttempts: 1 });
  assert.equal(before.status, "pass");

  const { strategy, seen } = scripted({});
  const result = await implement({ specs: specsDir, out, strategy, maxAttempts: 1 });
  assert.equal(result.status, "pass");
  // 実装の前に、いまのコードが新しい仕様で落ちることを確かめる（赤）。それから実装（緑）
  assert.deepEqual(result.attempts.map((a) => [a.phase, a.attempt, a.feedback?.kind ?? "ok"]), [
    ["implementation", 0, "pbt"],
    ["implementation", 1, "ok"],
  ]);
  assert.deepEqual(seen.map((s) => s.phase), ["implementation"]);
  const request = seen[0].files["clp/REQUEST.md"];
  assert.match(request, /The code was written before the specification took its current form/);
  assert.match(request, /## Where the current code falls short[\s\S]*The current code failed the property-based test[\s\S]*"discountPercent": 50/);
  // 実装の段階が見るものは変わらない（アダプターとテストの口は見えない）
  assert.deepEqual(Object.keys(seen[0].files).sort(), ["clp/REQUEST.md", "clp/order.ir.json", "src/order-service.ts"]);
  assert.match(seen[0].files["src/order-service.ts"], /percent = 50/);
});

test("繰り返し: 契約が変わったら、設計から動く。すでにある本番コードを渡し、形だけを直させる", async () => {
  const out = workdir();
  assert.equal((await implement({ specs: extraEffect(), out, strategy: scripted({}).strategy, maxAttempts: 1 })).status, "pass");

  const { strategy, seen } = scripted({});
  const result = await implement({ specs: specsDir, out, strategy, maxAttempts: 1 });
  assert.equal(result.status, "pass");
  assert.deepEqual(seen.map((s) => s.phase), ["design", "wiring", "implementation"]);

  const design = of(seen, "design")[0].files;
  assert.match(design["clp/REQUEST.md"], /Production code already exists under `src\/`, but it does not yet fit the specification in\s+`clp\/order\.ir\.json`[\s\S]*\*\*Keep what exists\.\*\*/);
  assert.match(design["src/order-service.ts"], /percent = 5/);
  const wiring = of(seen, "wiring")[0].files;
  assert.match(wiring["clp/REQUEST.md"], /already existed before the interface took its current form/);
  assert.ok(!wiring["clp/order.adapter.contract.ts"].includes("Audit"));
  // 配線の段階は、前回のアダプターから始める
  assert.match(wiring["clp/order.adapter.ts"], /new OrderService\(/);
});

test("繰り返し: 形を直す必要が無く、いまのコードで満たされていれば、配線のあとは何もしない", async () => {
  const out = workdir();
  assert.equal((await implement({ specs: extraEffect(), out, strategy: scripted({}).strategy, maxAttempts: 1 })).status, "pass");

  // 設計の段階は実装済みのコードを残す。未実装の部分が無いので、配線のあとに合格してもよい（赤を求めない）
  const { strategy, seen } = scripted({ design: ["kept"] });
  const result = await implement({ specs: specsDir, out, strategy, maxAttempts: 1 });
  assert.equal(result.status, "pass");
  assert.deepEqual(seen.map((s) => s.phase), ["design", "wiring"]);
  assert.deepEqual(result.attempts.map((a) => [a.phase, a.attempt, a.ok]), [["design", 1, true], ["wiring", 1, true], ["implementation", 0, true]]);
});

test("繰り返し: 直しきれなくても、すでにあった本番コードは捨てない (何も無いところから作ったときは捨てる)", async () => {
  const out = workdir();
  assert.equal((await implement({ specs: silverFifty(), out, strategy: scripted({ implementation: ["buggy"] }).strategy, maxAttempts: 1 })).status, "pass");

  // 新しい仕様 (5%) に対して、50% のままの実装しか書けないエージェント
  const { strategy, seen } = scripted({ implementation: ["buggy"] });
  const result = await implement({ specs: specsDir, out, strategy, maxAttempts: 1, maxRounds: 2 });
  assert.equal(result.status, "fail");
  // やり直しの周は設計から始まるが、前の周の本番コードが渡る
  assert.deepEqual(seen.map((s) => s.phase), ["implementation", "design", "wiring", "implementation"]);
  assert.ok("src/order-service.ts" in of(seen, "design")[0].files);
  assert.ok(existsSync(join(out, "src/order-service.ts")));
});
