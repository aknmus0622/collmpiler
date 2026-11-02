import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { implement } from "../src/loop.ts";
import type { ImplementationStrategy } from "../src/strategy.ts";
import { harness, repoRoot } from "./support.ts";

// 比較の境界: 形を固定した実装を変異ゲートに通す。エージェントの書き方には左右されない
const { workdir } = harness("boundary");

test("変異ゲート: 遅れを late > 0 で判定する実装の 0 は、ちょうど 1 日遅れの返却で見つかる", async () => {
  const out = workdir();
  for (const dir of ["specs", "src", "clp"]) cpSync(join(repoRoot, "examples/lending-ts", dir), join(out, dir), { recursive: true });
  const rules = join(out, "src/library/rules.ts");
  const source = readFileSync(rules, "utf8");
  const shaped = source.replace("  return today > due ? today - due : null;\n", "  const late = today - due;\n  return late > 0 ? late : null;\n");
  assert.notEqual(shaped, source);
  writeFileSync(rules, shaped);
  const strategy: ImplementationStrategy = {
    name: "none",
    run() {
      throw new Error("the code passes: no agent is needed");
    },
  };
  const result = await implement({ specs: join(out, "specs"), out, strategy });
  assert.equal(result.status, "pass", JSON.stringify(result).slice(0, 400));
  const survivors: unknown[] = [];
  JSON.stringify(result, (key, value) => {
    if (key === "survivors") survivors.push(...(value as unknown[]));
    return value;
  });
  assert.deepEqual(survivors, []);
});
