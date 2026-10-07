import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after } from "node:test";
import { resolveLayout, workspaceOf } from "../src/layout.ts";
import { implement } from "../src/loop.ts";
import type { ImplementOptions } from "../src/loop.ts";
import type { Assignment, ImplementationStrategy } from "../src/strategy.ts";
import { typescriptTarget } from "../src/target-typescript.ts";
import { write } from "./fixtures/scripted-agent.ts";
import type { Phase, Place, Step } from "./fixtures/scripted-agent.ts";

// ループのテストで共有する道具。テストのファイルは並列に実行されるので、作業ディレクトリはファイルごとに分ける

// 出力先は packages/cli 配下に置く（verify.ts が @clp/cli/runtime を解決できる場所）
export const repoRoot = join(import.meta.dirname, "../../..");
export const specsDir = join(repoRoot, "specs");

export type Script = Partial<Record<Phase, Step[]>>;
export type Seen = { phase: Phase; dir: string; files: Record<string, string> };


// name: テストのファイルごとに違う名前（作業ディレクトリの名前になる）
export function harness(name: string) {
  const tmpRoot = join(import.meta.dirname, `.tmp-${name}`);
  mkdirSync(tmpRoot, { recursive: true });
  after(() => rmSync(tmpRoot, { recursive: true, force: true }));
  const workdir = () => mkdtempSync(join(tmpRoot, "w-"));

  // LLM の代役の Strategy。段階ごとに、呼ばれた回数に応じた成果物を書き出し、作業場所で見えたものを記録する。
  // 指定の無い段階は常に正しいものを書く
  function scripted(script: Script, extra?: (assignment: Assignment) => void, place?: Place) {
    const seen: Seen[] = [];
    const calls: Record<Phase, number> = { design: 0, wiring: 0, implementation: 0 };
    const strategy: ImplementationStrategy = {
      name: "scripted",
      run(assignment) {
        const files: Record<string, string> = {};
        for (const name of readdirSync(assignment.dir, { recursive: true }) as string[]) {
          if (name.includes(".")) files[name.split("\\").join("/")] = readFileSync(join(assignment.dir, name), "utf8");
        }
        const phase = assignment.phase as Phase;
        seen.push({ phase, dir: assignment.dir, files });
        const steps = script[phase] ?? ["correct"];
        write(phase, steps[Math.min(calls[phase]++, steps.length - 1)], assignment.dir, place);
        extra?.(assignment);
      },
    };
    return { strategy, seen };
  }

  async function run(script: Script, options: Partial<ImplementOptions> = {}, extra?: (assignment: Assignment) => void) {
    const out = workdir();
    const { strategy, seen } = scripted(script, extra);
    const result = await implement({ specs: specsDir, out, strategy, maxAttempts: 2, maxRounds: 1, ...options });
    const trail = result.attempts.map((a) => `${a.phase}:${a.feedback?.kind ?? "ok"}`);
    return { out, seen, trail, ...result };
  }
  return { tmpRoot, workdir, scripted, run };
}

export const of = (seen: Seen[], phase: Phase) => seen.filter((s) => s.phase === phase);
// 既定の配置 (<out>/src と <out>/clp)
export const defaultWorkspace = (out: string) => workspaceOf(resolveLayout({ out }), typescriptTarget.files, "order");
