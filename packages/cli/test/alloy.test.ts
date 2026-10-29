import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ALLOY_SHA256, alloyJar, checkWithAlloy, emitAlloy, isPinnedJar, javaAvailable } from "../src/v1/alloy.ts";
import { compile, loadProgram } from "../src/v1/load.ts";
import { repoRoot } from "./support.ts";

// The Alloy checker (DSL.md §17.20). What is written for Alloy is compared with the expected modules, so a change in
// how the IR is written shows here without Java; Alloy itself runs on one small component when Java and the jar are
// at hand. After an intended change: CLP_UPDATE_ALLOY=1 node --test packages/cli/test/alloy.test.ts, then read the diff.

const EXPECTED = join(import.meta.dirname, "fixtures/alloy");
const update = process.env.CLP_UPDATE_ALLOY === "1";
const SPECS = ["examples/checkout-ts/specs", "examples/library-ts/specs", "examples/lending-ts/specs", "examples/todo-ts/specs", "examples/todo-db-ts/specs", "packages/cli/self/specs"];
const label = (dir: string) => (dir.startsWith("packages/cli/self") ? "self" : dir.split("/")[1]);

function expect(file: string, actual: string) {
  const path = join(EXPECTED, file);
  if (update) {
    mkdirSync(EXPECTED, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.ok(existsSync(path), `${file} がありません (CLP_UPDATE_ALLOY=1 で作る)`);
  assert.equal(actual, readFileSync(path, "utf8"), `${file} が変わりました (意図した変更なら CLP_UPDATE_ALLOY=1 で更新する)`);
}

test("Alloy: 例と self の部品ごとに、何を確かめるか (飛ばす理由、命令の数) と、書き出す模型", () => {
  const lines: string[] = [];
  for (const dir of SPECS) {
    for (const component of loadProgram(join(repoRoot, dir)).components) {
      const { ir } = compile(join(repoRoot, dir), component);
      assert.ok(ir, `${dir} ${component}`);
      const emitted = emitAlloy(ir);
      const kinds = Object.entries(emitted.commands.reduce<Record<string, number>>((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {}))
        .sort()
        .map(([k, n]) => `${k} ${n}`)
        .join(", ");
      lines.push(`${label(dir)} ${component}: commands: ${kinds || "none"}${emitted.skipped.length ? `; skipped: ${emitted.skipped.join(" / ")}` : ""}`);
      if (emitted.commands.length > 0) expect(`${label(dir)}-${component}.als`, emitted.text);
    }
  }
  expect("coverage.txt", `${lines.join("\n")}\n`);
});

test("Alloy の jar: 固定したハッシュと違う jar は、その jar と分かる。CLP_ALLOY_JAR はそのまま使う (違えば警告)", () => {
  const dir = mkdtempSync(join(tmpdir(), "clp-jar-"));
  try {
    const fake = join(dir, "fake.jar");
    writeFileSync(fake, "not alloy");
    assert.equal(isPinnedJar(fake), false);
    const before = process.env.CLP_ALLOY_JAR;
    process.env.CLP_ALLOY_JAR = fake;
    try {
      assert.equal(alloyJar(), fake);
    } finally {
      if (before === undefined) delete process.env.CLP_ALLOY_JAR;
      else process.env.CLP_ALLOY_JAR = before;
    }
    assert.match(ALLOY_SHA256, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Alloy を実際に動かす: 問い合わせだけの部品は、答えのどの場合にも当たる入力があることを、すべての入力で確かめる", (t) => {
  const jar = process.env.CLP_ALLOY_JAR ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp", "alloy-6.2.0.jar");
  if (!javaAvailable() || !existsSync(jar)) return t.skip("Java か Alloy の jar がありません");
  const { ir } = compile(join(repoRoot, "packages/cli/self/specs"), "checker-verdict");
  const saved = process.env.CLP_ALLOY_JAR;
  process.env.CLP_ALLOY_JAR = jar;
  try {
    const result = checkWithAlloy(ir!);
    assert.equal(result.verdicts.length, 6);
    for (const verdict of result.verdicts) assert.deepEqual([verdict.kind, verdict.status, verdict.bound], ["reach", "reached", "exhaustive"], verdict.what);
  } finally {
    if (saved === undefined) delete process.env.CLP_ALLOY_JAR;
    else process.env.CLP_ALLOY_JAR = saved;
  }
});

test("Alloy を実際に動かす: lending の会員 (到達の検査 3 つ)", (t) => {
  const jar = process.env.CLP_ALLOY_JAR ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp", "alloy-6.2.0.jar");
  if (!javaAvailable() || !existsSync(jar)) return t.skip("Java か Alloy の jar がありません");
  const { ir } = compile(join(repoRoot, "examples/lending-ts/specs"), "members");
  const cache = mkdtempSync(join(tmpdir(), "clp-alloy-cache-"));
  const saved = { jar: process.env.CLP_ALLOY_JAR, cache: process.env.XDG_CACHE_HOME };
  process.env.CLP_ALLOY_JAR = jar;
  process.env.XDG_CACHE_HOME = cache;
  try {
    const result = checkWithAlloy(ir!);
    assert.deepEqual(result.skipped ?? [], []);
    assert.equal(result.verdicts.length, 3);
    for (const verdict of result.verdicts) assert.equal(verdict.status, "reached", JSON.stringify(verdict));
    // the result is cached under the module written
    assert.equal(readdir(join(cache, "clp", "alloy-results")).length, 1);
  } finally {
    for (const [key, value] of [["CLP_ALLOY_JAR", saved.jar], ["XDG_CACHE_HOME", saved.cache]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(cache, { recursive: true, force: true });
  }
});

const readdir = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);
