import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { repoRoot, specsDir } from "./support.ts";

// README「In a directory of its own」: リポジトリの外の新しいプロジェクトから link: で使う。harness と違い、作業場所は
// packages/cli の外に置く（@clp/cli/runtime は、プロジェクトの node_modules からしか解決できない）
const root = realpathSync(mkdtempSync(join(tmpdir(), "clp-outside-")));
after(() => rmSync(root, { recursive: true, force: true }));

const pnpm = (args: string[]) => spawnSync("pnpm", args, { cwd: root, encoding: "utf8", env: { ...process.env, CLP_ALLOY: "off" } });

test("リポジトリの外の新しいプロジェクトで、clp run が合格し、clp verify が通る", () => {
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "outside",
    private: true,
    type: "module",
    dependencies: {
      "@clp/cli": `link:${join(repoRoot, "packages/cli")}`,
      "@clp/core": `link:${join(repoRoot, "packages/core")}`,
    },
  }));
  cpSync(specsDir, join(root, "specs"), { recursive: true });
  const install = pnpm(["install", "--offline"]);
  assert.equal(install.status, 0, install.stdout + install.stderr);

  const agent = `"${process.execPath}" "${join(import.meta.dirname, "fixtures/scripted-agent.ts")}"`;
  const run = pnpm(["exec", "clp", "run", "--out", ".", "--json", "--agent", agent]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /"type":"end","result":"passed"/);

  const verify = pnpm(["exec", "clp", "verify", "--out", "."]);
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  assert.match(verify.stdout, /"status":"pass"/);
});
